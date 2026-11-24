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

function routeFromHash(hash: string): Route {
  if (hash.startsWith("#/check")) return "check";
  if (hash.startsWith("#/results")) return "results";
  if (hash.startsWith("#/report")) return "report";
  if (hash.startsWith("#/twin")) return "twin";
  return "landing";
}

/** The header link that matches the page: the check, a home-page section opened by its link, or home. */
function headerCurrent(route: string): NavTarget | undefined {
  if (route === "check") return "check";
  if (route !== "landing") return undefined;
  const section = /^#\/(model|clauses|faq)$/.exec(window.location.hash)?.[1];
  return (section as NavTarget | undefined) ?? "home";
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

function ScreenLoading() {
  return (
    <div className="screen-loading" role="status">
      جارٍ التحميل
    </div>
  );
}

export default function App() {
  const stored = useMemo(loadStoredState, []);
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  const [activityId, setActivityId] = useState<ActivityId>(stored.activityId);
  const [facility, setFacility] = useState<FacilityDetails>(stored.facility);
  const [autoSample, setAutoSample] = useState<SampleId | undefined>(() => sampleFromHash(window.location.hash));
  const [run, setRun] = useState<ComplianceRun>();
  const [toast, setToast] = useState("");
  const [pendingSection, setPendingSection] = useState<string | undefined>(() => sectionFromHash(window.location.hash));
  /* Where «العودة» in the twin studio leads: the last page visited inside the site. */
  const returnRoute = useRef<Route>("landing");
  useEffect(() => {
    if (route !== "twin") returnRoute.current = route;
  }, [route]);

  useEffect(() => {
    const onHashChange = () => {
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

  /* Results and report need a finished run in memory (a refresh loses it). Replace the history entry
     instead of adding one, so the back button still leads out of the check page. */
  useEffect(() => {
    if ((route === "results" || route === "report") && !run) {
      window.history.replaceState(null, "", ROUTE_HASH.check);
      setRoute("check");
    }
  }, [route, run]);

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

  const changeActivity = (next: ActivityId) => {
    setActivityId(next);
    setFacility(getDefaultFacility(next));
  };

  const startCheck = () => {
    setAutoSample(undefined);
    go("check");
  };

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
      {route !== "twin" && <SiteHeader current={headerCurrent(route)} onNavigate={navigate} />}

      {route === "landing" && <Landing onStart={startCheck} onSample={startSample} onTwin={() => go("twin")} />}

      {route === "check" && (
        <Check
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
          <Report run={run} onBack={() => go("results")} onHome={() => go("landing")} notify={setToast} />
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
            onClose={() => go(returnRoute.current)}
          />
        </Suspense>
      )}

      {route !== "twin" && <SiteFooter onNavigate={navigate} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
