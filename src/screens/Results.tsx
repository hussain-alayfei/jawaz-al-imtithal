import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Box, Check, Copy, Info } from "lucide-react";
import { Button, IconButton, StatusGlyph, StatusMark } from "../brand/ui";
import { copy } from "../content/copy";
import type { Finding } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { ResultsProps } from "./types";
import { Bidi } from "./results/Bidi";
import { ViewerBoundary } from "./results/ViewerBoundary";
import {
  CLAUSE_FORMS,
  actionOf,
  citationOf,
  clauseOf,
  counted,
  defaultFinding,
  elementOf,
  groupFindings,
  isDataCheck,
  referenceOf,
  splitValue,
  stepIdOf,
  tallyOf,
  type SplitValue,
} from "./results/findings";
import "./results.css";

/* Both viewers pull in three.js, so they load after the register is on screen. */
const IfcModelViewer = lazy(() => import("../components/IfcModelViewer"));
/* The procedural scene for the older MOWAEM-IFC-1.0 contract files, which carry no geometry. */
const Viewer3D = lazy(() => import("../components/Viewer3D").then((module) => ({ default: module.Viewer3D })));

/* Local strings (missing from copy.ts). */
const L = {
  pageTitle: "نتائج الفحص",
  counts: "النتائج حسب الحالة",
  of: "من",
  modelLoading: "جارٍ تجهيز النموذج ثلاثي الأبعاد",
  noModel: "لا يتوفر نموذج ثلاثي الأبعاد لهذا الملف.",
  viewerFailed: "تعذر عرض النموذج ثلاثي الأبعاد في هذا المتصفح. النتائج في السجل كاملة.",
  copyGuid: "نسخ معرّف العنصر",
  copiedShort: "تم النسخ",
  copied: "تم نسخ معرّف العنصر.",
  copyFailed: "تعذر النسخ تلقائيًا. حدّد المعرّف وانسخه يدويًا.",
  newTab: "يفتح في نافذة جديدة",
  showInModel: "عرض في النموذج",
  closeModel: "العودة إلى النتائج",
  checkDescription: "وصف الفحص",
  selected: "البند المحدد",
  nothingSelected: "اختر بندًا من السجل لعرض المقاس ونص البند والعنصر المرتبط به.",
  bound: { min: "على الأقل", max: "على الأكثر" },
} as const;

/* Below 1024 px the model opens full screen on demand instead of sitting beside the register. */
const COMPACT_QUERY = "(max-width: 1023px)";

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
const DETAIL_ID = "rs-detail";

const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** "1.50 م" as a big figure with a smaller unit after it. */
function Figure({ value }: { value: string }) {
  const match = /^(\S+)\s+(م²?)$/.exec(value);
  if (!match) return <>{value}</>;
  return (
    <>
      {match[1]}
      <span className="rs-sig__unit"> {match[2]}</span>
    </>
  );
}

/** A count the engine leads with ("9 من 10 تجهيزات ...") is the figure of a clause measured by counting. */
function countFigure(split: SplitValue): SplitValue {
  if (split.value) return split;
  const match = /^(\d+\s+من\s+\d+)\s+(.+)$/.exec(split.rest);
  return match ? { value: match[1], rest: match[2] } : split;
}

/** The signature of the screen: the measured value against the required one, in big tabular figures.
 *  The engine's explanation follows as a muted paragraph, never inside the figure. */
function Signature({ finding }: { finding: Finding }) {
  const measured = countFigure(splitValue(finding.actual));
  const required = splitValue(finding.expected);
  /* Two figures sit side by side; when either side is a sentence the two stack at reading width,
     and each explanation stays under its own figure. */
  const stacked = !(measured.value && required.value);
  return (
    <div className={`rs-sig${stacked ? " rs-sig--text" : ""}`}>
      <dl className="rs-sig__figs">
        <div className="rs-sig__fig">
          <dt>{copy.results.detail.measured}</dt>
          <dd>
            {measured.value ? (
              <>
                <span className={`rs-sig__num rs-sig__num--${finding.status}`}>
                  <Figure value={measured.value} />
                </span>
                {stacked && measured.rest && (
                  <span className="rs-sig__note">
                    <Bidi text={measured.rest} />
                  </span>
                )}
              </>
            ) : (
              <span className="rs-sig__lead">
                <Bidi text={measured.rest} />
              </span>
            )}
          </dd>
        </div>
        <div className="rs-sig__fig">
          <dt>{copy.results.detail.required}</dt>
          <dd>
            {required.value ? (
              <>
                <span className="rs-sig__num rs-sig__num--req">
                  <Figure value={required.value} />
                  {required.bound && <small>{L.bound[required.bound]}</small>}
                </span>
                {stacked && required.rest && (
                  <span className="rs-sig__note">
                    <Bidi text={required.rest} />
                  </span>
                )}
              </>
            ) : (
              <span className="rs-sig__lead">
                <Bidi text={required.rest} />
              </span>
            )}
          </dd>
        </div>
      </dl>
      {!stacked && measured.rest && (
        <p className="rs-sig__note">
          <Bidi text={measured.rest} />
        </p>
      )}
      {!stacked && required.rest && (
        <p className="rs-sig__note">
          {copy.results.detail.required}: <Bidi text={required.rest} />
        </p>
      )}
    </div>
  );
}

function FindingDetail({
  run,
  finding,
  copied,
  onCopyGuid,
}: {
  run: ComplianceRun;
  finding: Finding;
  copied: boolean;
  onCopyGuid: (guid: string) => void;
}) {
  const clause = clauseOf(finding);
  const element = elementOf(run, finding);
  const action = actionOf(finding);
  return (
    <>
      <header className="rs-detail__head">
        <p className="rs-detail__kicker">
          {clause.number && <span className="rs-detail__no">{clause.number}</span>}
          <StatusMark status={finding.status} size="large" />
        </p>
        <h2 className="rs-detail__title" id="rs-detail-title">
          {clause.subject}
        </h2>
      </header>

      <Signature finding={finding} />

      {finding.clauseText && isDataCheck(finding) && (
        <div className="rs-part">
          <h3 className="rs-label">{L.checkDescription}</h3>
          <p className="rs-prose">
            <Bidi text={finding.clauseText} />
          </p>
        </div>
      )}

      {finding.clauseText && !isDataCheck(finding) && (
        <figure className="rs-part rs-quote">
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
        <div className="rs-part">
          <h3 className="rs-label">{copy.dossier.referenceLabel}</h3>
          <p className="rs-prose">
            <Bidi text={[finding.source, citationOf(finding)].filter(Boolean).join("، ")} />
          </p>
        </div>
      )}

      {element && (
        <div className="rs-part rs-element">
          <h3 className="rs-label">{copy.results.detail.element}</h3>
          {(element.name || element.ifcClass) && (
            <p className="rs-element__name">
              {element.name && <bdi>{element.name}</bdi>}
              {element.ifcClass && (
                <span className="rs-element__class">
                  <bdi dir="ltr">{element.ifcClass}</bdi>
                </span>
              )}
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
              <IconButton
                label={copied ? L.copiedShort : L.copyGuid}
                className={copied ? "is-done" : undefined}
                onClick={() => onCopyGuid(element.guid!)}
              >
                {copied ? <Check size={18} strokeWidth={2} /> : <Copy size={18} strokeWidth={1.6} />}
              </IconButton>
            </div>
          )}
        </div>
      )}

      {action && (
        <div className="rs-part rs-action">
          <h3 className="rs-label">{copy.results.detail.action}</h3>
          <p className="rs-prose">
            <Bidi text={action} />
          </p>
        </div>
      )}
    </>
  );
}

export default function Results({ run, onReport, onNew, onTwin, notify }: ResultsProps) {
  const { findings } = run;
  const summary = tallyOf(run);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [selectedRule, setSelectedRule] = useState<string | undefined>(() => defaultFinding(findings)?.ruleId);
  const [selectedElement, setSelectedElement] = useState<string | undefined>(() => defaultFinding(findings)?.elementId);
  /** Phones and tablets: the model is open full screen. */
  const [modelOpen, setModelOpen] = useState(false);
  const [copiedGuid, setCopiedGuid] = useState<string | undefined>(undefined);
  /** Bring the detail into view after a pick in the register or the model. */
  const revealDetail = useRef(false);
  const sideRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
  const hasModel = Boolean(standard) || contract;
  const overlay = compact && modelOpen;

  const markers = useMemo(
    () =>
      findings.flatMap((finding) => {
        if (finding.status === "pass") return [];
        const stepId = finding.elementStepId ?? stepIdOf(finding.elementId);
        if (stepId === undefined) return [];
        const clause = clauseOf(finding);
        return [
          { stepId, status: finding.status, label: clause.number ?? "", ruleId: finding.ruleId, title: clause.subject },
        ];
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
    setSelectedRule(finding.ruleId);
    setSelectedElement(finding.elementId);
    revealDetail.current = true;
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
      if (linked) revealDetail.current = true;
    },
    [findings],
  );

  const selectFromPin = useCallback(
    (ruleId: string) => {
      const target = findings.find((finding) => finding.ruleId === ruleId);
      if (!target) return;
      setSelectedRule(target.ruleId);
      setSelectedElement(target.elementId);
      revealDetail.current = true;
    },
    [findings],
  );

  /* After a pick, show the detail: on desktop the side column returns to its top (the detail leads it);
     on phones the page scrolls to the detail, unless the model is open over it. */
  useEffect(() => {
    if (!revealDetail.current) return;
    revealDetail.current = false;
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (!compact) {
      sideRef.current?.scrollTo({ top: 0, behavior });
      return;
    }
    if (modelOpen) return;
    const detail = detailRef.current;
    if (!detail) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    const top = detail.getBoundingClientRect().top + window.scrollY - header - 12;
    window.scrollTo({ top: Math.max(0, top), behavior });
  }, [selectedRule, compact, modelOpen]);

  /* The full-screen model: focus moves to its close button, Escape closes it, the page behind does not scroll. */
  useEffect(() => {
    if (!overlay) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModelOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay]);

  const closeModel = () => {
    setModelOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  useEffect(() => {
    if (!copiedGuid) return;
    const timer = window.setTimeout(() => setCopiedGuid(undefined), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedGuid]);

  const copyGuid = useCallback(
    async (guid: string) => {
      try {
        await navigator.clipboard.writeText(guid);
        setCopiedGuid(guid);
        notify(L.copied);
      } catch {
        notify(L.copyFailed);
      }
    },
    [notify],
  );

  const selectedClause = selectedFinding ? clauseOf(selectedFinding) : undefined;
  const selectedLabel = selectedClause
    ? [selectedClause.number, selectedClause.subject].filter(Boolean).join(" ")
    : undefined;

  return (
    <main className="rs">
      <header className="rs-summary">
        <div className="page rs-summary__inner">
          <div className="rs-file">
            <h1 className="rs-file__name">
              <span className="sr-only">{L.pageTitle}: </span>
              <bdi dir="ltr">{run.file.name}</bdi>
            </h1>
            <p className="rs-file__schema">
              <bdi dir="ltr">{run.metadata.schema}</bdi>
            </p>
          </div>

          <div className="rs-meta">
            <p className="rs-scope">
              <span className="rs-scope__label">{copy.results.scope}</span>
              <span className="rs-scope__figure">
                <strong className="num">{summary.verified}</strong> {L.of} {counted(summary.total, CLAUSE_FORMS)}
              </span>
            </p>
            <ul className="rs-counts" aria-label={L.counts}>
              <li>
                <StatusMark status="fail" label={`${summary.failed} ${copy.status.fail}`} />
              </li>
              <li>
                <StatusMark status="unknown" label={`${summary.unknown} ${copy.status.unknown}`} />
              </li>
              <li>
                <StatusMark status="pass" label={`${summary.passed} ${copy.status.pass}`} />
              </li>
            </ul>
          </div>

          <div className="rs-actions">
            <button type="button" className="btn btn--accent rs-actions__main" onClick={onReport}>
              {copy.results.report}
            </button>
            <Button variant="secondary" onClick={onNew}>
              {copy.results.another}
            </Button>
            <button type="button" className="link rs-actions__twin" onClick={onTwin}>
              {copy.results.twin}
            </button>
          </div>
        </div>
      </header>

      <div className="page rs-layout">
        <div className="rs-side" ref={sideRef}>
          <section
            className="rs-detail"
            id={DETAIL_ID}
            ref={detailRef}
            aria-labelledby={selectedFinding ? "rs-detail-title" : "rs-detail-empty"}
          >
            {selectedFinding ? (
              <FindingDetail
                run={run}
                finding={selectedFinding}
                copied={Boolean(copiedGuid)}
                onCopyGuid={(guid) => void copyGuid(guid)}
              />
            ) : (
              <p className="rs-detail__empty" id="rs-detail-empty">
                <span className="sr-only">{L.selected}: </span>
                {findings.length === 0 ? copy.results.empty : L.nothingSelected}
              </p>
            )}

            {compact && hasModel && (
              <button
                ref={openerRef}
                type="button"
                className="btn btn--primary rs-detail__open"
                aria-haspopup="dialog"
                onClick={() => setModelOpen(true)}
              >
                <Box size={20} strokeWidth={1.8} aria-hidden="true" />
                {L.showInModel}
              </button>
            )}
          </section>

          <section className="rs-register" aria-labelledby="rs-register-title">
            <h2 id="rs-register-title" className="rs-register__title">
              {copy.register.title}
            </h2>

            {groups.map((group) => (
              <section
                key={group.key}
                className={`rs-group rs-group--${group.key}`}
                aria-labelledby={`rs-g-${group.key}`}
              >
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
                      <li key={finding.ruleId}>
                        <button
                          type="button"
                          id={rowId(finding.ruleId)}
                          className={`rs-row${selected ? " is-selected" : ""}`}
                          aria-pressed={selected}
                          aria-controls={DETAIL_ID}
                          onClick={() => selectFinding(finding)}
                        >
                          <span className="rs-row__no">{clause.number}</span>
                          <span className="rs-row__title">{clause.subject}</span>
                          {value && <span className={`rs-row__value rs-row__value--${finding.status}`}>{value}</span>}
                        </button>
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
        </div>

        <section
          className={`rs-model${compact ? " is-compact" : ""}${overlay ? " is-open" : ""}`}
          aria-label={copy.model.title}
          role={overlay ? "dialog" : undefined}
          aria-modal={overlay ? true : undefined}
          inert={compact && !modelOpen ? true : undefined}
        >
          {compact && (
            <div className="rs-model__bar">
              <button ref={closeRef} type="button" className="btn btn--secondary btn--small" onClick={closeModel}>
                <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
                {L.closeModel}
              </button>
              {selectedFinding && selectedLabel && (
                <p className="rs-model__selected">
                  <StatusGlyph status={selectedFinding.status} size={18} />
                  <span>{selectedLabel}</span>
                </p>
              )}
            </div>
          )}
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
                    selectedTitle={selectedLabel}
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
