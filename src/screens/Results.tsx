import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box, Check, ChevronDown, Copy, Info, PanelRightClose, PanelRightOpen } from "../brand/icons";
import { IconButton, StatusGlyph, StatusMark } from "../brand/ui";
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
  issueGroupsOf,
  referenceOf,
  splitValue,
  stepIdOf,
  tallyOf,
  type FindingGroup,
  type SplitValue,
} from "./results/findings";
import "./results.css";

/* Both viewers pull in three.js, so they load after the results bar is on screen. */
const IfcModelViewer = lazy(() => import("../components/IfcModelViewer"));
/* The procedural scene for the older MOWAEM-IFC-1.0 contract files, which carry no geometry. */
const Viewer3D = lazy(() => import("../components/Viewer3D").then((module) => ({ default: module.Viewer3D })));

/* Local strings (missing from copy.ts). */
const L = {
  pageTitle: "نتائج الفحص",
  counts: "النتائج حسب الحالة",
  of: "من",
  report: "التقرير",
  modelLoading: "جارٍ تجهيز النموذج ثلاثي الأبعاد",
  noModel: "لا يتوفر نموذج ثلاثي الأبعاد لهذا الملف.",
  viewerFailed: "تعذر عرض النموذج ثلاثي الأبعاد في هذا المتصفح. النتائج في لوحة التفاصيل كاملة.",
  copyGuid: "نسخ معرّف العنصر",
  copiedShort: "تم النسخ",
  copied: "تم نسخ معرّف العنصر.",
  copyFailed: "تعذر النسخ تلقائيًا. حدّد المعرّف وانسخه يدويًا.",
  newTab: "يفتح في نافذة جديدة",
  checkDescription: "وصف الفحص",
  selected: "البند المحدد",
  nothingSelected: "اختر بندًا من القائمة لعرض المقاس ونص البند والعنصر المرتبط به.",
  bound: { min: "على الأقل", max: "على الأكثر" },
  panel: "تفاصيل النتائج",
  tabs: "البنود المعروضة",
  tabIssues: "المخالفات",
  tabAll: "كل البنود",
  hide: "إخفاء التفاصيل",
  show: "عرض التفاصيل",
  /* «المخالفات» holds failures only; with none, it says so and points to «كل البنود». */
  noFailures: "لا يوجد بند غير مطابق.",
  unknownElsewhere: "البنود التي لا يمكن التحقق منها من الملف في «كل البنود»، ولا تُحسب مطابقة.",
  showAll: "عرض كل البنود",
} as const;

type Tab = "issues" | "all";
/** Where a pick came from: the list scrolls the detail into view, the model leaves the page where it is. */
type PickSource = "list" | "model";

/* Below 1024 px the stage is a band at the top and the details follow it in the page;
   from 1024 px they float over the stage in a panel that scrolls on its own. */
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
const PANEL_ID = "rs-panel";
const LIST_ID = "rs-list";

const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

/** The sticky global navigation covers the top of the page. */
const headerHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;

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

/** The measured value against the required one, in big tabular figures. The engine's explanation
 *  follows as a muted line, never inside the figure. */
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
                </span>
                {required.bound && <span className="rs-sig__bound">{L.bound[required.bound]}</span>}
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
          <StatusMark status={finding.status} />
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
        <details className="rs-part rs-clause">
          <summary className="rs-clause__toggle">
            <span>{copy.results.detail.clause}</span>
            <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
          </summary>
          <figure className="rs-quote">
            <blockquote>«{finding.clauseText}»</blockquote>
            <figcaption className="rs-quote__cite">
              <cite>
                <Bidi text={citationOf(finding)} />
              </cite>
              {finding.sourceUrl && (
                <a className="link link--more" href={finding.sourceUrl} target="_blank" rel="noreferrer">
                  {copy.results.detail.showClause}
                  <span className="sr-only"> ({L.newTab})</span>
                </a>
              )}
            </figcaption>
          </figure>
        </details>
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

/** One status group of the list: a quiet heading with its count, then calm rows. */
function ListGroup({
  group,
  selectedRule,
  onSelect,
}: {
  group: FindingGroup;
  selectedRule?: string;
  onSelect: (finding: Finding) => void;
}) {
  return (
    <section className={`rs-group rs-group--${group.key}`} aria-labelledby={`rs-g-${group.key}`}>
      <div className="rs-group__head">
        <h3 id={`rs-g-${group.key}`}>
          {group.status && (
            <span className={`status status--${group.status}`}>
              <StatusGlyph status={group.status} size={18} />
            </span>
          )}
          {copy.results.groups[group.key]}
        </h3>
        <span className="count">{group.items.length}</span>
      </div>
      {group.key === "unknown" && <p className="rs-group__note">{copy.results.groups.unknownNote}</p>}
      {group.key === "data" && <p className="rs-group__note">{copy.results.groups.dataNote}</p>}
      <ul className="rs-rows">
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
                onClick={() => onSelect(finding)}
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
  );
}

function StageState({ children, none = false }: { children: ReactNode; none?: boolean }) {
  return (
    <div className={`rs-stage__state${none ? " rs-stage__state--none" : ""}`} role="status">
      {children}
    </div>
  );
}

export default function Results({ run, onReport, onNew, onTwin, notify }: ResultsProps) {
  const { findings } = run;
  const summary = tallyOf(run);
  const compact = useMediaQuery(COMPACT_QUERY);
  const groups = useMemo(() => groupFindings(findings), [findings]);
  const issueGroups = useMemo(() => issueGroupsOf(groups), [groups]);
  const [selectedRule, setSelectedRule] = useState<string | undefined>(() => defaultFinding(findings)?.ruleId);
  const [selectedElement, setSelectedElement] = useState<string | undefined>(() => defaultFinding(findings)?.elementId);
  const [tab, setTab] = useState<Tab>(() => (issueGroups.length > 0 ? "issues" : "all"));
  /** Desktop: the details float over the stage; collapsed, the stage is free and a pill brings them back. */
  const [panelOpen, setPanelOpen] = useState(true);
  const [copiedGuid, setCopiedGuid] = useState<string | undefined>(undefined);
  /** Every pick, even of the row already selected, brings the detail into view; the source decides how. */
  const [pick, setPick] = useState<{ n: number; source?: PickSource }>({ n: 0 });
  const listShown = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const allTabRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /* Screen readers start at the results heading, at the top of the page. The shell's smooth scroll to the top
     can still be running when this screen mounts, and the browser's scroll anchoring then carries the page
     down with the new content, so the top is settled at once, before paint, and the focus does not scroll. */
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const first = defaultFinding(findings);
    setSelectedRule(first?.ruleId);
    setSelectedElement(first?.elementId);
  }, [findings]);

  useEffect(() => {
    setTab(issueGroups.length > 0 ? "issues" : "all");
  }, [issueGroups]);

  const selectedFinding = findings.find((finding) => finding.ruleId === selectedRule);
  const standard = run.standard;
  /* Older MOWAEM-IFC-1.0 contract files carry no geometry: their findings are shown on the procedural scene. */
  const contract = !standard && run.source !== "standard-ifc";
  const visibleGroups = tab === "issues" ? issueGroups : groups;
  /** «المخالفات» can hold a failing data check without any failing clause; it still says no clause failed. */
  const failedClauses = issueGroups.some((group) => group.key === "fail");
  const floating = !compact;

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

  /* Pins on the contract scene: every finding that is not a pass, on its scene element,
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
    setPick((current) => ({ n: current.n + 1, source: "list" }));
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
      if (linked) setPick((current) => ({ n: current.n + 1, source: "model" }));
    },
    [findings],
  );

  const selectFromPin = useCallback(
    (ruleId: string) => {
      const target = findings.find((finding) => finding.ruleId === ruleId);
      if (!target) return;
      setSelectedRule(target.ruleId);
      setSelectedElement(target.elementId);
      setPick((current) => ({ n: current.n + 1, source: "model" }));
    },
    [findings],
  );

  /* After a pick, show the detail. Over the stage, the panel returns to its top (the detail leads it).
     Below the stage, a pick in the list scrolls the page to the detail; a pick in the model does not,
     so the model stays in view (its own selection card names the element). */
  useEffect(() => {
    const { source } = pick;
    if (!source) return;
    if (floating) {
      if (panelOpen) bodyRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
      return;
    }
    if (source !== "list") return;
    const detail = detailRef.current;
    if (!detail) return;
    const top = detail.getBoundingClientRect().top + window.scrollY - headerHeight() - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
    // Only a new pick moves the view; the layout and the panel state are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  /* A new tab changes the list under the detail: if the list is out of sight, bring its top into view. */
  useEffect(() => {
    if (!listShown.current) return;
    listShown.current = false;
    const list = listRef.current;
    if (!list) return;
    if (floating) {
      const body = bodyRef.current;
      if (!body) return;
      const top = list.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      const visible = top >= body.scrollTop && top <= body.scrollTop + body.clientHeight - 96;
      if (!visible) body.scrollTo({ top: Math.max(0, top - 12), behavior: scrollBehavior() });
      return;
    }
    const rect = list.getBoundingClientRect();
    const header = headerHeight();
    if (rect.top < header || rect.top > window.innerHeight - 120) {
      window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - header - 16), behavior: scrollBehavior() });
    }
  }, [tab, floating]);

  const chooseTab = (next: Tab) => {
    if (next === tab) return;
    listShown.current = true;
    setTab(next);
  };

  /* The empty «المخالفات» list's own button: it leaves with the list, so focus moves to the tab it chose. */
  const showAllClauses = () => {
    chooseTab("all");
    requestAnimationFrame(() => allTabRef.current?.focus());
  };

  const hidePanel = () => {
    setPanelOpen(false);
    requestAnimationFrame(() => showRef.current?.focus());
  };

  const showPanel = () => {
    setPanelOpen(true);
    requestAnimationFrame(() => hideRef.current?.focus());
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

  const panel = (
    <aside id={PANEL_ID} className="rs-panel" aria-label={L.panel} hidden={floating && !panelOpen ? true : undefined}>
      {(findings.length > 0 || floating) && (
        <div className="rs-panel__head">
          {findings.length > 0 && (
            <div className="rs-seg" role="group" aria-label={L.tabs}>
              <button
                type="button"
                className="rs-seg__item"
                aria-pressed={tab === "issues"}
                aria-controls={LIST_ID}
                onClick={() => chooseTab("issues")}
              >
                {L.tabIssues}
              </button>
              <button
                ref={allTabRef}
                type="button"
                className="rs-seg__item"
                aria-pressed={tab === "all"}
                aria-controls={LIST_ID}
                onClick={() => chooseTab("all")}
              >
                {L.tabAll}
              </button>
            </div>
          )}
          {floating && (
            <button
              ref={hideRef}
              type="button"
              className="icon-btn rs-panel__hide"
              aria-label={L.hide}
              title={L.hide}
              aria-expanded={true}
              aria-controls={PANEL_ID}
              onClick={hidePanel}
            >
              <PanelRightClose size={20} strokeWidth={1.6} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="rs-panel__body" ref={bodyRef}>
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
        </section>

        {findings.length > 0 && (
          <section
            className="rs-list"
            id={LIST_ID}
            ref={listRef}
            aria-label={tab === "issues" ? L.tabIssues : L.tabAll}
          >
            {tab === "issues" && !failedClauses && (
              <div className="rs-list__empty">
                <p>
                  <strong>{L.noFailures}</strong>
                  {summary.unknown > 0 && <> {L.unknownElsewhere}</>}
                </p>
                <button type="button" className="link" onClick={showAllClauses}>
                  {L.showAll}
                </button>
              </div>
            )}
            {visibleGroups.map((group) => (
              <ListGroup key={group.key} group={group} selectedRule={selectedRule} onSelect={selectFinding} />
            ))}
            <p className="rs-list__basis">
              {copy.dossier.referenceLabel}: {referenceOf(run)}
            </p>
          </section>
        )}
      </div>
    </aside>
  );

  const viewer = standard ? (
    <Suspense fallback={<StageState>{L.modelLoading}</StageState>}>
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
    <Suspense fallback={<StageState>{L.modelLoading}</StageState>}>
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
    <StageState none>
      <Box size={30} strokeWidth={1.6} aria-hidden="true" />
      <p>{L.noModel}</p>
    </StageState>
  );

  return (
    <main className="rs">
      <header className="rs-bar">
        <div className="page rs-bar__inner">
          <div className="rs-bar__file">
            <h1 className="rs-bar__name" ref={headingRef} tabIndex={-1}>
              <span className="sr-only">{L.pageTitle}: </span>
              <bdi dir="ltr">{run.file.name}</bdi>
            </h1>
            <p className="rs-bar__schema">
              <bdi dir="ltr">{run.metadata.schema}</bdi>
            </p>
          </div>

          <div className="rs-bar__figures">
            <p className="rs-bar__scope">
              <span className="rs-bar__scope-label">{copy.results.scope}</span>
              <span className="rs-bar__scope-figure">
                {summary.verified} {L.of} {counted(summary.total, CLAUSE_FORMS)}
              </span>
            </p>
            <ul className="rs-bar__counts" aria-label={L.counts}>
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

          <div className="rs-bar__actions">
            <button type="button" className="btn btn--secondary btn--small" onClick={onReport}>
              {L.report}
            </button>
            <button type="button" className="link" onClick={onNew}>
              {copy.results.another}
            </button>
            <button type="button" className="link" onClick={onTwin}>
              {copy.results.twin}
            </button>
          </div>

          {contract && (
            <p className="rs-bar__note" role="note">
              <Info size={18} strokeWidth={1.6} aria-hidden="true" />
              <span>
                <strong>{copy.results.contractModel}</strong> {copy.results.contractNote}
              </span>
            </p>
          )}
        </div>
      </header>

      <div className={`rs-stage${panelOpen ? "" : " is-collapsed"}`}>
        {floating && panel}
        {floating && !panelOpen && (
          <button
            ref={showRef}
            type="button"
            className="rs-reopen"
            aria-expanded={false}
            aria-controls={PANEL_ID}
            onClick={showPanel}
          >
            <PanelRightOpen size={18} strokeWidth={1.6} aria-hidden="true" />
            {L.show}
          </button>
        )}

        <section className="rs-stage__view" aria-label={copy.model.title}>
          <ViewerBoundary
            resetKey={run.file.sha256}
            fallback={
              <StageState none>
                <Box size={30} strokeWidth={1.6} aria-hidden="true" />
                <p>{L.viewerFailed}</p>
              </StageState>
            }
          >
            {viewer}
          </ViewerBoundary>
        </section>

        {!floating && panel}
      </div>
    </main>
  );
}
