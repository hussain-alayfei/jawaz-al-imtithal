import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Copy, Info } from "lucide-react";
import { Button, IconButton, StatusGlyph, StatusMark } from "../brand/ui";
import { copy } from "../content/copy";
import type { Finding } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { ResultsProps } from "./types";
import { Bidi } from "./results/Bidi";
import { Measure } from "./results/Measure";
import { ViewerBoundary } from "./results/ViewerBoundary";
import {
  actionOf,
  citationOf,
  clauseOf,
  defaultFinding,
  elementOf,
  groupFindings,
  isDataCheck,
  referenceOf,
  scopeOf,
  splitValue,
  stepIdOf,
  tallyOf,
} from "./results/findings";
import "./results.css";

/* Both viewers pull in three.js, so they load after the register is on screen. */
const IfcModelViewer = lazy(() => import("../components/IfcModelViewer"));
/* The procedural scene for the older MOWAEM-IFC-1.0 contract files, which carry no geometry. */
const Viewer3D = lazy(() => import("../components/Viewer3D").then((module) => ({ default: module.Viewer3D })));

/* Local strings (missing from copy.ts). */
const L = {
  pageTitle: "نتائج الفحص",
  tabModel: "النموذج",
  tabRegister: "البنود",
  tabsLabel: "عرض النتائج",
  counts: "النتائج حسب الحالة",
  modelLoading: "جارٍ تجهيز النموذج ثلاثي الأبعاد",
  noModel: "لا يتوفر نموذج ثلاثي الأبعاد لهذا الملف.",
  viewerFailed: "تعذر عرض النموذج ثلاثي الأبعاد في هذا المتصفح. النتائج في السجل كاملة.",
  copyGuid: "نسخ معرّف العنصر",
  copied: "تم نسخ معرّف العنصر.",
  copyFailed: "تعذر النسخ تلقائيًا. حدّد المعرّف وانسخه يدويًا.",
  newTab: "يفتح في نافذة جديدة",
  showInModel: "عرض العنصر في النموذج",
  checkDescription: "وصف الفحص",
} as const;

const COMPACT_QUERY = "(max-width: 860px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const rowId = (ruleId: string) => `rs-row-${ruleId}`;
const detailId = (ruleId: string) => `rs-detail-${ruleId}`;

const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

function FindingDetail({
  run,
  finding,
  canShowInModel,
  onShowInModel,
  onCopyGuid,
}: {
  run: ComplianceRun;
  finding: Finding;
  canShowInModel: boolean;
  onShowInModel: () => void;
  onCopyGuid: (guid: string) => void;
}) {
  const element = elementOf(run, finding);
  const action = actionOf(finding);
  return (
    <div className="rs-detail" id={detailId(finding.ruleId)} role="region" aria-labelledby={rowId(finding.ruleId)}>
      <Measure finding={finding} prefix="rs" />

      {finding.clauseText && isDataCheck(finding) && (
        <div className="rs-detail__part">
          <p className="rs-label">{L.checkDescription}</p>
          <p className="rs-desc">
            <Bidi text={finding.clauseText} />
          </p>
        </div>
      )}

      {finding.clauseText && !isDataCheck(finding) && (
        <figure className="rs-quote rs-detail__part">
          <figcaption className="rs-label">{copy.results.detail.clause}</figcaption>
          <blockquote>«{finding.clauseText}»</blockquote>
          <div className="rs-quote__cite">
            <cite>
              <Bidi text={citationOf(finding)} />
            </cite>
            {finding.sourceUrl && (
              <a className="link" href={finding.sourceUrl} target="_blank" rel="noreferrer">
                {copy.results.detail.showClause}
                <span className="sr-only"> ({L.newTab})</span>
              </a>
            )}
          </div>
        </figure>
      )}

      {!finding.clauseText && finding.clause && (
        <div className="rs-detail__part">
          <p className="rs-label">{copy.dossier.referenceLabel}</p>
          <p className="rs-desc">
            <Bidi text={[finding.source, citationOf(finding)].filter(Boolean).join("، ")} />
          </p>
        </div>
      )}

      {element && (
        <div className="rs-element rs-detail__part">
          <p className="rs-label">{copy.results.detail.element}</p>
          {element.name && (
            <p className="rs-element__name">
              <bdi>{element.name}</bdi>
            </p>
          )}
          {element.ifcClass && (
            <p className="rs-element__class">
              <bdi dir="ltr">{element.ifcClass}</bdi>
            </p>
          )}
          {element.guid && (
            <div className="rs-guid">
              <p className="rs-guid__text">
                <span className="rs-guid__label">{copy.model.guid}</span>
                <bdi dir="ltr" className="rs-guid__value">
                  {element.guid}
                </bdi>
              </p>
              <IconButton label={L.copyGuid} onClick={() => onCopyGuid(element.guid!)}>
                <Copy size={18} strokeWidth={1.6} />
              </IconButton>
            </div>
          )}
        </div>
      )}

      {action && (
        <div className="rs-action rs-detail__part">
          <p className="rs-label">{copy.results.detail.action}</p>
          <p className="rs-action__text">
            <Bidi text={action} />
          </p>
        </div>
      )}

      {canShowInModel && (
        <button type="button" className="link rs-detail__model" onClick={onShowInModel}>
          {L.showInModel}
        </button>
      )}
    </div>
  );
}

export default function Results({ run, onReport, onNew, onTwin, notify }: ResultsProps) {
  const { findings } = run;
  const summary = tallyOf(run);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [selectedRule, setSelectedRule] = useState<string | undefined>(() => defaultFinding(findings)?.ruleId);
  const [selectedElement, setSelectedElement] = useState<string | undefined>(
    () => defaultFinding(findings)?.elementId,
  );
  const [tab, setTab] = useState<"register" | "model">("register");
  /** Rule to bring into view in the register after a pick in the 3D model. */
  const revealRule = useRef<string | undefined>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = defaultFinding(findings);
    setSelectedRule(first?.ruleId);
    setSelectedElement(first?.elementId);
  }, [findings]);

  const groups = useMemo(() => groupFindings(findings), [findings]);
  const selectedFinding = findings.find((finding) => finding.ruleId === selectedRule);
  const standard = run.standard;
  /* Older MOWAEM-IFC-1.0 contract files carry no geometry: their findings are shown on the procedural scene. */
  const contract = !standard && run.source !== "standard-ifc";

  const markers = useMemo(
    () =>
      findings.flatMap((finding) => {
        if (finding.status === "pass") return [];
        const stepId = finding.elementStepId ?? stepIdOf(finding.elementId);
        if (stepId === undefined) return [];
        const clause = clauseOf(finding);
        return [{ stepId, status: finding.status, label: clause.number ?? "", ruleId: finding.ruleId, title: clause.subject }];
      }),
    [findings],
  );
  // The selected element carries the highlight and the measurement callout, so its pin steps aside.
  const visibleMarkers = useMemo(
    () => markers.filter((marker) => marker.ruleId !== selectedRule),
    [markers, selectedRule],
  );

  /* Pins on the contract scene, as before the redesign: every finding that is not a pass, on its scene element,
     numbered by its clause where it has one and by its order otherwise. */
  const sceneMarkers = useMemo(() => {
    let ordinal = 0;
    return findings.flatMap((finding) => {
      if (finding.status === "pass") return [];
      ordinal += 1;
      if (!finding.elementId) return [];
      const clause = clauseOf(finding);
      return [
        {
          elementId: finding.elementId,
          status: finding.status,
          label: clause.number ?? String(ordinal),
          ruleId: finding.ruleId,
          title: clause.subject,
        },
      ];
    });
  }, [findings]);

  const selectFinding = (finding: Finding) => {
    if (finding.ruleId === selectedRule) {
      setSelectedRule(undefined);
      setSelectedElement(undefined);
      return;
    }
    setSelectedRule(finding.ruleId);
    setSelectedElement(finding.elementId);
    // Closing the previous clause shifts the list; keep the chosen row in view.
    revealRule.current = finding.ruleId;
  };

  const selectElement = useCallback(
    (elementId: string) => {
      if (!elementId) {
        setSelectedElement(undefined);
        setSelectedRule(undefined);
        return;
      }
      setSelectedElement(elementId);
      const linked =
        findings.find((finding) => finding.elementId === elementId && finding.status !== "pass") ??
        findings.find((finding) => finding.elementId === elementId);
      setSelectedRule(linked?.ruleId);
      if (linked) revealRule.current = linked.ruleId;
    },
    [findings],
  );

  const selectFromPin = useCallback(
    (ruleId: string) => {
      const target = findings.find((finding) => finding.ruleId === ruleId);
      if (!target) return;
      setSelectedRule(target.ruleId);
      setSelectedElement(target.elementId);
      revealRule.current = target.ruleId;
      if (compact) setTab("register");
    },
    [compact, findings],
  );

  useEffect(() => {
    if (!selectedRule || revealRule.current !== selectedRule) return;
    // On phones the register may be the hidden pane; reveal the row once it is shown.
    if (compact && tab !== "register") return;
    revealRule.current = undefined;
    const row = document.getElementById(rowId(selectedRule));
    row?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [selectedRule, tab, compact]);

  const copyGuid = useCallback(
    async (guid: string) => {
      try {
        await navigator.clipboard.writeText(guid);
        notify(L.copied);
      } catch {
        notify(L.copyFailed);
      }
    },
    [notify],
  );

  /* On phones, switching panes scrolls the pane to just under the sticky header and tab bar, so it fills
     the screen (whether or not the tab bar is already stuck). */
  const showTab = (next: "register" | "model") => {
    setTab(next);
    const main = mainRef.current;
    const tabs = document.getElementById("rs-tabs");
    if (!main || !tabs) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    const top = main.getBoundingClientRect().top + window.scrollY - header - tabs.offsetHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const selectedClause = selectedFinding ? clauseOf(selectedFinding) : undefined;
  const paneOff = (pane: "register" | "model") => (compact && tab !== pane ? " is-off" : "");
  const canShowInModel = (finding: Finding) =>
    compact &&
    (standard
      ? (finding.elementStepId ?? stepIdOf(finding.elementId)) !== undefined
      : contract && Boolean(finding.elementId));

  return (
    <main className="rs">
      <header className="rs-head fade-in">
        <div className="rs-head__id">
          <h1 className="rs-head__file">
            <span className="sr-only">{L.pageTitle}: </span>
            <bdi dir="ltr">{run.file.name}</bdi>
          </h1>
          <p className="rs-head__schema">
            <bdi dir="ltr">{run.metadata.schema}</bdi>
          </p>
        </div>

        <div className="rs-head__scope">
          <p className="rs-head__scope-text">
            <span>{copy.results.scope}:</span> <strong>{scopeOf(run)}</strong>
          </p>
          <ul className="rs-counts" aria-label={L.counts}>
            <li>
              <StatusMark status="pass" label={`${summary.passed} ${copy.status.pass}`} />
            </li>
            <li>
              <StatusMark status="fail" label={`${summary.failed} ${copy.status.fail}`} />
            </li>
            <li>
              <StatusMark status="unknown" label={`${summary.unknown} ${copy.status.unknown}`} />
            </li>
          </ul>
        </div>

        <div className="rs-head__actions">
          <Button variant="primary" size="small" onClick={onReport}>
            {copy.results.report}
          </Button>
          <Button variant="secondary" size="small" onClick={onNew}>
            {copy.results.another}
          </Button>
          <button type="button" className="link rs-head__twin" onClick={onTwin}>
            {copy.results.twin}
          </button>
        </div>
      </header>

      {compact && (
        <div
          className="rs-tabs"
          id="rs-tabs"
          role="tablist"
          aria-label={L.tabsLabel}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home" ? "register" : event.key === "End" ? "model" : tab === "register" ? "model" : "register";
            showTab(next);
            document.getElementById(`rs-tab-${next}`)?.focus();
          }}
        >
          {(
            [
              ["register", L.tabRegister],
              ["model", L.tabModel],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`rs-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`rs-pane-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className="rs-tab"
              onClick={() => showTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="rs-main" ref={mainRef}>
        <section
          className={`rs-pane rs-register${paneOff("register")}`}
          id="rs-pane-register"
          aria-labelledby={compact ? "rs-tab-register" : "rs-register-title"}
          role={compact ? "tabpanel" : undefined}
          inert={compact && tab !== "register" ? true : undefined}
        >
          <h2 id="rs-register-title" className="sr-only">
            {copy.register.title}
          </h2>

          {findings.length === 0 && <p className="rs-empty">{copy.results.empty}</p>}

          {groups.map((group) => (
            <section key={group.key} className={`rs-group rs-group--${group.key}`} aria-labelledby={`rs-g-${group.key}`}>
              <div className="rs-group__head">
                <h3 id={`rs-g-${group.key}`}>
                  {group.status && (
                    <span className={`status status--${group.status}`}>
                      <StatusGlyph status={group.status} size={20} />
                    </span>
                  )}
                  {copy.results.groups[group.key]}
                </h3>
                <span className="count">{group.items.length}</span>
              </div>
              {group.key === "unknown" && <p className="rs-group__note">{copy.results.groups.unknownNote}</p>}
              {group.key === "data" && <p className="rs-group__note">{copy.results.groups.dataNote}</p>}
              <ul className="rs-list">
                {group.items.map((finding) => {
                  const selected = finding.ruleId === selectedRule;
                  const clause = clauseOf(finding);
                  const value = finding.status === "unknown" ? undefined : splitValue(finding.actual).value;
                  return (
                    <li key={finding.ruleId} className={`rs-item${selected ? " is-selected" : ""}`}>
                      <button
                        type="button"
                        id={rowId(finding.ruleId)}
                        className="rs-row"
                        aria-expanded={selected}
                        aria-controls={selected ? detailId(finding.ruleId) : undefined}
                        onClick={() => selectFinding(finding)}
                      >
                        {clause.number && <span className="rs-row__no">{clause.number}</span>}
                        <span className="rs-row__title">{clause.subject}</span>
                        {selected ? (
                          <StatusMark status={finding.status} />
                        ) : (
                          value && <span className={`rs-row__value rs-row__value--${finding.status}`}>{value}</span>
                        )}
                      </button>
                      {selected && (
                        <FindingDetail
                          run={run}
                          finding={finding}
                          canShowInModel={canShowInModel(finding)}
                          onShowInModel={() => showTab("model")}
                          onCopyGuid={(guid) => void copyGuid(guid)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <p className="rs-register__basis">
            {copy.dossier.referenceLabel}: {referenceOf(run)}
          </p>
        </section>

        <section
          className={`rs-pane rs-model${paneOff("model")}`}
          id="rs-pane-model"
          aria-labelledby={compact ? "rs-tab-model" : undefined}
          aria-label={compact ? undefined : copy.model.title}
          role={compact ? "tabpanel" : undefined}
          inert={compact && tab !== "model" ? true : undefined}
        >
          {contract && (
            <p className="rs-model__note" role="note">
              <Info size={18} strokeWidth={1.6} aria-hidden="true" />
              <span>
                <strong>{copy.results.contractModel}</strong> {copy.results.contractNote}
              </span>
            </p>
          )}
          <div className="rs-frame">
            <ViewerBoundary
              resetKey={run.file.sha256}
              fallback={
                <div className="rs-frame__state rs-frame__state--none" role="status">
                  <Box size={30} strokeWidth={1.6} aria-hidden="true" />
                  <p>{L.viewerFailed}</p>
                </div>
              }
            >
              {standard ? (
                <Suspense
                  fallback={
                    <div className="rs-frame__state" role="status">
                      {L.modelLoading}
                    </div>
                  }
                >
                  <IfcModelViewer
                    key={run.file.sha256}
                    fileName={run.file.name}
                    facts={standard.facts}
                    geometry={standard.geometry}
                    selectedStepId={selectedFinding?.elementStepId ?? stepIdOf(selectedElement)}
                    selectedStatus={selectedFinding?.status}
                    selectedTitle={
                      selectedClause
                        ? [selectedClause.number, selectedClause.subject].filter(Boolean).join(" ")
                        : undefined
                    }
                    selectedRuleId={selectedFinding?.ruleId}
                    measurement={selectedFinding ? standard.measurements[selectedFinding.ruleId] : undefined}
                    markers={visibleMarkers}
                    onSelectStep={(stepId) => selectElement(stepId === undefined ? "" : `STEP-${stepId}`)}
                    onSelectFinding={selectFromPin}
                  />
                </Suspense>
              ) : contract ? (
                <Suspense
                  fallback={
                    <div className="rs-frame__state" role="status">
                      {L.modelLoading}
                    </div>
                  }
                >
                  <Viewer3D
                    key={`${run.activityId}-${run.scenario}`}
                    activityId={run.activityId}
                    scenario={run.scenario}
                    selectedElement={selectedElement}
                    selectedStatus={selectedFinding?.status}
                    selectedFindingTitle={selectedClause?.subject}
                    selectedRuleId={selectedFinding?.ruleId}
                    findingMarkers={sceneMarkers}
                    onSelectElement={selectElement}
                    onSelectFinding={selectFromPin}
                  />
                </Suspense>
              ) : (
                <div className="rs-frame__state rs-frame__state--none">
                  <Box size={30} strokeWidth={1.6} aria-hidden="true" />
                  <p>{L.noModel}</p>
                </div>
              )}
            </ViewerBoundary>
          </div>
        </section>
      </div>
    </main>
  );
}
