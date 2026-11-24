import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activityExamples,
  defaultFacility,
  getDefaultFacility,
  type ActivityId,
  type FacilityDetails,
} from "./data";
import type { ComplianceRun } from "./ifc/types";
import { SAMPLE_FILES, type SampleId } from "./content/samples";
import Landing from "./screens/Landing";
import { SiteHeader, type NavTarget } from "./site/SiteHeader";
import { SiteFooter } from "./site/SiteFooter";
import Check from "./screens/Check";
import { runIfcCompliance } from "./ifc/pipeline";
import { loadLastCheck } from "./app/lastCheck";

/* The results and report screens pull in the 3D viewer and web-ifc, so they load on demand. */
const Results = lazy(() => import("./screens/Results"));
const Report = lazy(() => import("./screens/Report"));
/* The digital twin studio: illustrative venue scenes and engineering networks (not a compliance result). */
const EngineeringTwinStudio = lazy(() =>
  import("./components/EngineeringTwinStudio").then((module) => ({ default: module.EngineeringTwinStudio })),
);

type Route = "landing" | "check" | "results" | "report" | "twin";

const STORAGE_KEY = "mowaem-plan-compliance-v2";

const ROUTE_HASH: Record<Route, string> = {
  landing: "#/",
  check: "#/check",
  results: "#/results",
  report: "#/report",
  twin: "#/twin",
};

/* The browser tab's title for each page. */
const TITLES: Record<Route, string> = {
  landing: "موائم: الفحص المسبق للمخططات الهندسية",
  check: "الفحص المسبق | موائم",
  results: "نتائج الفحص | موائم",
  report: "تقرير الفحص | موائم",
  twin: "استوديو التوأم الرقمي | موائم",
};

/** Hashes the site answers to; anything else is replaced with the home page's. */
function isKnownHash(hash: string): boolean {
  if (hash === "" || hash === "#" || hash === "#/") return true;
  if (/^#\/(check|results|report|twin)(\?.*)?$/.test(hash)) return true;
  return sectionFromHash(hash) !== undefined;
}

function initialRoute(): Route {
  if (!isKnownHash(window.location.hash)) window.history.replaceState(null, "", "#/");
  return routeFromHash(window.location.hash);
}

function routeFromHash(hash: string): Route {
  if (hash.startsWith("#/check")) return "check";
  if (hash.startsWith("#/results")) return "results";
  if (hash.startsWith("#/report")) return "report";
  if (hash.startsWith("#/twin")) return "twin";
  return "landing";
}

/** "#/how", "#/clauses", "#/model", "#/faq": the landing page scrolled to that section (shareable links). */
function sectionFromHash(hash: string): string | undefined {
  const match = /^#\/(how|clauses|model|faq)$/.exec(hash);
  return match ? `home-${match[1]}` : undefined;
}

/** "#/check?sample=tiles" opens the check page on its review step with that ready sample chosen; the visitor starts the check. */
function sampleFromHash(hash: string): SampleId | undefined {
  const query = hash.split("?")[1];
  if (!query) return undefined;
  const id = new URLSearchParams(query).get("sample");
  return SAMPLE_FILES.find((sample) => sample.id === id)?.id;
}

function loadStoredState(): { facility: FacilityDetails; activityId: ActivityId } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { facility: defaultFacility, activityId: "restaurant" };
    const parsed = JSON.parse(raw) as Partial<{ facility: FacilityDetails; activityId: ActivityId }>;
    const activityId = activityExamples.some((example) => example.id === parsed.activityId)
      ? (parsed.activityId as ActivityId)
      : "restaurant";
    return {
      activityId,
      facility: { ...getDefaultFacility(activityId), ...(parsed.facility ?? {}) },
    };
  } catch {
    return { facility: defaultFacility, activityId: "restaurant" };
  }
}

function ScreenLoading({ text = "جارٍ التحميل" }: { text?: string }) {
  return (
    <div className="screen-loading" role="status">
      {text}
    </div>
  );
}

/* Home-page sections the header links to, in page order, for marking the link of the section in view. */
const SPY: [string, NavTarget][] = [
  ["home-model", "model"],
  ["home-clauses", "clauses"],
  ["home-faq", "faq"],
];

export default function App() {
  const stored = useMemo(loadStoredState, []);
  const [route, setRoute] = useState<Route>(initialRoute);
  const [activityId, setActivityId] = useState<ActivityId>(stored.activityId);
  const [facility, setFacility] = useState<FacilityDetails>(stored.facility);
  const [autoSample, setAutoSample] = useState<SampleId | undefined>(() => sampleFromHash(window.location.hash));
  const [run, setRun] = useState<ComplianceRun>();
  const [toast, setToast] = useState("");
  const [pendingSection, setPendingSection] = useState<string | undefined>(() => sectionFromHash(window.location.hash));
  /* Rebuilding the last check after a reload of the results or the report. */
  const [restoring, setRestoring] = useState(false);
  /* A new check starts from a fresh wizard. */
  const [checkKey, setCheckKey] = useState(0);
  /* The home-page section in view, for the header. */
  const [section, setSection] = useState<NavTarget>("home");
  /* The page before this one, so «العودة» can step back through history instead of adding to it. */
  const lastRoute = useRef<Route>(route);
  const previousRoute = useRef<Route | undefined>(undefined);
  useEffect(() => {
    if (lastRoute.current === route) return;
    previousRoute.current = lastRoute.current;
    lastRoute.current = route;
  }, [route]);
  /* Where «العودة» in the twin studio leads: the last page visited inside the site. */
  const returnRoute = useRef<Route>("landing");
  useEffect(() => {
    if (route !== "twin") returnRoute.current = route;
  }, [route]);

  useEffect(() => {
    const onHashChange = () => {
      if (!isKnownHash(window.location.hash)) window.history.replaceState(null, "", "#/");
      const next = routeFromHash(window.location.hash);
      if (next === "check") {
        const sample = sampleFromHash(window.location.hash);
        if (sample) setAutoSample(sample);
      }
      const section = sectionFromHash(window.location.hash);
      if (next === "landing" && section) setPendingSection(section);
      setRoute(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: Route) => {
    if (window.location.hash !== ROUTE_HASH[next]) {
      window.location.hash = ROUTE_HASH[next];
    }
    setRoute(next);
  }, []);

  /* Results and report need a finished run. After a reload, run the last check again from the copy kept
     on this device (src/app/lastCheck.ts); without one, go to a new check and say why. The history entry
     is replaced, so the back button still leads out of the check page. */
  useEffect(() => {
    if (!(route === "results" || route === "report") || run) return;
    let cancelled = false;
    setRestoring(true);
    void (async () => {
      const saved = await loadLastCheck();
      let restored: ComplianceRun | undefined;
      if (saved) {
        try {
          restored = await runIfcCompliance({ upload: saved.upload, activityId: saved.activityId, facility: saved.facility });
        } catch {
          restored = undefined;
        }
      }
      if (cancelled) return;
      setRestoring(false);
      if (restored) {
        setRun(restored);
        return;
      }
      window.history.replaceState(null, "", ROUTE_HASH.check);
      setRoute("check");
      setToast("لا توجد نتائج محفوظة على هذا الجهاز. اختر الملف وابدأ فحصًا جديدًا.");
    })();
    return () => {
      cancelled = true;
    };
  }, [route, run]);

  useEffect(() => {
    const file = route === "report" && run ? `: ${run.file.name}` : "";
    document.title = route === "report" ? `تقرير الفحص${file} | موائم` : TITLES[route];
  }, [route, run]);

  /* Which home-page section is in view: the header marks its link (or «الرئيسية» above them). */
  useEffect(() => {
    if (route !== "landing") return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let current: NavTarget = "home";
      for (const [id, target] of SPY) {
        const box = document.getElementById(id)?.getBoundingClientRect();
        if (box && box.top <= line && box.bottom > line) current = target;
      }
      setSection(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [route]);

  useEffect(() => {
    if (!pendingSection) window.scrollTo({ top: 0 });
    // Only on route changes; a pending section scroll handles its own position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ facility, activityId }));
    } catch {
      // Storage can be unavailable in private modes; the session continues without it.
    }
  }, [activityId, facility]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  /* A new activity brings its defaults, but keeps the area the visitor typed. */
  const changeActivity = (next: ActivityId) => {
    setActivityId(next);
    setFacility((previous) => ({ ...getDefaultFacility(next), area: previous.area }));
  };

  const startCheck = () => {
    setAutoSample(undefined);
    setCheckKey((key) => key + 1);
    go("check");
  };

  /* «العودة»: step back through history when the page before was the target, so Back does not loop. */
  const back = (target: Route) => {
    if (previousRoute.current === target && window.history.length > 1) window.history.back();
    else go(target);
  };

  const headerCurrent: NavTarget | undefined = route === "check" ? "check" : route === "landing" ? section : undefined;
  /* The wizard stays mounted (hidden) while the twin studio is open from it, so its file and step survive. */
  const keepCheck = route === "check" || (route === "twin" && returnRoute.current === "check");

  /* Header and footer links: landing sections scroll into view (after the landing page renders). */
  const navigate = (target: NavTarget) => {
    if (target === "check") return startCheck();
    if (target === "twin") return go("twin");
    if (target === "home") {
      go("landing");
      window.scrollTo({ top: 0 });
      return;
    }
    const hash = `#/${target}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute("landing");
    setPendingSection(`home-${target}`);
  };

  useEffect(() => {
    if (route !== "landing" || !pendingSection) return;
    const id = pendingSection;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: "start" });
        target.focus({ preventScroll: true });
      }
      setPendingSection(undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingSection, route]);

  const startSample = (id: SampleId) => {
    if (activityId !== "restaurant") changeActivity("restaurant");
    setAutoSample(id);
    go("check");
  };

  return (
    <div className="app" dir="rtl" lang="ar">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          const main = document.querySelector<HTMLElement>("main");
          if (!main) return;
          main.setAttribute("tabindex", "-1");
          main.focus();
        }}
      >
        تخطي إلى المحتوى
      </a>
      {route !== "twin" && <SiteHeader current={headerCurrent} onNavigate={navigate} />}

      {route === "landing" && <Landing onStart={startCheck} onSample={startSample} onTwin={() => go("twin")} />}

      {keepCheck && (
        <div className="app__screen" hidden={route !== "check"}>
        <Check
          key={checkKey}
          activityId={activityId}
          facility={facility}
          onActivityChange={changeActivity}
          onFacilityChange={setFacility}
          autoSample={autoSample}
          onDone={(nextRun) => {
            setAutoSample(undefined);
            setRun(nextRun);
            go("results");
          }}
          onHome={() => go("landing")}
          onTwin={() => go("twin")}
        />
        </div>
      )}

      {(route === "results" || route === "report") && !run && restoring && (
        <ScreenLoading text="جارٍ استعادة نتائج الفحص الأخير" />
      )}

      {route === "results" && run && (
        <Suspense fallback={<ScreenLoading />}>
          <Results
            run={run}
            onReport={() => go("report")}
            onNew={startCheck}
            onHome={() => go("landing")}
            onTwin={() => go("twin")}
            notify={setToast}
          />
        </Suspense>
      )}

      {route === "report" && run && (
        <Suspense fallback={<ScreenLoading />}>
          <Report run={run} onBack={() => back("results")} onHome={() => go("landing")} notify={setToast} />
        </Suspense>
      )}

      {route === "twin" && (
        <Suspense fallback={<ScreenLoading />}>
          <EngineeringTwinStudio
            projectName={run ? run.facility.projectName : facility.projectName}
            activityName={facility.activity}
            activityId={run ? run.activityId : activityId}
            floors={run ? run.facility.floors : facility.floors}
            findingsCount={run ? run.findings.filter((finding) => finding.status === "fail").length : 0}
            onClose={() => back(returnRoute.current)}
          />
        </Suspense>
      )}

      {route !== "twin" && <SiteFooter onNavigate={navigate} onSample={startSample} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
