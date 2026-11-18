import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Check as CheckIcon,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FileCheck2,
  FileUp,
  FolderOpen,
  Info,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  X,
} from "lucide-react";
import { activityExamples, getAnalysisStages, type ActivityId } from "../data";
import { runIfcCompliance } from "../ifc/pipeline";
import type { ComplianceRun, IfcUpload, PipelineEvent, StageId, StageState } from "../ifc/types";
import { copy } from "../content/copy";
import { SAMPLE_FILES, sampleById, type SampleFile, type SampleId } from "../content/samples";
import { Button, Seal, StatusMark, Wordmark } from "../brand/ui";
import { tallyOf } from "./results/findings";
import {
  STAGE_IDS,
  checkFileMeta,
  clausesWord,
  describeFailure,
  formatArea,
  formatBytes,
  formatDuration,
  isAreaValid,
  parseArea,
  readUpload,
  withFacilityDefaults,
  type CheckFailure,
} from "./check/logic";
import type { CheckProps } from "./types";
import "./check.css";

/* Strings this screen needs that copy.ts does not have. */
const START_LABEL = "ابدأ الفحص";
const AREA_UNIT = "م²";
const AREA_ERROR = "أدخل مساحة أكبر من صفر.";
const START_HINT = "أكمل الخطوتين السابقتين لبدء الفحص.";
const ANOTHER_FILE = "اختر ملفًا آخر";
const CHANGE_ACTIVITY = "تغيير النشاط";
const LOADING_FILE = "جارٍ تحميل الملف";
const SAMPLE_ERROR = "تعذر تحميل العينة. حاول مرة أخرى.";
const STEP_DONE = "، مكتملة";
const STAGE_STATE: Record<StageState, string> = {
  pending: "لم تبدأ",
  running: "جارية",
  completed: "اكتملت",
  failed: "توقفت",
};

const sm = 1.6;

type Picked = { upload: IfcUpload; sampleId?: SampleId };

type RunRequest = {
  key: number;
  upload: IfcUpload;
  activityId: ActivityId;
  facility: CheckProps["facility"];
  /** Started by «جرّب هذا المثال»: open the results as soon as the run succeeds. */
  auto: boolean;
};

type StageView = { id: StageId; label: string; state: StageState; durationMs?: number };

type Outcome = { key: number; run?: ComplianceRun; failure?: CheckFailure };

type Phase = "idle" | "running" | "done" | "error";

type MarkerState = "locked" | "active" | "done";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Bring a step into view and give focus to the control that continues the flow. */
function reveal(section: HTMLElement | null, target: HTMLElement | null | undefined) {
  section?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  target?.focus({ preventScroll: true });
}

/* Keep «50 MB» and hyphenated Latin tokens (ISO-10303-21, file names) on one line. */
const KEEP_TOGETHER = /(\d+(?:\.\d+)? MB|[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)+)/;

function keepTogether(text: string) {
  return text.split(KEEP_TOGETHER).map((part, index) =>
    index % 2 ? (
      <bdi key={index} dir="ltr" className="ck-nowrap">
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}

function Ornament() {
  return (
    <svg className="ck-ornament" viewBox="0 0 168 10" aria-hidden="true">
      <path d="M0 7.5H72M96 7.5H168" stroke="#B98B2E" strokeWidth="1" />
      <path d="M78 9.5L84 0.5L90 9.5Z" fill="#B98B2E" />
    </svg>
  );
}

function StepMarker({ n, state }: { n: number; state: MarkerState }) {
  return (
    <span className={`ck-marker ck-marker--${state}`} aria-hidden="true">
      {n}
    </span>
  );
}

function StageGlyph({ state }: { state: StageState }) {
  return (
    <span className={`ck-glyph ck-glyph--${state}`} aria-hidden="true">
      {state === "completed" && <CheckIcon size={13} strokeWidth={3} />}
      {state === "failed" && <X size={13} strokeWidth={3} />}
    </span>
  );
}

export default function Check({
  activityId,
  facility,
  onActivityChange,
  onFacilityChange,
  autoSample,
  onDone,
  onHome,
}: CheckProps) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [areaText, setAreaText] = useState(() => formatArea(facility.area));
  const [areaTouched, setAreaTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [picked, setPicked] = useState<Picked>();
  const [loading, setLoading] = useState<"file" | SampleId>();
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [request, setRequest] = useState<RunRequest>();
  const [stages, setStages] = useState<StageView[]>([]);
  const [outcome, setOutcome] = useState<Outcome>();

  const latest = useRef({ facility, activityId, onDone });
  useLayoutEffect(() => {
    latest.current = { facility, activityId, onDone };
  });

  const readToken = useRef(0);
  const requestKey = useRef(0);
  const autoHandled = useRef<SampleId | undefined>(undefined);
  const areaRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLSelectElement>(null);
  const step1Ref = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const step2Ref = useRef<HTMLElement>(null);
  const step2Heading = useRef<HTMLHeadingElement>(null);
  const step3Ref = useRef<HTMLElement>(null);
  const chooseRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const step1Valid = isAreaValid(facility.area);
  const step2Valid = Boolean(picked) && !loading;
  const ready = step1Valid && step2Valid;
  const phase: Phase = !request
    ? "idle"
    : outcome?.key !== request.key
      ? "running"
      : outcome.run
        ? "done"
        : "error";
  const running = phase === "running";
  const showAreaError = areaTouched && !step1Valid;

  const marker1: MarkerState = step1Valid && (confirmed || Boolean(picked)) ? "done" : "active";
  const marker2: MarkerState = !step1Valid ? "locked" : step2Valid ? "done" : "active";
  const marker3: MarkerState = !ready ? "locked" : phase === "done" ? "done" : "active";

  /* Keep the typed text when it already means the stored area (e.g. "284." while typing). */
  useEffect(() => {
    setAreaText((text) => (parseArea(text) === facility.area ? text : formatArea(facility.area)));
  }, [facility.area]);

  /* A finished or running check belongs to one file, activity and area; changing any of them clears it. */
  useEffect(() => {
    setRequest((current) => {
      if (!current) return current;
      const stale =
        current.upload !== picked?.upload ||
        current.activityId !== activityId ||
        current.facility.area !== facility.area;
      return stale ? undefined : current;
    });
  }, [picked, activityId, facility.area]);

  /* The run itself. It only starts when a request is set (never on mount), and aborts on unmount. */
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
      .then((run) => {
        if (controller.signal.aborted) return;
        setOutcome({ key: request.key, run });
        if (request.auto) latest.current.onDone(run);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOutcome({ key: request.key, failure: describeFailure(error) });
      });
    return () => controller.abort();
  }, [request]);

  /* A sample started from the landing page runs below the fold: bring its stages into view. */
  useEffect(() => {
    if (request?.auto) reveal(step3Ref.current, undefined);
  }, [request]);

  /* After a check the visitor started by hand, the next useful control is «عرض النتائج». */
  useEffect(() => {
    if (phase === "done" && request && !request.auto) {
      doneRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [phase, request]);

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

  const takeFile = async (file: File | undefined) => {
    if (!file || running) return;
    const token = ++readToken.current;
    setFileError("");
    setPicked(undefined);
    const problem = checkFileMeta(file.name, file.size);
    if (problem) {
      setLoading(undefined);
      setFileError(problem);
      return;
    }
    setLoading("file");
    try {
      const upload = await readUpload(file);
      if (token !== readToken.current) return;
      setPicked({ upload });
    } catch {
      if (token !== readToken.current) return;
      setFileError(copy.check.errors.parse);
    }
    if (token === readToken.current) setLoading(undefined);
  };

  const takeSample = async (sample: SampleFile, auto = false) => {
    if (running) return;
    const token = ++readToken.current;
    setFileError("");
    setPicked(undefined);
    setLoading(sample.id);
    let upload: IfcUpload;
    try {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error(String(response.status));
      const file = new File([await response.blob()], sample.fileName, { lastModified: Date.now() });
      const problem = checkFileMeta(file.name, file.size);
      if (problem) throw new Error(problem);
      upload = await readUpload(file);
    } catch {
      if (token !== readToken.current) return;
      setLoading(undefined);
      setFileError(SAMPLE_ERROR);
      return;
    }
    if (token !== readToken.current) return;
    setLoading(undefined);
    setPicked({ upload, sampleId: sample.id });
    if (!auto) return;
    if (!isAreaValid(latest.current.facility.area)) {
      setAreaTouched(true);
      return;
    }
    begin(upload, true);
  };

  /* «جرّب هذا المثال» on the landing page: load the sample and run it once. The ref survives
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
    onFacilityChange({ ...facility, area: parseArea(text) });
  };

  const goToStep2 = () => {
    setAreaTouched(true);
    if (!step1Valid) {
      areaRef.current?.focus();
      return;
    }
    setConfirmed(true);
    reveal(step2Ref.current, step2Heading.current);
  };

  const openPicker = () => fileInputRef.current?.click();

  const start = () => {
    if (running) return;
    if (!ready) {
      setAreaTouched(true);
      if (!step1Valid) areaRef.current?.focus();
      else reveal(step2Ref.current, chooseRef.current?.querySelector("button"));
      return;
    }
    setConfirmed(true);
    begin(picked!.upload, false);
  };

  const chooseAnother = () => {
    readToken.current += 1;
    setPicked(undefined);
    setFileError("");
    setLoading(undefined);
    reveal(step2Ref.current, chooseRef.current?.querySelector("button"));
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!running) setDragging(true);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = running ? "none" : "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!running) void takeFile(event.dataTransfer.files[0]);
  };

  const run = phase === "done" ? outcome?.run : undefined;
  const failure = phase === "error" ? outcome?.failure : undefined;
  const tally = run ? tallyOf(run) : undefined;
  const coverage = tally ? { verified: tally.verified, total: tally.total } : undefined;

  return (
    <div className="ck">
      <header className="ck-bar">
        <div className="ck-wrap ck-bar__in">
          <Wordmark onClick={onHome} />
        </div>
      </header>

      <main className="ck-main">
        <div className="ck-wrap">
          <div className="ck-head">
            <Ornament />
            <h1>{copy.check.title}</h1>
            <p>{copy.check.lede}</p>
          </div>
          <span className="gold-rule ck-rule" aria-hidden="true" />

          <ol className="ck-steps">
            {/* Step 1: activity and licence area */}
            <li className={`ck-step ck-step--${marker1}`}>
              <section ref={step1Ref} aria-labelledby={id("s1")} className="ck-anchor">
                <StepMarker n={1} state={marker1} />
                <div className="ck-step__body">
                  <h2 id={id("s1")} className="ck-step__title">
                    {copy.check.step1.title}
                    {marker1 === "done" && <span className="sr-only">{STEP_DONE}</span>}
                  </h2>
                  <div className="ck-fields">
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
                          disabled={running}
                          aria-describedby={id("activity-help")}
                          onChange={(event) => onActivityChange(event.target.value as ActivityId)}
                        >
                          {activityExamples.map((example) => (
                            <option key={example.id} value={example.id}>
                              {example.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="ck-control-icon" size={18} strokeWidth={sm} aria-hidden="true" />
                      </div>
                      <p className="ck-help" id={id("activity-help")}>
                        {copy.check.step1.activityHelp}
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
                          type="number"
                          inputMode="decimal"
                          min={1}
                          step="any"
                          required
                          value={areaText}
                          disabled={running}
                          aria-invalid={showAreaError}
                          aria-describedby={`${id("area-help")}${showAreaError ? ` ${id("area-error")}` : ""}`}
                          onChange={changeArea}
                          onBlur={() => setAreaTouched(true)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") goToStep2();
                          }}
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
                          <CircleAlert size={16} strokeWidth={sm} aria-hidden="true" />
                          {AREA_ERROR}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ck-actions">
                    <Button
                      variant="secondary"
                      icon={<ChevronDown size={18} strokeWidth={sm} />}
                      onClick={goToStep2}
                      disabled={running}
                    >
                      {copy.check.step1.next}
                    </Button>
                  </div>
                </div>
              </section>
            </li>

            {/* Step 2: the plan file */}
            <li className={`ck-step ck-step--${marker2}`}>
              <section ref={step2Ref} aria-labelledby={id("s2")} className="ck-anchor">
                <StepMarker n={2} state={marker2} />
                <div className="ck-step__body">
                  <h2 id={id("s2")} ref={step2Heading} tabIndex={-1} className="ck-step__title">
                    {copy.check.step2.title}
                    {marker2 === "done" && <span className="sr-only">{STEP_DONE}</span>}
                  </h2>
                  <div className="ck-upload">
                    <div>
                      <div
                        className={`ck-drop${dragging ? " is-dragging" : ""}${picked ? " is-picked" : ""}`}
                        onDragEnter={onDragEnter}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                      >
                        <span className="ck-drop__icon" aria-hidden="true">
                          {picked ? (
                            <FileCheck2 size={24} strokeWidth={sm} />
                          ) : (
                            <FileUp size={24} strokeWidth={sm} />
                          )}
                        </span>
                        <div className="ck-drop__text" aria-live="polite">
                          {picked ? (
                            <>
                              <p className="ck-drop__file">
                                <span className="sr-only">{copy.results.file}: </span>
                                <bdi dir="ltr">{picked.upload.name}</bdi>
                              </p>
                              <p className="ck-drop__help">
                                <bdi dir="ltr">{formatBytes(picked.upload.size)}</bdi>
                              </p>
                            </>
                          ) : loading ? (
                            <p className="ck-drop__help">{LOADING_FILE}</p>
                          ) : (
                            <>
                              <h3 className="ck-drop__title">{copy.check.step2.dropTitle}</h3>
                              <p className="ck-drop__help">{copy.check.step2.dropHelp}</p>
                            </>
                          )}
                        </div>
                        <div ref={chooseRef} className="ck-drop__action">
                          <Button
                            variant="secondary"
                            icon={<FolderOpen size={18} strokeWidth={sm} />}
                            onClick={openPicker}
                            disabled={running}
                          >
                            {copy.check.step2.dropButton}
                          </Button>
                        </div>
                        <input
                          ref={fileInputRef}
                          className="sr-only"
                          type="file"
                          accept=".ifc"
                          tabIndex={-1}
                          aria-hidden="true"
                          disabled={running}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void takeFile(file);
                          }}
                        />
                      </div>
                      {fileError && (
                        <p className="ck-error ck-error--file" role="alert">
                          <CircleAlert size={16} strokeWidth={sm} aria-hidden="true" />
                          {fileError}
                        </p>
                      )}
                      <ul className="ck-notes">
                        <li>
                          <Info size={16} strokeWidth={sm} aria-hidden="true" />
                          <span>{keepTogether(copy.check.step2.limits)}</span>
                        </li>
                        <li>
                          <ShieldCheck size={16} strokeWidth={sm} aria-hidden="true" />
                          {copy.check.step2.privacy}
                        </li>
                      </ul>
                    </div>

                    <div className="ck-samples">
                      <h3 className="ck-samples__title" id={id("samples")}>
                        {copy.check.step2.samplesLabel}
                      </h3>
                      <ul aria-labelledby={id("samples")}>
                        {SAMPLE_FILES.map((sample) => {
                          const selected = picked?.sampleId === sample.id;
                          const busy = loading === sample.id;
                          return (
                            <li key={sample.id}>
                              <button
                                type="button"
                                className="ck-sample"
                                aria-pressed={selected}
                                disabled={running || busy}
                                onClick={() => void takeSample(sample)}
                              >
                                <span className="ck-sample__dot" aria-hidden="true" />
                                <span className="ck-sample__text">
                                  <span className="ck-sample__label">{sample.label}</span>
                                  <span className="ck-sample__note">{busy ? LOADING_FILE : sample.note}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            </li>

            {/* Step 3: run and outcome */}
            <li className={`ck-step ck-step--${marker3}`}>
              <section ref={step3Ref} aria-labelledby={id("s3")} className="ck-anchor">
                <StepMarker n={3} state={marker3} />
                <div className="ck-step__body">
                  <h2 id={id("s3")} className="ck-step__title">
                    {copy.check.step3.title}
                    {marker3 === "done" && <span className="sr-only">{STEP_DONE}</span>}
                  </h2>

                  {phase === "idle" && (
                    <div className="ck-ready">
                      {ready ? (
                        <p className="ck-ready__file">
                          {copy.results.file}: <bdi dir="ltr">{picked!.upload.name}</bdi>
                        </p>
                      ) : (
                        <p className="ck-help" id={id("start-hint")}>
                          {START_HINT}
                        </p>
                      )}
                      <Button
                        variant="primary"
                        icon={<ScanSearch size={18} strokeWidth={sm} />}
                        aria-disabled={!ready}
                        aria-describedby={ready ? undefined : id("start-hint")}
                        onClick={start}
                      >
                        {START_LABEL}
                      </Button>
                    </div>
                  )}

                  {phase !== "idle" && request && (
                    <>
                      <p className="ck-runline">
                        {running ? (
                          <strong>{copy.check.step3.running}</strong>
                        ) : (
                          <span>{copy.results.file}:</span>
                        )}
                        <bdi dir="ltr">{request.upload.name}</bdi>
                      </p>
                      <ol className="ck-stages" aria-live="polite">
                        {stages.map((stage) => (
                          <li key={stage.id} className={`ck-stage ck-stage--${stage.state}`}>
                            <StageGlyph state={stage.state} />
                            <span className="ck-stage__label">
                              {stage.label}
                              <span className="sr-only">: {STAGE_STATE[stage.state]}</span>
                            </span>
                            {stage.state === "completed" && stage.durationMs !== undefined && (
                              <span className="ck-stage__time num">{formatDuration(stage.durationMs)}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  <div className="ck-outcome" aria-live="polite">
                    {run && coverage && (
                      <div className="ck-done" ref={doneRef}>
                        <Seal
                          size={128}
                          main={`${coverage.verified} من ${coverage.total}`}
                          label={`${copy.results.scope}: ${coverage.verified} من ${coverage.total} ${clausesWord(coverage.total)}`}
                          className="ck-done__seal"
                        />
                        <div className="ck-done__text">
                          <h3>{copy.check.step3.done}</h3>
                          <p className="ck-done__scope">
                            {copy.results.scope}:{" "}
                            <strong className="num">
                              {coverage.verified} من {coverage.total}
                            </strong>{" "}
                            {clausesWord(coverage.total)}
                          </p>
                          <ul className="ck-done__counts">
                            <li>
                              <StatusMark status="pass" label={`${tally?.passed ?? 0} ${copy.status.pass}`} />
                            </li>
                            <li>
                              <StatusMark status="fail" label={`${tally?.failed ?? 0} ${copy.status.fail}`} />
                            </li>
                            <li>
                              <StatusMark status="unknown" label={`${tally?.unknown ?? 0} ${copy.status.unknown}`} />
                            </li>
                          </ul>
                          <Button
                            variant="primary"
                            icon={<ListChecks size={18} strokeWidth={sm} />}
                            onClick={() => onDone(run)}
                          >
                            {copy.check.step3.open}
                          </Button>
                        </div>
                      </div>
                    )}

                    {failure && (
                      <div className="ck-fail" role="alert">
                        <span className="ck-glyph ck-glyph--failed ck-fail__glyph" aria-hidden="true">
                          <X size={15} strokeWidth={3} />
                        </span>
                        <div className="ck-fail__text">
                          <h3>{keepTogether(failure.headline)}</h3>
                          {failure.detail && <p>{keepTogether(failure.detail)}</p>}
                          {failure.kind === "activity" ? (
                            <Button
                              variant="secondary"
                              icon={<ChevronUp size={18} strokeWidth={sm} />}
                              onClick={() => reveal(step1Ref.current, activityRef.current)}
                            >
                              {CHANGE_ACTIVITY}
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              icon={<FolderOpen size={18} strokeWidth={sm} />}
                              onClick={chooseAnother}
                            >
                              {ANOTHER_FILE}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </li>
          </ol>
        </div>
      </main>

      <footer className="ck-foot">
        <div className="ck-wrap">
          <span className="gold-rule" aria-hidden="true" />
          <p>{copy.footer.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
