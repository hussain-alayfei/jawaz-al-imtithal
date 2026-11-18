import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Copy, FileText, Upload } from "lucide-react";
import { Button, IconButton, Seal, StatusGlyph, StatusMark, Wordmark } from "../brand/ui";
import { copy } from "../content/copy";
import { activityExamples, type Finding } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { ResultsProps } from "./types";
import { Bidi } from "./results/Bidi";
import { Measure } from "./results/Measure";
import {
  CLAUSE_FORMS,
  ELEMENT_FORMS,
  TRIANGLE_FORMS,
  citationOf,
  clauseOf,
  counted,
  coverageOf,
  tallyOf,
  defaultFinding,
  elementOf,
  groupFindings,
  splitValue,
  stepIdOf,
} from "./results/findings";
import "./results.css";

/* The viewer pulls in three.js, so it loads after the register is on screen. */
const IfcModelViewer = lazy(() => import("../components/IfcModelViewer"));

/* Local strings (missing from copy.ts). */
const L = {
  pageTitle: "نتائج الفحص",
  model: "النموذج",
  tabModel: "النموذج",
  tabRegister: "البنود",
  tabsLabel: "عرض النتائج",
  modelLoading: "جارٍ تجهيز النموذج ثلاثي الأبعاد",
  noModel: "لا يتوفر نموذج ثلاثي الأبعاد لهذا الملف.",
  copyGuid: "نسخ معرّف العنصر",
  copied: "تم نسخ معرّف العنصر.",
  copyFailed: "تعذر النسخ تلقائيًا. حدّد المعرّف وانسخه يدويًا.",
  newTab: "يفتح في نافذة جديدة",
  showInModel: "عرض العنصر في النموذج",
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

function referenceOf(run: ComplianceRun): string {
  if (run.source === "standard-ifc") return copy.footer.basis;
  return activityExamples.find((item) => item.id === run.activityId)?.rulePack ?? copy.footer.basis;
}

function actionOf(finding: Finding): string | undefined {
  if (finding.status === "pass") return undefined;
  const text = finding.recommendation?.trim();
  if (text) return text;
  return finding.ruleId === "MOMAH-REST-4.5.2-CLADDING" ? copy.results.detail.action452 : undefined;
}

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

      {finding.clauseText && (
        <figure className="rs-quote">
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

      {(element || action) && (
        <div className="rs-facts">
          {element && (
            <div className="rs-element">
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
                  <span className="rs-guid__text">
                    <span className="rs-guid__label">{copy.model.guid}</span>
                    <bdi dir="ltr" className="rs-guid__value">
                      {element.guid}
                    </bdi>
                  </span>
                  <IconButton label={L.copyGuid} onClick={() => onCopyGuid(element.guid!)}>
                    <Copy size={18} strokeWidth={1.6} />
                  </IconButton>
                </div>
              )}
            </div>
          )}
          {action && (
            <div className="rs-action">
              <p className="rs-label">{copy.results.detail.action}</p>
              <p>
                <Bidi text={action} />
              </p>
            </div>
          )}
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

export default function Results({ run, onReport, onNew, onHome, notify }: ResultsProps) {
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

  useEffect(() => {
    const first = defaultFinding(findings);
    setSelectedRule(first?.ruleId);
    setSelectedElement(first?.elementId);
  }, [findings]);

  const groups = useMemo(() => groupFindings(findings), [findings]);
  const selectedFinding = findings.find((finding) => finding.ruleId === selectedRule);
  const coverage = coverageOf(run);
  const standard = run.standard;
  const triangles = standard?.geometry.triangles;

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

  const selectElement = (elementId: string) => {
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
  };

  const selectFromPin = (ruleId: string) => {
    const target = findings.find((finding) => finding.ruleId === ruleId);
    if (!target) return;
    setSelectedRule(target.ruleId);
    setSelectedElement(target.elementId);
    revealRule.current = target.ruleId;
    if (compact) setTab("register");
  };

  useEffect(() => {
    if (!selectedRule || revealRule.current !== selectedRule) return;
    // On phones the register may be the hidden pane; reveal the row once it is shown.
    if (compact && tab !== "register") return;
    revealRule.current = undefined;
    const row = document.getElementById(rowId(selectedRule));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    row?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
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

  /* On phones, switching panes brings the tab bar to the top so the pane fills the screen. */
  const showTab = (next: "register" | "model") => {
    setTab(next);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("rs-tabs")?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  const selectedClause = selectedFinding ? clauseOf(selectedFinding) : undefined;
  const sealText = `${coverage.verified} من ${coverage.total}`;
  const paneOff = (pane: "register" | "model") => (compact && tab !== pane ? " is-off" : "");

  return (
    <div className="rs">
      <header className="rs-bar">
        <Wordmark className="rs-bar__brand" onClick={onHome} />
        <p className="rs-bar__ref">
          {copy.dossier.referenceLabel}: {referenceOf(run)}
        </p>
      </header>

      <h1 className="sr-only">{L.pageTitle}</h1>

      <section className="rs-record" aria-label={copy.results.file}>
        <dl className="rs-cells">
          <div className="rs-cell rs-cell--file">
            <dt>{copy.results.file}</dt>
            <dd>
              <bdi dir="ltr">{run.file.name}</bdi>
            </dd>
          </div>
          <div className="rs-cell">
            <dt>{copy.dossier.schemaLabel}</dt>
            <dd>
              <bdi dir="ltr">{run.metadata.schema}</bdi>
            </dd>
          </div>
          <div className="rs-cell">
            <dt>{copy.dossier.elementsLabel}</dt>
            <dd>{counted(run.metadata.elements, ELEMENT_FORMS)}</dd>
          </div>
          {triangles !== undefined && (
            <div className="rs-cell rs-cell--model">
              <dt>{L.model}</dt>
              <dd>{counted(triangles, TRIANGLE_FORMS)}</dd>
            </div>
          )}
        </dl>

        <div className="rs-scope">
          <Seal
            size={compact ? 92 : 108}
            main={sealText}
            label={`${copy.seal.top}، ${copy.results.scope} ${coverage.verified} من ${counted(coverage.total, CLAUSE_FORMS)}`}
          />
          <div className="rs-scope__text">
            <p className="rs-scope__label">{copy.results.scope}</p>
            <ul className="rs-counts">
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
        </div>

        <div className="rs-actions">
          <Button variant="secondary" size="small" icon={<Upload size={18} strokeWidth={1.6} />} onClick={onNew}>
            {copy.results.another}
          </Button>
          <Button variant="primary" size="small" icon={<FileText size={18} strokeWidth={1.6} />} onClick={onReport}>
            {copy.results.report}
          </Button>
        </div>
      </section>

      {compact && (
        <div
          className="rs-tabs"
          id="rs-tabs"
          role="tablist"
          aria-label={L.tabsLabel}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "register" : event.key === "End" ? "model" : tab === "register" ? "model" : "register";
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

      <main className="rs-main">
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
                        <span className="rs-row__no">{clause.number}</span>
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
                          canShowInModel={compact && Boolean(standard) && stepIdOf(finding.elementId) !== undefined}
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
          <div className="rs-frame">
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
            ) : (
              <div className="rs-frame__state rs-frame__state--none">
                <Box size={30} strokeWidth={1.6} aria-hidden="true" />
                <p>{L.noModel}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
