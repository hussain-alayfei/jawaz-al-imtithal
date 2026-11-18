import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ChevronDown, CircleAlert, CircleCheck, Download, FileUp, ShieldCheck } from "lucide-react";
import { activityExamples, getAnalysisStages, type ActivityId } from "../data";
import { runIfcCompliance } from "../ifc/pipeline";
import type { ComplianceRun, IfcUpload, PipelineEvent, StageId, StageState } from "../ifc/types";
import { copy } from "../content/copy";
import { SAMPLE_FILES, sampleById, type SampleFile, type SampleId } from "../content/samples";
import { StatusMark } from "../brand/ui";
import { tallyOf } from "./results/findings";
import {
  STAGE_IDS,
  checkFileMeta,
  clausesWord,
  describeFailure,
  formatArea,
  formatDuration,
  isAreaValid,
  parseArea,
  readUpload,
  stagesDone,
  withFacilityDefaults,
  type CheckFailure,
} from "./check/logic";
import { Bidi, STROKE, StageIcon } from "./check/parts";
import type { CheckProps } from "./types";
import "./check.css";

/* Strings this screen needs that copy.ts does not have. */
const AREA_UNIT = "م²";
const AREA_ERROR = "أدخل مساحة أكبر من صفر.";
const AREA_FIRST = "أدخل مساحة الترخيص أعلاه أولًا، ثم اختر الملف.";
const SETTINGS_LABEL = "بيانات الفحص";
const DROP_TITLE = "اسحب ملف IFC هنا";
const DROP_TITLE_TOUCH = "ارفع ملف IFC من جهازك";
const DROP_OR = "أو";
const CHOOSE = "اختر ملف IFC";
const ANOTHER_FILE = "اختر ملفًا آخر";
const NEXT_FILE = "فحص ملف آخر";
const CANCEL = "إلغاء";
const CANCELLED = "أُلغي الفحص.";
const CHANGE_ACTIVITY = "تغيير النشاط";
const LOADING_FILE = "جارٍ تحميل الملف";
const SAMPLE_ERROR = "تعذر تحميل العينة. حاول مرة أخرى.";
const SAMPLES_TITLE = "أو جرّب مخططًا جاهزًا";
const SAMPLES_HINT = "ضغطة واحدة تفحص العينة.";
const DOWNLOAD = "تنزيل";
const STAGES_LABEL = "مراحل الفحص";
const stagesText = (done: number, total: number) => `${done} من ${total} مراحل`;
const STAGE_STATE: Record<StageState, string> = {
  pending: "لم تبدأ",
  running: "جارية",
  completed: "اكتملت",
  failed: "توقفت",
};

/* The digital twin's illustrative BIM files (public/demo-bim), as the old upload screen offered them. */
const LIBRARY_FILES = [
  { name: "Architectural.ifc", label: "العمارة والغرف" },
  { name: "Structural.ifc", label: "الإنشاء" },
  { name: "MEP.ifc", label: "الكهرباء والمياه والصرف والتكييف" },
  { name: "FireSafety.ifc", label: "أنظمة الحريق" },
  { name: "FurnitureDemo.gltf", label: "أثاث ثلاثي الأبعاد" },
] as const;

const LIBRARY_GROUPS = [
  { key: "building", title: "مبنى من خمسة أدوار", base: "/demo-bim/" },
  { key: "cafe", title: "حزمة المقهى", base: "/demo-bim/venues/cafe/" },
  { key: "restaurant", title: "حزمة المطعم", base: "/demo-bim/venues/restaurant/" },
] as const;

type RunRequest = {
  key: number;
  upload: IfcUpload;
  activityId: ActivityId;
  facility: CheckProps["facility"];
  /** Started from a sample link (landing page or #/check?sample=): open the results as soon as the run succeeds. */
  auto: boolean;
};

type StageView = { id: StageId; label: string; state: StageState; durationMs?: number };

type Outcome = { key: number; run?: ComplianceRun; failure?: CheckFailure };

/** What is being read before the run starts: a picked file or a sample. */
type Loading = { name: string; sampleId?: SampleId };

/** A problem found before the run (file type/size, unreadable file, sample fetch, missing area). */
type Problem = { message: string; area?: boolean };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function Check({
  activityId,
  facility,
  onActivityChange,
  onFacilityChange,
  autoSample,
  onDone,
  onTwin,
}: CheckProps) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [areaText, setAreaText] = useState(() => formatArea(facility.area));
  const [areaTouched, setAreaTouched] = useState(false);
  const [loading, setLoading] = useState<Loading>();
  const [problem, setProblem] = useState<Problem>();
  const [dragging, setDragging] = useState(false);
  const [request, setRequest] = useState<RunRequest>();
  const [stages, setStages] = useState<StageView[]>([]);
  const [outcome, setOutcome] = useState<Outcome>();
  const [notice, setNotice] = useState("");

  const latest = useRef({ facility, activityId, onDone });
  useLayoutEffect(() => {
    latest.current = { facility, activityId, onDone };
  });

  const readToken = useRef(0);
  const requestKey = useRef(0);
  const autoHandled = useRef<SampleId | undefined>(undefined);
  const areaRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const runHeadingRef = useRef<HTMLHeadingElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes after the zone re-renders: the choose button (error, cancel) or the run heading. */
  const focusNext = useRef<"choose" | "run" | undefined>(undefined);

  const areaValid = isAreaValid(facility.area);
  const running = Boolean(request) && outcome?.key !== request?.key;
  const run = !running && !loading && outcome?.key === request?.key ? outcome?.run : undefined;
  const failure = !running && !loading && outcome?.key === request?.key ? outcome?.failure : undefined;
  const busy = running || Boolean(loading);
  const view: "idle" | "progress" | "done" = busy ? "progress" : run ? "done" : "idle";
  const showAreaError = areaTouched && !areaValid;
  const done = stagesDone(stages);

  /* Keep the typed text when it already means the stored area (e.g. "284." while typing). */
  useEffect(() => {
    setAreaText((text) => (parseArea(text) === facility.area ? text : formatArea(facility.area)));
  }, [facility.area]);

  /* A finished check belongs to one activity and area; changing either clears it. */
  useEffect(() => {
    setRequest((current) => {
      if (!current) return current;
      const stale = current.activityId !== activityId || current.facility.area !== facility.area;
      return stale ? undefined : current;
    });
  }, [activityId, facility.area]);

  /* The run itself. It only starts when a request is set (never on mount), and aborts on unmount or cancel. */
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const onEvent = (event: PipelineEvent) => {
      if (controller.signal.aborted) return;
      setStages((current) =>
        current.map((stage) =>
          stage.id === event.id
            ? {
                ...stage,
                label: event.label || stage.label,
                state: event.state,
                durationMs: event.durationMs ?? stage.durationMs,
              }
            : stage,
        ),
      );
    };
    runIfcCompliance({
      upload: request.upload,
      facility: request.facility,
      activityId: request.activityId,
      signal: controller.signal,
      onEvent,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setOutcome({ key: request.key, run: result });
        setNotice(copy.check.step3.done);
        if (request.auto) latest.current.onDone(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        focusNext.current = "choose";
        setOutcome({ key: request.key, failure: describeFailure(error) });
      });
    return () => controller.abort();
  }, [request]);

  /* Move focus to the control that continues the flow once the zone has re-rendered. */
  useEffect(() => {
    if (view === "done" && request && !request.auto) {
      openRef.current?.focus();
      return;
    }
    const target = focusNext.current;
    if (!target) return;
    if (target === "run" && view === "progress") {
      focusNext.current = undefined;
      runHeadingRef.current?.focus({ preventScroll: true });
    } else if (target === "choose" && view === "idle") {
      focusNext.current = undefined;
      chooseRef.current?.focus({ preventScroll: true });
    }
  }, [view, request]);

  /* A sample started from the landing page: keep its progress in view. */
  useEffect(() => {
    if (loading?.sampleId && autoHandled.current === loading.sampleId) {
      zoneRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    }
  }, [loading]);

  const begin = (upload: IfcUpload, auto: boolean) => {
    const { facility: current, activityId: activity } = latest.current;
    requestKey.current += 1;
    const labels = getAnalysisStages(activity);
    setStages(STAGE_IDS.map((stageId, index) => ({ id: stageId, label: labels[index], state: "pending" })));
    setOutcome(undefined);
    setRequest({
      key: requestKey.current,
      upload,
      activityId: activity,
      facility: withFacilityDefaults(current, activity),
      auto,
    });
  };

  /** The area must be valid before a file is read; otherwise point at the field and stop. */
  const areaReady = () => {
    if (isAreaValid(latest.current.facility.area)) return true;
    setAreaTouched(true);
    setProblem({ message: AREA_FIRST, area: true });
    areaRef.current?.focus();
    return false;
  };

  /** Clear the previous run and show the progress panel while the file is read. */
  const startLoading = (name: string, sampleId?: SampleId) => {
    setProblem(undefined);
    setNotice("");
    setRequest(undefined);
    setOutcome(undefined);
    focusNext.current = "run";
    setLoading({ name, sampleId });
  };

  const takeFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!areaReady()) return;
    const token = ++readToken.current;
    const fault = checkFileMeta(file.name, file.size);
    if (fault) {
      setRequest(undefined);
      setNotice("");
      setProblem({ message: fault });
      chooseRef.current?.focus();
      return;
    }
    startLoading(file.name);
    let upload: IfcUpload;
    try {
      upload = await readUpload(file);
    } catch {
      if (token !== readToken.current) return;
      setLoading(undefined);
      focusNext.current = "choose";
      setProblem({ message: copy.check.errors.parse });
      return;
    }
    if (token !== readToken.current) return;
    setLoading(undefined);
    begin(upload, false);
  };

  const takeSample = async (sample: SampleFile, auto = false) => {
    if (busy) return;
    if (!areaReady()) return;
    const token = ++readToken.current;
    startLoading(sample.fileName, sample.id);
    let upload: IfcUpload;
    try {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error(String(response.status));
      const file = new File([await response.blob()], sample.fileName, { lastModified: Date.now() });
      const fault = checkFileMeta(file.name, file.size);
      if (fault) throw new Error(fault);
      upload = await readUpload(file);
    } catch {
      if (token !== readToken.current) return;
      setLoading(undefined);
      focusNext.current = "choose";
      setProblem({ message: SAMPLE_ERROR });
      return;
    }
    if (token !== readToken.current) return;
    setLoading(undefined);
    begin(upload, auto);
  };

  /* A sample link (landing page, #/check?sample=): load the sample and run it once. The ref survives
     StrictMode's second effect pass, so the file is fetched and checked a single time. */
  useEffect(() => {
    if (!autoSample || autoHandled.current === autoSample) return;
    autoHandled.current = autoSample;
    void takeSample(sampleById(autoSample), true);
    // takeSample reads the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSample]);

  const changeArea = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setAreaText(text);
    const area = parseArea(text);
    onFacilityChange({ ...facility, area });
    if (problem?.area && isAreaValid(area)) setProblem(undefined);
  };

  const openPicker = () => fileInputRef.current?.click();

  const cancel = () => {
    readToken.current += 1;
    setLoading(undefined);
    setRequest(undefined);
    setOutcome(undefined);
    setProblem(undefined);
    setNotice(CANCELLED);
    focusNext.current = "choose";
  };

  const another = () => {
    setRequest(undefined);
    setOutcome(undefined);
    setProblem(undefined);
    setNotice("");
    focusNext.current = "choose";
    openPicker();
  };

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!busy) setDragging(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) void takeFile(event.dataTransfer.files[0]);
  };
  /* A click anywhere on the empty zone opens the picker too; the button stays the keyboard route. */
  const onZoneClick = (event: MouseEvent<HTMLElement>) => {
    if (view !== "idle" || (event.target as HTMLElement).closest("button, a, input")) return;
    openPicker();
  };

  const tally = run ? tallyOf(run) : undefined;
  const errorMessage = failure ? failure.headline : problem?.message;
  const errorDetail = failure?.detail;
  const showError = view === "idle" && Boolean(errorMessage);
  const fileName = loading?.name ?? request?.upload.name ?? "";
  const progressNow = loading ? 0 : done;

  return (
    <main className="ck">
      <div className="page">
        <div className="ck-inner">
          <header className="ck-head">
            <h1 className="ck-title">{copy.check.title}</h1>
            <p className="ck-lede">{copy.check.lede}</p>
          </header>

          <div className="ck-layout">
            <div className="ck-main">
              {/* Settings: activity and licence area, filled in already */}
              <section className="ck-settings" aria-label={SETTINGS_LABEL}>
                <div className="ck-field">
                  <label className="ck-label" htmlFor={id("activity")}>
                    {copy.check.step1.activityLabel}
                  </label>
                  <div className="ck-control-wrap">
                    <select
                      ref={activityRef}
                      id={id("activity")}
                      className="ck-control ck-control--select"
                      value={activityId}
                      disabled={busy}
                      aria-describedby={id("activity-help")}
                      onChange={(event) => onActivityChange(event.target.value as ActivityId)}
                    >
                      {activityExamples.map((example) => (
                        <option key={example.id} value={example.id}>
                          {example.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="ck-control-icon" size={18} strokeWidth={STROKE} aria-hidden="true" />
                  </div>
                  <p className="ck-help" id={id("activity-help")}>
                    <Bidi text={copy.check.step1.activityHelp} />
                  </p>
                </div>

                <div className="ck-field">
                  <label className="ck-label" htmlFor={id("area")}>
                    {copy.check.step1.areaLabel}
                  </label>
                  <div className="ck-control-wrap">
                    <input
                      ref={areaRef}
                      id={id("area")}
                      className="ck-control ck-control--suffix num"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={areaText}
                      disabled={busy}
                      aria-invalid={showAreaError}
                      aria-describedby={`${id("area-help")}${showAreaError ? ` ${id("area-error")}` : ""}`}
                      onChange={changeArea}
                      onBlur={() => setAreaTouched(true)}
                    />
                    <span className="ck-suffix" aria-hidden="true">
                      {AREA_UNIT}
                    </span>
                  </div>
                  <p className="ck-help" id={id("area-help")}>
                    {copy.check.step1.areaHelp}
                  </p>
                  {showAreaError && (
                    <p className="ck-error" id={id("area-error")} role="alert">
                      <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
                      {AREA_ERROR}
                    </p>
                  )}
                </div>
              </section>

              {/* The drop zone; it turns into the progress panel and then the summary. */}
              <section
                ref={zoneRef}
                aria-labelledby={id("zone-title")}
                className={`ck-zone ck-zone--${view}${dragging ? " is-dragging" : ""}${showError ? " has-error" : ""}`}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={onZoneClick}
              >
                <p className="sr-only" aria-live="polite">
                  {notice}
                </p>

                {showError && (
                  <div className="ck-alert" role="alert">
                    <CircleAlert className="ck-alert__icon" size={22} strokeWidth={STROKE} aria-hidden="true" />
                    <div className="ck-alert__text">
                      <p className="ck-alert__title">
                        <Bidi text={errorMessage!} />
                      </p>
                      {errorDetail && (
                        <p className="ck-alert__detail">
                          <Bidi text={errorDetail} />
                        </p>
                      )}
                      {failure?.kind === "activity" && (
                        <button type="button" className="link" onClick={() => activityRef.current?.focus()}>
                          {CHANGE_ACTIVITY}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {view === "idle" && (
                  <div className="ck-drop">
                    <span className="ck-drop__icon" aria-hidden="true">
                      <FileUp size={32} strokeWidth={STROKE} />
                    </span>
                    <h2 className="ck-drop__title" id={id("zone-title")}>
                      <span className="ck-drop__title--pointer">{DROP_TITLE}</span>
                      <span className="ck-drop__title--touch">{DROP_TITLE_TOUCH}</span>
                    </h2>
                    <span className="ck-drop__or" aria-hidden="true">
                      {DROP_OR}
                    </span>
                    <button
                      ref={chooseRef}
                      type="button"
                      className="btn btn--accent btn--large ck-drop__button"
                      onClick={openPicker}
                    >
                      <FileUp size={20} strokeWidth={2} aria-hidden="true" />
                      <span>{showError && !problem?.area ? ANOTHER_FILE : CHOOSE}</span>
                    </button>
                  </div>
                )}

                {view === "progress" && (
                  <div className="ck-run">
                    <div className="ck-run__head">
                      <h2 className="ck-run__title" id={id("zone-title")} ref={runHeadingRef} tabIndex={-1}>
                        {loading ? LOADING_FILE : copy.check.step3.running}
                      </h2>
                      <p className="ck-run__file">
                        <span className="sr-only">{copy.results.file}: </span>
                        <bdi dir="ltr">{fileName}</bdi>
                      </p>
                    </div>
                    <div
                      className="ck-bar"
                      role="progressbar"
                      aria-label={STAGES_LABEL}
                      aria-valuemin={0}
                      aria-valuemax={STAGE_IDS.length}
                      aria-valuenow={progressNow}
                      aria-valuetext={stagesText(progressNow, STAGE_IDS.length)}
                    >
                      <span
                        className="ck-bar__fill"
                        style={{ inlineSize: `${(progressNow / STAGE_IDS.length) * 100}%` }}
                      />
                    </div>
                    <p className="ck-run__count num" aria-hidden="true">
                      {stagesText(progressNow, STAGE_IDS.length)}
                    </p>
                    <ol className="ck-stages" aria-live="polite" aria-label={STAGES_LABEL}>
                      {(stages.length && !loading
                        ? stages
                        : STAGE_IDS.map((stageId, index) => ({
                            id: stageId,
                            label: getAnalysisStages(activityId)[index],
                            state: "pending" as StageState,
                            durationMs: undefined,
                          }))
                      ).map((stage) => (
                        <li key={stage.id} className={`ck-stage ck-stage--${stage.state}`}>
                          <span className="ck-stage__icon">
                            <StageIcon state={stage.state} />
                          </span>
                          <span className="ck-stage__label">
                            <Bidi text={stage.label} />
                            <span className="sr-only">: {STAGE_STATE[stage.state]}</span>
                          </span>
                          {stage.state === "completed" && stage.durationMs !== undefined && (
                            <span className="ck-stage__time num">{formatDuration(stage.durationMs)}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="ck-run__actions">
                      <button type="button" className="btn btn--secondary" onClick={cancel}>
                        {CANCEL}
                      </button>
                    </div>
                  </div>
                )}

                {view === "done" && run && tally && (
                  <div className="ck-done">
                    <h2 className="ck-done__title" id={id("zone-title")}>
                      <CircleCheck size={24} strokeWidth={STROKE} aria-hidden="true" />
                      {copy.check.step3.done}
                    </h2>
                    <p className="ck-done__file">
                      <span className="sr-only">{copy.results.file}: </span>
                      <bdi dir="ltr">{request?.upload.name}</bdi>
                    </p>
                    <p className="ck-done__scope">
                      <span className="ck-done__scope-label">{copy.results.scope}</span>
                      <span className="ck-done__figure num">
                        {tally.verified} من {tally.total}
                      </span>
                      <span className="ck-done__unit">{clausesWord(tally.total)}</span>
                    </p>
                    <ul className="ck-done__counts">
                      <li>
                        <StatusMark status="fail" label={`${tally.failed} ${copy.status.fail}`} />
                      </li>
                      <li>
                        <StatusMark status="pass" label={`${tally.passed} ${copy.status.pass}`} />
                      </li>
                      <li>
                        <StatusMark status="unknown" label={`${tally.unknown} ${copy.status.unknown}`} />
                      </li>
                    </ul>
                    <div className="ck-done__actions">
                      <button ref={openRef} type="button" className="btn btn--primary btn--large" onClick={() => onDone(run)}>
                        {copy.check.step3.open}
                      </button>
                      <button type="button" className="link" onClick={another}>
                        {NEXT_FILE}
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".ifc"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void takeFile(file);
                  }}
                />
              </section>

              <p className="ck-notes">
                <ShieldCheck size={16} strokeWidth={STROKE} aria-hidden="true" />
                <span>
                  <Bidi text={copy.check.step2.limits} /> {copy.check.step2.privacy}
                </span>
              </p>
            </div>

            <aside className="ck-side">
              <section className="ck-samples" aria-labelledby={id("samples")}>
                <h2 className="ck-subtitle" id={id("samples")}>
                  {SAMPLES_TITLE}
                </h2>
                <p className="ck-help">
                  {SAMPLES_HINT} <Bidi text={copy.check.step2.samplesNote} />
                </p>
                <ul className="ck-chips">
                  {SAMPLE_FILES.map((sample) => {
                    const current = loading?.sampleId === sample.id;
                    return (
                      <li key={sample.id} className={`ck-chip${current ? " is-busy" : ""}`}>
                        <button
                          type="button"
                          className="ck-chip__run"
                          aria-describedby={id(`note-${sample.id}`)}
                          disabled={busy}
                          onClick={() => void takeSample(sample)}
                        >
                          <span className="ck-chip__label">
                            <Bidi text={sample.label} />
                          </span>
                          <span className="ck-chip__note" id={id(`note-${sample.id}`)}>
                            <Bidi text={sample.note} />
                          </span>
                        </button>
                        <a className="ck-chip__download" href={sample.url} download={sample.fileName} title={sample.fileName}>
                          <Download size={18} strokeWidth={STROKE} aria-hidden="true" />
                          <span className="sr-only">
                            {DOWNLOAD} <bdi dir="ltr">{sample.fileName}</bdi>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <details className="ck-library">
                <summary className="ck-library__summary">
                  <span>{copy.check.step2.libraryTitle}</span>
                  <ChevronDown className="ck-library__chevron" size={18} strokeWidth={STROKE} aria-hidden="true" />
                </summary>
                <div className="ck-library__body">
                  <p className="ck-help">{copy.check.step2.libraryNote}</p>
                  {LIBRARY_GROUPS.map((group) => (
                    <div key={group.key} className="ck-library__group">
                      <h3 className="ck-library__title" id={id(`lib-${group.key}`)}>
                        {group.title}
                      </h3>
                      <ul className="ck-library__files" aria-labelledby={id(`lib-${group.key}`)}>
                        {LIBRARY_FILES.map((file) => (
                          <li key={file.name}>
                            <a className="ck-library__file" href={`${group.base}${file.name}`} download={file.name}>
                              <Download size={16} strokeWidth={STROKE} aria-hidden="true" />
                              <span className="sr-only">{DOWNLOAD} </span>
                              <bdi dir="ltr" className="ck-library__file-name">
                                {file.name}
                              </bdi>
                              <span className="ck-library__file-label">
                                {file.label}
                                <span className="sr-only">، {group.title}</span>
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <button type="button" className="btn btn--secondary ck-library__open" onClick={onTwin}>
                    {copy.check.step2.libraryOpen}
                  </button>
                </div>
              </details>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
