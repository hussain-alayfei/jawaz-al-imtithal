import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  activityExamples,
  defaultFacility,
  getDefaultFacility,
  type ActivityId,
  type FacilityDetails,
} from "./data";
import type { ComplianceRun } from "./ifc/types";
import type { SampleId } from "./content/samples";
import Landing from "./screens/Landing";
import Check from "./screens/Check";

/* The results and report screens pull in the 3D viewer and web-ifc, so they load on demand. */
const Results = lazy(() => import("./screens/Results"));
const Report = lazy(() => import("./screens/Report"));

type Route = "landing" | "check" | "results" | "report";

const STORAGE_KEY = "mowaem-plan-compliance-v2";

const ROUTE_HASH: Record<Route, string> = {
  landing: "#/",
  check: "#/check",
  results: "#/results",
  report: "#/report",
};

function routeFromHash(hash: string): Route {
  if (hash.startsWith("#/check")) return "check";
  if (hash.startsWith("#/results")) return "results";
  if (hash.startsWith("#/report")) return "report";
  return "landing";
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
  const [autoSample, setAutoSample] = useState<SampleId>();
  const [run, setRun] = useState<ComplianceRun>();
  const [toast, setToast] = useState("");

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: Route) => {
    if (window.location.hash !== ROUTE_HASH[next]) {
      window.location.hash = ROUTE_HASH[next];
    }
    setRoute(next);
  }, []);

  /* Results and report need a finished run in memory; without one, send the visitor to a new check. */
  useEffect(() => {
    if ((route === "results" || route === "report") && !run) go("check");
  }, [go, route, run]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
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

  const startSample = (id: SampleId) => {
    if (activityId !== "restaurant") changeActivity("restaurant");
    setAutoSample(id);
    go("check");
  };

  return (
    <div className="app" dir="rtl" lang="ar">
      {route === "landing" && <Landing onStart={startCheck} onSample={startSample} />}

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
        />
      )}

      {route === "results" && run && (
        <Suspense fallback={<ScreenLoading />}>
          <Results
            run={run}
            onReport={() => go("report")}
            onNew={startCheck}
            onHome={() => go("landing")}
            notify={setToast}
          />
        </Suspense>
      )}

      {route === "report" && run && (
        <Suspense fallback={<ScreenLoading />}>
          <Report run={run} onBack={() => go("results")} onHome={() => go("landing")} notify={setToast} />
        </Suspense>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
