import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Check as CheckGlyph, ChevronDown, CircleAlert, Download, Info, Upload } from "../brand/icons";
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
  formatBytes,
  formatDuration,
  isAreaValid,
  parseArea,
  readUpload,
  sampleSetup,
  stagesDone,
  stepStatus,
  withFacilityDefaults,
  type CheckFailure,
  type WizardStep,
} from "./check/logic";
import { Bidi, STROKE, StageIcon } from "./check/parts";
import type { CheckProps } from "./types";
import "./check.css";

const wizard = copy.web.wizard;

/* Strings this screen needs that copy.ts does not have. */
const AREA_UNIT = "م²";
const AREA_UNIT_SPOKEN = "بالمتر المربع";
const AREA_ERROR = "أدخل مساحة أكبر من صفر.";
const DROP_HERE = "اسحب الملف هنا";
const READING = "جارٍ قراءة الملف.";
const CANCEL = "إلغاء";
const CANCELLED = "أُلغي الفحص.";
const SAMPLE_ERROR = "تعذر تحميل العينة. حاول مرة أخرى.";
const ERROR_TITLE = "تعذر إكمال الفحص.";
const STEPS_LABEL = "خطوات الفحص";
const STEP_DONE = "مكتملة";
const STAGES_LABEL = "مراحل الفحص";
const DOWNLOAD = "تنزيل";
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

/** The user's choice on step 2: their own file or one of the ready samples. */
type Choice = "file" | SampleId;

/** What a check reads: the user's own file (already read and validated) or a ready sample (fetched on start). */
type Plan = { kind: "file"; upload: IfcUpload } | { kind: "sample"; sample: SampleFile };

type RunRequest = {
  key: number;
  plan: Plan;
  activityId: ActivityId;
  facility: CheckProps["facility"];
};

type StageView = { id: StageId; label: string; state: StageState; durationMs?: number };

type Outcome = { key: number; run?: ComplianceRun; failure?: CheckFailure };

/** Step 3 moves from the review to the running check, then to the summary or an error. */
type Phase = "review" | "running" | "done" | "error";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function pendingStages(activityId: ActivityId): StageView[] {
  const labels = getAnalysisStages(activityId);
  return STAGE_IDS.map((stageId, index) => ({ id: stageId, label: labels[index], state: "pending" }));
}

/** A ready sample, fetched and checked like a chosen file (type, size, STEP header). */
async function loadSample(sample: SampleFile, signal: AbortSignal): Promise<IfcUpload> {
  const response = await fetch(sample.url, { signal });
  if (!response.ok) throw new Error(String(response.status));
  const file = new File([await response.blob()], sample.fileName, { lastModified: Date.now() });
  const fault = checkFileMeta(file.name, file.size);
  if (fault) throw new Error(fault);
  return readUpload(file);
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

  /* A sample link opens the review straight away, with that sample chosen. */
  const [step, setStep] = useState<WizardStep>(autoSample ? 3 : 1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [areaText, setAreaText] = useState(() => formatArea(facility.area));
  const [areaTouched, setAreaTouched] = useState(false);
  const [file, setFile] = useState<IfcUpload>();
  const [choice, setChoice] = useState<Choice | undefined>(autoSample);
  const [fileError, setFileError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [request, setRequest] = useState<RunRequest>();
  const [stages, setStages] = useState<StageView[]>([]);
  const [outcome, setOutcome] = useState<Outcome>();
  const [notice, setNotice] = useState("");

  const latest = useRef({ activityId, facility });
  useLayoutEffect(() => {
    latest.current = { activityId, facility };
  });

  const requestKey = useRef(0);
  const readToken = useRef(0);
  const autoHandled = useRef(autoSample);
  const stepsRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRadioRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLButtonElement>(null);
  /** Set when a file was just read, so focus can move to its row (the upload button is gone by then). */
  const focusFileRow = useRef(false);

  const current = outcome && request && outcome.key === request.key ? outcome : undefined;
  const phase: Phase = !request ? "review" : !current ? "running" : current.run ? "done" : "error";
  const running = step === 3 && phase === "running";
  const run = step === 3 ? current?.run : undefined;
  const failure = step === 3 ? current?.failure : undefined;
  const finished = step === 3 && phase === "done";
  const viewKey = step === 3 ? `3-${phase}` : String(step);

  const areaValid = isAreaValid(facility.area);
  const showAreaError = areaTouched && !areaValid;
  const sample = choice && choice !== "file" ? sampleById(choice) : undefined;
  const hasPlan = choice === "file" ? Boolean(file) : Boolean(sample);
  const activityLabel = activityExamples.find((example) => example.id === activityId)?.label ?? activityId;

  /* Keep the typed text when it already means the stored area (e.g. "284." while typing). */
  useEffect(() => {
    setAreaText((text) => (parseArea(text) === facility.area ? text : formatArea(facility.area)));
  }, [facility.area]);

  /* A sample link (landing page, #/check?sample=id): choose that sample, fill what the review needs and open
     the review. Nothing runs until «ابدأ الفحص». The ref survives StrictMode's second effect pass. */
  useEffect(() => {
    if (!autoSample) return;
    if (autoHandled.current !== autoSample) {
      autoHandled.current = autoSample;
      readToken.current += 1;
      setReading(false);
      setRequest(undefined);
      setOutcome(undefined);
      setFileError(undefined);
      setNotice("");
      setChoice(autoSample);
      setDirection("forward");
      setStep(3);
    }
    const setup = sampleSetup(latest.current.activityId, latest.current.facility.area);
    if (setup && "activityId" in setup) onActivityChange(setup.activityId);
    else if (setup) onFacilityChange({ ...latest.current.facility, area: setup.area });
    // Only a new sample link does this; the latest project data comes through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSample]);

  /* The check itself. It starts only when «ابدأ الفحص» sets a request, and aborts on cancel, on leaving the
     step or on unmount. */
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const { signal } = controller;
    const onEvent = (event: PipelineEvent) => {
      if (signal.aborted) return;
      setStages((list) =>
        list.map((stage) =>
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
    void (async () => {
      let upload: IfcUpload;
      if (request.plan.kind === "file") {
        upload = request.plan.upload;
      } else {
        try {
          upload = await loadSample(request.plan.sample, signal);
        } catch {
          if (signal.aborted) return;
          setOutcome({ key: request.key, failure: { headline: SAMPLE_ERROR } });
          return;
        }
      }
      if (signal.aborted) return;
      try {
        const result = await runIfcCompliance({
          upload,
          facility: request.facility,
          activityId: request.activityId,
          signal,
          onEvent,
        });
        if (signal.aborted) return;
        setOutcome({ key: request.key, run: result });
        setNotice(wizard.done);
      } catch (error: unknown) {
        if (signal.aborted) return;
        setOutcome({ key: request.key, failure: describeFailure(error) });
      }
    })();
    return () => controller.abort();
  }, [request]);

  /* After a change made further down the page, bring the title and the step indicator back into view. */
  const revealSteps = () => {
    const steps = stepsRef.current;
    if (!steps || steps.getBoundingClientRect().top >= 64) return;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  /* Focus follows the flow: the new step's heading, the running heading, and the results button once done. */
  const shownView = useRef(viewKey);
  useEffect(() => {
    if (shownView.current === viewKey) return;
    shownView.current = viewKey;
    if (viewKey === "3-done") {
      resultsRef.current?.focus();
      return;
    }
    revealSteps();
    headingRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  /* A file was just read: its row replaced the drop zone, so focus moves to it. */
  useEffect(() => {
    if (!file || !focusFileRow.current) return;
    focusFileRow.current = false;
    fileRadioRef.current?.focus();
  }, [file]);

  const goTo = (next: WizardStep) => {
    if (next === step || running) return;
    setDirection(next > step ? "forward" : "back");
    setRequest(undefined);
    setOutcome(undefined);
    setNotice("");
    setStep(next);
  };

  const changeArea = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setAreaText(text);
    onFacilityChange({ ...facility, area: parseArea(text) });
  };

  const submitProject = (event: FormEvent) => {
    event.preventDefault();
    if (!areaValid) {
      setAreaTouched(true);
      areaRef.current?.focus();
      return;
    }
    goTo(2);
  };

  const submitPlan = (event: FormEvent) => {
    event.preventDefault();
    if (hasPlan && !reading) goTo(3);
  };

  /** A file from the picker or a drop: type and size first, then the bytes and their STEP header. */
  const takeFile = async (picked: File | undefined) => {
    if (!picked) return;
    const fault = checkFileMeta(picked.name, picked.size);
    if (fault) {
      setFileError(fault);
      return;
    }
    const token = ++readToken.current;
    setFileError(undefined);
    setReading(true);
    try {
      const upload = await readUpload(picked);
      if (token !== readToken.current) return;
      focusFileRow.current = true;
      setFile(upload);
      setChoice("file");
    } catch {
      if (token !== readToken.current) return;
      setFileError(copy.check.errors.parse);
    } finally {
      if (token === readToken.current) setReading(false);
    }
  };

  const pickSample = (sampleId: SampleId) => {
    if (reading) {
      readToken.current += 1;
      setReading(false);
    }
    setFileError(undefined);
    setChoice(sampleId);
  };

  const openPicker = () => fileInputRef.current?.click();

  const start = () => {
    if (running) return;
    const plan: Plan | undefined =
      choice === "file" && file ? { kind: "file", upload: file } : sample ? { kind: "sample", sample } : undefined;
    if (!plan) return goTo(2);
    if (!areaValid) {
      setAreaTouched(true);
      return goTo(1);
    }
    requestKey.current += 1;
    setStages(pendingStages(activityId));
    setOutcome(undefined);
    setNotice("");
    setRequest({
      key: requestKey.current,
      plan,
      activityId,
      facility: withFacilityDefaults(facility, activityId),
    });
  };

  const cancel = () => {
    setRequest(undefined);
    setOutcome(undefined);
    setNotice(CANCELLED);
  };

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void takeFile(event.dataTransfer.files[0]);
  };
  /* A click anywhere on the zone opens the picker too; the button stays the keyboard route. */
  const onZoneClick = (event: MouseEvent<HTMLElement>) => {
    if (reading || (event.target as HTMLElement).closest("button, a, input")) return;
    openPicker();
  };

  const done = stagesDone(stages);
  const tally = run ? tallyOf(run) : undefined;
  const runFile = request ? (request.plan.kind === "file" ? request.plan.upload.name : request.plan.sample.fileName) : "";
  const heading = (text: string) => (
    <h2 ref={headingRef} id={id("heading")} className="ck-heading" tabIndex={-1}>
      {text}
    </h2>
  );

  return (
    <main className="ck">
      <div className="page">
        <h1 className="ck-title">{wizard.title}</h1>

        <ol ref={stepsRef} className="ck-steps" aria-label={STEPS_LABEL}>
          {wizard.steps.map((label, index) => {
            const number = (index + 1) as WizardStep;
            const status = stepStatus(number, step, finished);
            const isCurrent = number === step;
            const content = (
              <>
                <span className="ck-step__dot" aria-hidden="true">
                  {status === "done" ? <CheckGlyph size={16} strokeWidth={3} /> : <span className="num">{number}</span>}
                </span>
                <span className="ck-step__label">{label}</span>
              </>
            );
            return (
              <li
                key={label}
                className={`ck-step ck-step--${status}${isCurrent ? " is-current" : ""}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {status === "done" && !isCurrent ? (
                  <button type="button" className="ck-step__hit" disabled={running} onClick={() => goTo(number)}>
                    {content}
                    <span className="sr-only">، {STEP_DONE}</span>
                  </button>
                ) : (
                  <span className="ck-step__hit">{content}</span>
                )}
              </li>
            );
          })}
        </ol>

        <section className="ck-panel" aria-labelledby={id("heading")}>
          <p className="sr-only" aria-live="polite">
            {notice}
          </p>

          <div key={step} className={`ck-view ck-view--${direction}`}>
            {step === 1 && (
              <form className="ck-form" noValidate onSubmit={submitProject}>
                {heading(wizard.step1Title)}

                <div className="ck-fields">
                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("activity")}>
                      {wizard.activity}
                    </label>
                    <div className="ck-control-wrap">
                      <select
                        id={id("activity")}
                        className="ck-control ck-control--select"
                        value={activityId}
                        aria-describedby={activityId !== "restaurant" ? id("activity-note") : undefined}
                        onChange={(event) => onActivityChange(event.target.value as ActivityId)}
                      >
                        {activityExamples.map((example) => (
                          <option key={example.id} value={example.id}>
                            {example.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="ck-control-icon" size={20} strokeWidth={STROKE} aria-hidden="true" />
                    </div>
                    {activityId !== "restaurant" && (
                      <p className="ck-help ck-help--note" id={id("activity-note")}>
                        <Info size={16} strokeWidth={STROKE} aria-hidden="true" />
                        <span>{copy.check.errors.activity}</span>
                      </p>
                    )}
                  </div>

                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("area")}>
                      {wizard.area}
                      <span className="sr-only"> {AREA_UNIT_SPOKEN}</span>
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
                      {wizard.areaHelp}
                    </p>
                    {showAreaError && (
                      <p className="ck-error" id={id("area-error")} role="alert">
                        <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
                        {AREA_ERROR}
                      </p>
                    )}
                  </div>
                </div>

                <div className="ck-foot">
                  <button type="submit" className="btn btn--primary ck-next">
                    {wizard.next}
                  </button>
                </div>
              </form>
            )}

            {step === 2 && (
              <form className="ck-form" noValidate onSubmit={submitPlan}>
                {heading(wizard.step2Title)}

                <div
                  className="ck-files"
                  onDragEnter={onDragEnter}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  {file ? (
                    <div
                      className={`ck-option ck-file${choice === "file" ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
                    >
                      <label className="ck-option__pick">
                        <input
                          ref={fileRadioRef}
                          type="radio"
                          name={id("plan")}
                          value="file"
                          className="ck-option__input"
                          checked={choice === "file"}
                          aria-labelledby={id("file-name")}
                          aria-describedby={id("file-size")}
                          onChange={() => setChoice("file")}
                        />
                        <span className="ck-radio" aria-hidden="true" />
                        <span className="ck-option__text">
                          <bdi dir="ltr" className="ck-option__label ck-file__name" id={id("file-name")}>
                            {file.name}
                          </bdi>
                          <span className="ck-option__note" id={id("file-size")}>
                            <bdi dir="ltr" className="num">
                              {formatBytes(file.size)}
                            </bdi>
                          </span>
                        </span>
                      </label>
                      <button type="button" className="link ck-file__change" disabled={reading} onClick={openPicker}>
                        {wizard.change}
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`ck-zone${dragging ? " is-dragging" : ""}${fileError ? " has-error" : ""}`}
                      aria-busy={reading}
                      onClick={onZoneClick}
                    >
                      <Upload className="ck-zone__icon" size={34} strokeWidth={1.5} aria-hidden="true" />
                      <p className="ck-zone__title">{reading ? READING : DROP_HERE}</p>
                      <button
                        type="button"
                        className="btn btn--secondary ck-zone__button"
                        disabled={reading}
                        aria-describedby={`${id("upload-help")}${fileError ? ` ${id("file-error")}` : ""}`}
                        onClick={openPicker}
                      >
                        {wizard.upload}
                      </button>
                    </div>
                  )}
                  {fileError && (
                    <p className="ck-error" id={id("file-error")} role="alert">
                      <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
                      <span>
                        <Bidi text={fileError} />
                      </span>
                    </p>
                  )}
                  <p className="ck-help" id={id("upload-help")}>
                    <Bidi text={wizard.uploadHelp} />
                  </p>
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    accept=".ifc"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = "";
                      void takeFile(picked);
                    }}
                  />
                </div>

                <fieldset className="ck-samples">
                  <legend className="ck-subtitle">{wizard.samples}</legend>
                  <div className="ck-options">
                    {SAMPLE_FILES.map((item) => (
                      <label key={item.id} className={`ck-option${choice === item.id ? " is-selected" : ""}`}>
                        <input
                          type="radio"
                          name={id("plan")}
                          value={item.id}
                          className="ck-option__input"
                          checked={choice === item.id}
                          aria-labelledby={id(`label-${item.id}`)}
                          aria-describedby={id(`note-${item.id}`)}
                          onChange={() => pickSample(item.id)}
                        />
                        <span className="ck-radio" aria-hidden="true" />
                        <span className="ck-option__text">
                          <span className="ck-option__label" id={id(`label-${item.id}`)}>
                            <Bidi text={item.label} />
                          </span>
                          <span className="ck-option__note" id={id(`note-${item.id}`)}>
                            <Bidi text={item.note} />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="ck-foot">
                  <button type="button" className="link ck-back" onClick={() => goTo(1)}>
                    {wizard.back}
                  </button>
                  <button type="submit" className="btn btn--primary ck-next" disabled={!hasPlan || reading}>
                    {wizard.next}
                  </button>
                </div>

                <details className="ck-library">
                  <summary className="ck-library__summary">
                    <span>{copy.check.step2.libraryTitle}</span>
                    <ChevronDown className="ck-library__chevron" size={16} strokeWidth={STROKE} aria-hidden="true" />
                  </summary>
                  <div className="ck-library__body">
                    <p className="ck-help">{copy.check.step2.libraryNote}</p>
                    {LIBRARY_GROUPS.map((group) => (
                      <div key={group.key} className="ck-library__group">
                        <h3 className="ck-library__title" id={id(`lib-${group.key}`)}>
                          {group.title}
                        </h3>
                        <ul className="ck-library__files" aria-labelledby={id(`lib-${group.key}`)}>
                          {LIBRARY_FILES.map((item) => (
                            <li key={item.name}>
                              <a className="ck-library__file" href={`${group.base}${item.name}`} download={item.name}>
                                <Download size={16} strokeWidth={STROKE} aria-hidden="true" />
                                <span className="sr-only">{DOWNLOAD} </span>
                                <bdi dir="ltr" className="ck-library__file-name">
                                  {item.name}
                                </bdi>
                                <span className="ck-library__file-label">
                                  {item.label}
                                  <span className="sr-only">، {group.title}</span>
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <button type="button" className="link link--more ck-library__open" onClick={onTwin}>
                      {copy.check.step2.libraryOpen}
                    </button>
                  </div>
                </details>
              </form>
            )}

            {step === 3 && phase === "review" && (
              <div className="ck-phase ck-phase--review">
                {heading(wizard.step3Title)}

                <dl className="ck-review">
                  <div className="ck-review__row">
                    <dt className="ck-review__term">{wizard.reviewActivity}</dt>
                    <dd className="ck-review__value">{activityLabel}</dd>
                    <dd className="ck-review__edit">
                      <button type="button" className="link" onClick={() => goTo(1)}>
                        {wizard.edit}
                        <span className="sr-only"> {wizard.reviewActivity}</span>
                      </button>
                    </dd>
                  </div>
                  <div className="ck-review__row">
                    <dt className="ck-review__term">{wizard.reviewArea}</dt>
                    <dd className="ck-review__value">
                      <span>
                        <span className="num">{formatArea(facility.area)}</span> {AREA_UNIT}
                      </span>
                    </dd>
                    <dd className="ck-review__edit">
                      <button type="button" className="link" onClick={() => goTo(1)}>
                        {wizard.edit}
                        <span className="sr-only"> {wizard.reviewArea}</span>
                      </button>
                    </dd>
                  </div>
                  <div className="ck-review__row">
                    <dt className="ck-review__term">{wizard.reviewFile}</dt>
                    <dd className="ck-review__value">
                      {choice === "file" && file ? (
                        <>
                          <bdi dir="ltr" className="ck-review__file">
                            {file.name}
                          </bdi>
                          <span className="ck-review__detail">
                            <bdi dir="ltr" className="num">
                              {formatBytes(file.size)}
                            </bdi>
                          </span>
                        </>
                      ) : sample ? (
                        <>
                          <span>
                            <Bidi text={sample.label} />
                          </span>
                          <bdi dir="ltr" className="ck-review__detail ck-review__file">
                            {sample.fileName}
                          </bdi>
                        </>
                      ) : null}
                    </dd>
                    <dd className="ck-review__edit">
                      <button type="button" className="link" onClick={() => goTo(2)}>
                        {wizard.edit}
                        <span className="sr-only"> {wizard.reviewFile}</span>
                      </button>
                    </dd>
                  </div>
                </dl>

                <div className="ck-foot">
                  <button type="button" className="link ck-back" onClick={() => goTo(2)}>
                    {wizard.back}
                  </button>
                  <button type="button" className="btn btn--primary btn--large ck-next" onClick={start}>
                    {wizard.start}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && phase === "running" && (
              <div className="ck-phase ck-phase--running">
                {heading(wizard.running)}
                <p className="ck-run__file">
                  <span className="sr-only">{wizard.reviewFile}: </span>
                  <bdi dir="ltr">{runFile}</bdi>
                </p>
                <div
                  className="ck-bar"
                  role="progressbar"
                  aria-label={STAGES_LABEL}
                  aria-valuemin={0}
                  aria-valuemax={STAGE_IDS.length}
                  aria-valuenow={done}
                  aria-valuetext={stagesText(done, STAGE_IDS.length)}
                >
                  <span className="ck-bar__fill" style={{ inlineSize: `${(done / STAGE_IDS.length) * 100}%` }} />
                </div>
                <ol className="ck-stages" aria-live="polite" aria-label={STAGES_LABEL}>
                  {stages.map((stage) => (
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
                <div className="ck-foot ck-foot--quiet">
                  <button type="button" className="link ck-cancel" onClick={cancel}>
                    {CANCEL}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && phase === "done" && run && tally && (
              <div className="ck-phase ck-phase--done">
                {heading(wizard.done)}
                <div className="ck-score">
                  <p className="ck-score__label">{copy.results.scope}</p>
                  <p className="ck-score__figure">
                    <span className="ck-score__value num">
                      {tally.verified} من {tally.total}
                    </span>
                    <span className="ck-score__unit">{clausesWord(tally.total)}</span>
                  </p>
                </div>
                <ul className="ck-counts">
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
                <div className="ck-foot">
                  <button
                    ref={resultsRef}
                    type="button"
                    className="btn btn--primary btn--large ck-next"
                    onClick={() => onDone(run)}
                  >
                    {wizard.results}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && phase === "error" && failure && (
              <div className="ck-phase ck-phase--error">
                {heading(ERROR_TITLE)}
                <div className="ck-alert" role="alert">
                  <CircleAlert className="ck-alert__icon" size={22} strokeWidth={STROKE} aria-hidden="true" />
                  <div className="ck-alert__text">
                    <p className="ck-alert__title">
                      <Bidi text={failure.headline} />
                    </p>
                    {failure.detail && (
                      <p className="ck-alert__detail">
                        <Bidi text={failure.detail} />
                      </p>
                    )}
                  </div>
                </div>
                <div className="ck-foot">
                  {failure.kind === "activity" && (
                    <button type="button" className="link ck-back" onClick={() => goTo(1)}>
                      {wizard.edit} {wizard.reviewActivity}
                    </button>
                  )}
                  <button type="button" className="btn btn--primary ck-next" onClick={() => goTo(2)}>
                    {wizard.change}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
