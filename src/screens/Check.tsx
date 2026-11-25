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
  type ReactNode,
} from "react";
import { Check as CheckGlyph, ChevronDown, CircleAlert, Download, Info, Upload } from "../brand/icons";
import {
  activityExamples,
  buildingTypes,
  getAnalysisStages,
  saudiCities,
  type ActivityId,
  type DeclarationAnswer,
  type DeclarationId,
  type FacilityDeclarations,
  type FacilityDetails,
} from "../data";
import { runIfcCompliance } from "../ifc/pipeline";
import type { ComplianceRun, IfcUpload, PipelineEvent, StageId, StageState } from "../ifc/types";
import { copy } from "../content/copy";
import { SAMPLE_FILES, sampleById, type SampleFile, type SampleId } from "../content/samples";
import { StatusMark } from "../brand/ui";
import { tallyOf } from "./results/findings";
import { saveLastCheck } from "../app/lastCheck";
import {
  STAGE_IDS,
  WIZARD_STEPS,
  checkFileMeta,
  clausesWord,
  describeFailure,
  formatArea,
  formatBytes,
  formatDuration,
  formatFloors,
  formatRunDate,
  isAreaValid,
  isFloorsValid,
  isProjectNameValid,
  isRegistrationValid,
  normalizeRegistration,
  parseArea,
  parseFloors,
  readFailureMessage,
  readUpload,
  sampleSetup,
  stagesDone,
  stepStatus,
  withFacilityDefaults,
  type CheckFailure,
  type WizardStep,
} from "./check/logic";
import {
  ANSWERS,
  DECLARATIONS,
  DECLARATION_NOTE,
  DECLARATION_TITLE,
  answerLabel,
  declarationsComplete,
} from "./check/declarations";
import { Bidi, STROKE, StageIcon } from "./check/parts";
import type { CheckProps } from "./types";
import "./check.css";

const wizard = copy.web.wizard;
const STEP_COUNT = WIZARD_STEPS.length;

/* Strings this screen needs that copy.ts does not have. */
const AREA_UNIT = "م²";
const AREA_UNIT_SPOKEN = "بالمتر المربع";
const AREA_ERROR = "أدخل مساحة الترخيص رقمًا أكبر من صفر ولا يتجاوز 100000 م².";
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
const CLAUSE = "البند";
const stagesText = (done: number, total: number) => `${done} من ${total} مراحل`;
const stepText = (number: number) => `${wizard.stepOf} ${number} من ${STEP_COUNT}`;
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

/** The user's choice on step 4: their own file or one of the ready samples. */
type Choice = "file" | SampleId;

/** What a check reads: the user's own file (already read and validated) or a ready sample (fetched on start). */
type Plan = { kind: "file"; upload: IfcUpload } | { kind: "sample"; sample: SampleFile };

type RunRequest = {
  key: number;
  plan: Plan;
  activityId: ActivityId;
  facility: FacilityDetails;
};

type StageView = { id: StageId; label: string; state: StageState; durationMs?: number };

type Outcome = { key: number; run?: ComplianceRun; failure?: CheckFailure };

/** Step 6 moves from the review to the running check, then to the summary or an error. */
type Phase = "review" | "running" | "done" | "error";

/** The overview (0) or one of the seven steps. */
type View = 0 | WizardStep;

/** Fields of steps 1 and 2 that are validated. */
type FieldKey = "name" | "registration" | "city" | "district" | "buildingType" | "floors" | "area";

const STEP1_FIELDS: readonly FieldKey[] = ["name", "registration"];
const STEP2_FIELDS: readonly FieldKey[] = ["city", "district", "buildingType", "floors", "area"];

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

function activityName(activityId: ActivityId): string {
  return activityExamples.find((example) => example.id === activityId)?.label ?? activityId;
}

/** The facility the engine reads: defaults for blank fields, the registration number normalized, the answers. */
function facilityForRun(
  facility: FacilityDetails,
  activityId: ActivityId,
  declarations: FacilityDeclarations,
): FacilityDetails {
  const { commercialRegistration, ...rest } = withFacilityDefaults(facility, activityId);
  const registration = normalizeRegistration(commercialRegistration ?? "");
  return {
    ...rest,
    ...(registration && isRegistrationValid(registration) ? { commercialRegistration: registration } : {}),
    declarations: { ...declarations },
  };
}

/** «إقرار المستخدم»: each question's clause, subject and answer. */
function DeclarationList({ declarations }: { declarations: FacilityDeclarations | undefined }) {
  return (
    <ul className="ck-decl-list">
      {DECLARATIONS.map((item) => (
        <li key={item.id} className="ck-decl-list__item">
          <span className="ck-decl-list__subject">
            <span className="num">{item.clause}</span> {item.subject}
          </span>
          <span className="ck-decl-list__answer">{answerLabel(declarations?.[item.id])}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Check({
  activityId,
  facility,
  onActivityChange,
  onFacilityChange,
  autoSample,
  onDone,
  onReport,
  onNew,
  onTwin,
}: CheckProps) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  /* The overview comes first; a sample link opens the review straight away, with that sample chosen. */
  const [step, setStep] = useState<View>(autoSample ? 6 : 0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [areaText, setAreaText] = useState(() => formatArea(facility.area));
  const [floorsText, setFloorsText] = useState(() => formatFloors(facility.floors));
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [bodiesSeen, setBodiesSeen] = useState(false);
  const [bodiesTried, setBodiesTried] = useState(false);
  const [declarations, setDeclarations] = useState<FacilityDeclarations>({});
  const [declarationsTried, setDeclarationsTried] = useState(false);
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
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const bodiesRef = useRef<HTMLInputElement>(null);
  const declarationsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRadioRef = useRef<HTMLInputElement>(null);
  const passportRef = useRef<HTMLButtonElement>(null);
  /** Set when a file was just read, so focus can move to its row (the upload button is gone by then). */
  const focusFileRow = useRef(false);

  const current = outcome && request && outcome.key === request.key ? outcome : undefined;
  const phase: Phase = !request ? "review" : !current ? "running" : current.run ? "done" : "error";
  const atRun = step === 6 || step === 7;
  const running = step === 6 && phase === "running";
  const run = atRun ? current?.run : undefined;
  const failure = step === 6 ? current?.failure : undefined;
  const finished = atRun && phase === "done";
  const viewKey = step === 6 ? `6-${phase}` : String(step);

  const registrationText = facility.commercialRegistration ?? "";
  const valid: Record<FieldKey, boolean> = {
    name: isProjectNameValid(facility.projectName),
    registration: isRegistrationValid(registrationText),
    city: saudiCities.includes(facility.city),
    district: facility.district.trim().length > 0,
    buildingType: buildingTypes.includes(facility.buildingType),
    floors: isFloorsValid(facility.floors),
    area: isAreaValid(facility.area),
  };
  const showError = (key: FieldKey) => Boolean(touched[key]) && !valid[key];
  const declarationsDone = declarationsComplete(declarations);
  const sample = choice && choice !== "file" ? sampleById(choice) : undefined;
  const hasPlan = choice === "file" ? Boolean(file) : Boolean(sample);
  const activityLabel = activityName(activityId);

  /* Keep the typed text when it already means the stored value (e.g. "284." while typing). */
  useEffect(() => {
    setAreaText((text) => (parseArea(text) === facility.area ? text : formatArea(facility.area)));
  }, [facility.area]);
  useEffect(() => {
    setFloorsText((text) => (parseFloors(text) === facility.floors ? text : formatFloors(facility.floors)));
  }, [facility.floors]);

  /* A sample link (landing page, #/check?sample=id): choose that sample, fill what the review needs and open
     the review. Nothing runs until «بدء الفحص». The ref survives StrictMode's second effect pass. */
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
      setStep(6);
    }
    const setup = sampleSetup(latest.current.activityId, latest.current.facility.area);
    if (setup && "activityId" in setup) onActivityChange(setup.activityId);
    else if (setup) onFacilityChange({ ...latest.current.facility, area: setup.area });
    // Only a new sample link does this; the latest project data comes through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSample]);

  /* The check itself. It starts only when «بدء الفحص» sets a request, and aborts on cancel, on going back to
     an earlier step or on unmount. */
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
        // Kept on this device only, so a reload of the results or the report can rebuild them (the facility
        // carries the registration number and the declarations).
        void saveLastCheck({ upload, activityId: request.activityId, facility: request.facility });
      } catch (error: unknown) {
        if (signal.aborted) return;
        setOutcome({ key: request.key, failure: describeFailure(error) });
      }
    })();
    return () => controller.abort();
  }, [request]);

  /* A finished check: fetch the results screen and the viewer it will show while the summary is read, so
     «عرض النتائج» does not wait on them (both still load on demand: App.tsx and Results.tsx import them
     lazily, and get these same modules). A failed fetch here is left to those imports to report. */
  useEffect(() => {
    if (!run) return;
    const ignore = () => {};
    import("./Results").catch(ignore);
    if (run.standard) import("../components/IfcModelViewer").catch(ignore);
    else if (run.source !== "standard-ifc") import("../components/Viewer3D").catch(ignore);
  }, [run]);

  /* After a change made further down the page, bring the title and the step indicator back into view. */
  const revealSteps = () => {
    const steps = stepsRef.current;
    if (!steps || steps.getBoundingClientRect().top >= 64) return;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  /* Focus follows the flow: the new step's heading, the running heading, and the next step's button once done. */
  const shownView = useRef(viewKey);
  useEffect(() => {
    if (shownView.current === viewKey) return;
    shownView.current = viewKey;
    if (viewKey === "6-done") {
      passportRef.current?.focus();
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

  /** Steps 1 to 5 change what the check reads, so going back to one of them drops the run; 6 and 7 keep it. */
  const goTo = (next: WizardStep) => {
    if (next === step || running) return;
    if (next === 7 && !run) return;
    setDirection(next > step ? "forward" : "back");
    if (next <= 5) {
      setRequest(undefined);
      setOutcome(undefined);
      setNotice("");
    }
    setStep(next);
  };

  const update = (patch: Partial<FacilityDetails>) => onFacilityChange({ ...facility, ...patch });
  const touch = (key: FieldKey) => setTouched((state) => (state[key] ? state : { ...state, [key]: true }));

  /** Moves on when every field of the step is valid; otherwise shows their errors and focuses the first. */
  const submitFields = (keys: readonly FieldKey[], next: WizardStep) => (event: FormEvent) => {
    event.preventDefault();
    const invalid = keys.filter((key) => !valid[key]);
    if (invalid.length) {
      setTouched((state) => ({ ...state, ...Object.fromEntries(keys.map((key) => [key, true])) }));
      fieldRefs.current[invalid[0]]?.focus();
      return;
    }
    goTo(next);
  };

  const changeArea = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setAreaText(text);
    update({ area: parseArea(text) });
  };

  const changeFloors = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setFloorsText(text);
    update({ floors: parseFloors(text) });
  };

  const submitBodies = (event: FormEvent) => {
    event.preventDefault();
    if (!bodiesSeen) {
      setBodiesTried(true);
      bodiesRef.current?.focus();
      return;
    }
    goTo(4);
  };

  const submitPlan = (event: FormEvent) => {
    event.preventDefault();
    if (hasPlan && !reading) goTo(5);
  };

  const answer = (question: DeclarationId, value: DeclarationAnswer) =>
    setDeclarations((state) => ({ ...state, [question]: value }));

  const submitDeclarations = (event: FormEvent) => {
    event.preventDefault();
    if (!declarationsDone) {
      setDeclarationsTried(true);
      const first = DECLARATIONS.find((item) => !declarations[item.id]);
      declarationsRef.current
        ?.querySelector<HTMLInputElement>(`input[name="${id(`decl-${first?.id ?? ""}`)}"]`)
        ?.focus();
      return;
    }
    goTo(6);
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
    } catch (error: unknown) {
      if (token !== readToken.current) return;
      setFileError(readFailureMessage(error));
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
    if (!plan) return goTo(4);
    if (!valid.area) {
      touch("area");
      return goTo(2);
    }
    requestKey.current += 1;
    setStages(pendingStages(activityId));
    setOutcome(undefined);
    setNotice("");
    setRequest({
      key: requestKey.current,
      plan,
      activityId,
      facility: facilityForRun(facility, activityId, declarations),
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

  /* Props shared by the validated inputs and selects of steps 1 and 2. */
  const fieldProps = (key: FieldKey, help: boolean) => ({
    id: id(key),
    ref: (element: HTMLElement | null) => {
      fieldRefs.current[key] = element;
    },
    "aria-invalid": showError(key),
    "aria-describedby":
      [help ? id(`${key}-help`) : "", showError(key) ? id(`${key}-error`) : ""].filter(Boolean).join(" ") || undefined,
    onBlur: () => touch(key),
  });

  const fieldError = (key: FieldKey, text: string) =>
    showError(key) && (
      <p className="ck-error" id={id(`${key}-error`)} role="alert">
        <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
        <span>{text}</span>
      </p>
    );

  const foot = (back: WizardStep | undefined, nextLabel: ReactNode = wizard.next, disabled = false) => (
    <div className="ck-foot">
      {back && (
        <button type="button" className="link ck-back" onClick={() => goTo(back)}>
          {wizard.back}
        </button>
      )}
      <button type="submit" className="btn btn--primary ck-next" disabled={disabled}>
        {nextLabel}
      </button>
    </div>
  );

  /* One row of the review: the step's name, what was entered, and «تعديل» back to that step. */
  const reviewRow = (number: WizardStep, value: ReactNode) => (
    <div className="ck-review__row">
      <dt className="ck-review__term">{wizard.steps[number - 1]}</dt>
      <dd className="ck-review__value">{value}</dd>
      <dd className="ck-review__edit">
        <button type="button" className="link" onClick={() => goTo(number)}>
          {wizard.edit}
          <span className="sr-only"> {wizard.steps[number - 1]}</span>
        </button>
      </dd>
    </div>
  );

  const counts = tally && (
    <ul className="ck-counts">
      <li>
        <StatusMark status="fail" label={`${tally.failed} ${copy.status.fail}`} />
      </li>
      <li>
        <StatusMark status="unknown" label={`${tally.unknown} ${copy.status.unknown}`} />
      </li>
      <li>
        <StatusMark status="pass" label={`${tally.passed} ${copy.status.pass}`} />
      </li>
    </ul>
  );

  if (step === 0) {
    return (
      <main className="ck ck--overview">
        <div className="page">
          <h1 className="ck-title">{wizard.overviewTitle}</h1>
          <p className="ck-lede ck-lede--center">{wizard.overviewLede}</p>
          <ol className="ck-cards">
            {wizard.steps.map((label, index) => (
              <li key={label} className="ck-card">
                <span className="ck-card__num num" aria-hidden="true">
                  {index + 1}
                </span>
                <h2 className="ck-card__title">{label}</h2>
                <p className="ck-card__note">
                  <Bidi text={wizard.stepNotes[index]} />
                </p>
              </li>
            ))}
          </ol>
          <div className="ck-overview__foot">
            <button type="button" className="btn btn--primary btn--large" onClick={() => goTo(1)}>
              {wizard.overviewStart}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ck">
      <div className="page">
        <h1 className="ck-title">{wizard.title}</h1>

        <ol ref={stepsRef} className="ck-steps" aria-label={STEPS_LABEL}>
          {WIZARD_STEPS.map((number) => {
            const label = wizard.steps[number - 1];
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
        {/* Phones show the dots only; this line names the current step (the list above still names all). */}
        <p className="ck-steps__caption" aria-hidden="true">
          <span className="num">{stepText(step)}</span>: {wizard.steps[step - 1]}
        </p>

        <section className="ck-panel" aria-labelledby={id("heading")}>
          <p className="sr-only" aria-live="polite">
            {notice}
          </p>

          <div key={step} className={`ck-view ck-view--${direction}`}>
            {step === 1 && (
              <form className="ck-form" noValidate onSubmit={submitFields(STEP1_FIELDS, 2)}>
                {heading(wizard.steps[0])}

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
                    <label className="ck-label" htmlFor={id("name")}>
                      {wizard.projectName}
                    </label>
                    <input
                      {...fieldProps("name", true)}
                      className="ck-control"
                      type="text"
                      autoComplete="organization"
                      required
                      value={facility.projectName}
                      onChange={(event) => update({ projectName: event.target.value })}
                    />
                    <p className="ck-help" id={id("name-help")}>
                      {wizard.projectNameHelp}
                    </p>
                    {fieldError("name", wizard.projectNameError)}
                  </div>

                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("registration")}>
                      {wizard.registration} <span className="ck-label__optional">({wizard.optional})</span>
                    </label>
                    <input
                      {...fieldProps("registration", true)}
                      className="ck-control num"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                      value={registrationText}
                      onChange={(event) => update({ commercialRegistration: event.target.value })}
                    />
                    <p className="ck-help" id={id("registration-help")}>
                      {wizard.registrationHelp}
                    </p>
                    {fieldError("registration", wizard.registrationError)}
                  </div>
                </div>

                {foot(undefined)}
              </form>
            )}

            {step === 2 && (
              <form className="ck-form" noValidate onSubmit={submitFields(STEP2_FIELDS, 3)}>
                {heading(wizard.steps[1])}

                <div className="ck-fields ck-fields--pairs">
                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("city")}>
                      {wizard.city}
                    </label>
                    <div className="ck-control-wrap">
                      <select
                        {...fieldProps("city", false)}
                        className="ck-control ck-control--select"
                        required
                        value={valid.city ? facility.city : ""}
                        onChange={(event) => update({ city: event.target.value })}
                      >
                        <option value="" disabled>
                          {wizard.cityPlaceholder}
                        </option>
                        {saudiCities.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="ck-control-icon" size={20} strokeWidth={STROKE} aria-hidden="true" />
                    </div>
                    {fieldError("city", wizard.cityError)}
                  </div>

                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("district")}>
                      {wizard.district}
                    </label>
                    <input
                      {...fieldProps("district", false)}
                      className="ck-control"
                      type="text"
                      autoComplete="address-level3"
                      required
                      value={facility.district}
                      onChange={(event) => update({ district: event.target.value })}
                    />
                    {fieldError("district", wizard.districtError)}
                  </div>

                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("buildingType")}>
                      {wizard.buildingType}
                    </label>
                    <div className="ck-control-wrap">
                      <select
                        {...fieldProps("buildingType", false)}
                        className="ck-control ck-control--select"
                        required
                        value={valid.buildingType ? facility.buildingType : ""}
                        onChange={(event) => update({ buildingType: event.target.value })}
                      >
                        <option value="" disabled>
                          {wizard.buildingTypePlaceholder}
                        </option>
                        {buildingTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="ck-control-icon" size={20} strokeWidth={STROKE} aria-hidden="true" />
                    </div>
                    {fieldError("buildingType", wizard.buildingTypeError)}
                  </div>

                  <div className="ck-field">
                    <label className="ck-label" htmlFor={id("floors")}>
                      {wizard.floors}
                    </label>
                    <input
                      {...fieldProps("floors", true)}
                      className="ck-control num"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={floorsText}
                      onChange={changeFloors}
                    />
                    <p className="ck-help" id={id("floors-help")}>
                      {wizard.floorsHelp}
                    </p>
                    {fieldError("floors", wizard.floorsError)}
                  </div>

                  <div className="ck-field ck-field--wide">
                    <label className="ck-label" htmlFor={id("area")}>
                      {wizard.area}
                      <span className="sr-only"> {AREA_UNIT_SPOKEN}</span>
                    </label>
                    <div className="ck-control-wrap">
                      <input
                        {...fieldProps("area", true)}
                        className="ck-control ck-control--suffix num"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        required
                        value={areaText}
                        onChange={changeArea}
                      />
                      <span className="ck-suffix" aria-hidden="true">
                        {AREA_UNIT}
                      </span>
                    </div>
                    <p className="ck-help" id={id("area-help")}>
                      {wizard.areaHelp}
                    </p>
                    {fieldError("area", AREA_ERROR)}
                  </div>
                </div>

                {foot(1)}
              </form>
            )}

            {step === 3 && (
              <form className="ck-form" noValidate onSubmit={submitBodies}>
                {heading(wizard.steps[2])}
                <p className="ck-lede">{wizard.bodiesLede}</p>

                <ul className="ck-bodies">
                  {wizard.bodies.map((body) => (
                    <li key={body.name} className="ck-body">
                      <h3 className="ck-body__name">
                        <Bidi text={body.name} />
                      </h3>
                      <p className="ck-body__scope">
                        <Bidi text={body.scope} />
                      </p>
                      <p className="ck-body__checks">
                        <span className="ck-body__label">{wizard.bodiesChecks}: </span>
                        <Bidi text={body.checks} />
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="ck-help ck-help--note ck-bodies__note" id={id("bodies-note")}>
                  <Info size={16} strokeWidth={STROKE} aria-hidden="true" />
                  <span>{wizard.bodiesNote}</span>
                </p>

                <div className="ck-confirm-wrap">
                  <label className={`ck-confirm${bodiesTried && !bodiesSeen ? " has-error" : ""}`}>
                    <input
                      ref={bodiesRef}
                      type="checkbox"
                      className="ck-confirm__input"
                      required
                      checked={bodiesSeen}
                      aria-invalid={bodiesTried && !bodiesSeen}
                      aria-describedby={bodiesTried && !bodiesSeen ? id("bodies-error") : undefined}
                      onChange={(event) => setBodiesSeen(event.target.checked)}
                    />
                    <span>{wizard.bodiesConfirm}</span>
                  </label>
                  {bodiesTried && !bodiesSeen && (
                    <p className="ck-error" id={id("bodies-error")} role="alert">
                      <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
                      <span>{wizard.bodiesError}</span>
                    </p>
                  )}
                </div>

                {foot(2)}
              </form>
            )}

            {step === 4 && (
              <form className="ck-form" noValidate onSubmit={submitPlan}>
                {heading(wizard.steps[3])}

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
                  <button type="button" className="link ck-back" onClick={() => goTo(3)}>
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


            {step === 5 && (
              <form className="ck-form" noValidate onSubmit={submitDeclarations}>
                {heading(wizard.steps[4])}
                <p className="ck-lede">{wizard.declarationsLede}</p>

                <div ref={declarationsRef} className="ck-decls">
                  {DECLARATIONS.map((item) => {
                    const missing = declarationsTried && !declarations[item.id];
                    return (
                      <fieldset
                        key={item.id}
                        className={`ck-decl${missing ? " has-error" : ""}`}
                        aria-describedby={missing ? id("decl-error") : undefined}
                      >
                        <legend className="ck-decl__legend">
                          <span className="ck-decl__clause">
                            {CLAUSE} <span className="num">{item.clause}</span>: {item.subject}
                          </span>
                          <span className="ck-decl__question">
                            <Bidi text={item.question} />
                          </span>
                        </legend>
                        <div className="ck-choices">
                          {ANSWERS.map((option) => (
                            <label
                              key={option.value}
                              className={`ck-choice${declarations[item.id] === option.value ? " is-selected" : ""}`}
                            >
                              <input
                                type="radio"
                                className="ck-choice__input"
                                name={id(`decl-${item.id}`)}
                                value={option.value}
                                checked={declarations[item.id] === option.value}
                                onChange={() => answer(item.id, option.value)}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>

                <p className="ck-help ck-help--note ck-decls__note">
                  <Info size={16} strokeWidth={STROKE} aria-hidden="true" />
                  <span>{DECLARATION_NOTE}</span>
                </p>
                {declarationsTried && !declarationsDone && (
                  <p className="ck-error" id={id("decl-error")} role="alert">
                    <CircleAlert size={16} strokeWidth={STROKE} aria-hidden="true" />
                    <span>{wizard.declarationsError}</span>
                  </p>
                )}

                {foot(4)}
              </form>
            )}

            {step === 6 && phase === "review" && (
              <div className="ck-phase ck-phase--review">
                {heading(wizard.steps[5])}
                <p className="ck-lede">{wizard.reviewLede}</p>

                <dl className="ck-review">
                  {reviewRow(
                    1,
                    <>
                      <span>{facility.projectName.trim() || wizard.notEntered}</span>
                      <span className="ck-review__detail">
                        {activityLabel}، {wizard.registration}{" "}
                        {valid.registration && normalizeRegistration(registrationText) ? (
                          <bdi className="num">{normalizeRegistration(registrationText)}</bdi>
                        ) : (
                          wizard.notEntered
                        )}
                      </span>
                    </>,
                  )}
                  {reviewRow(
                    2,
                    <>
                      <span>
                        {[facility.city, facility.district].map((part) => part.trim()).filter(Boolean).join("، ") ||
                          wizard.notEntered}
                      </span>
                      <span className="ck-review__detail">
                        {facility.buildingType}، {wizard.floors} <span className="num">{formatFloors(facility.floors) || "-"}</span>،{" "}
                        {wizard.area} <span className="num">{formatArea(facility.area)}</span> {AREA_UNIT}
                      </span>
                    </>,
                  )}
                  {reviewRow(3, <span>{bodiesSeen ? wizard.reviewBodiesDone : wizard.reviewBodiesPending}</span>)}
                  {reviewRow(
                    4,
                    choice === "file" && file ? (
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
                    ) : (
                      <span>{wizard.notEntered}</span>
                    ),
                  )}
                  {reviewRow(5, <DeclarationList declarations={declarations} />)}
                </dl>

                <div className="ck-foot">
                  <button type="button" className="link ck-back" onClick={() => goTo(5)}>
                    {wizard.back}
                  </button>
                  <button type="button" className="btn btn--primary btn--large ck-next" onClick={start}>
                    {wizard.start}
                  </button>
                </div>
              </div>
            )}

            {step === 6 && phase === "running" && (
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

            {step === 6 && phase === "done" && run && tally && (
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
                {counts}

                <section className="ck-declared" aria-labelledby={id("declared")}>
                  <h3 className="ck-declared__title" id={id("declared")}>
                    {DECLARATION_TITLE}
                  </h3>
                  <DeclarationList declarations={run.facility.declarations} />
                  <p className="ck-help">{DECLARATION_NOTE}</p>
                </section>

                <div className="ck-foot ck-foot--split">
                  <button type="button" className="btn btn--secondary ck-model" onClick={() => onDone(run)}>
                    {wizard.openModel}
                  </button>
                  <button
                    ref={passportRef}
                    type="button"
                    className="btn btn--primary btn--large ck-next"
                    onClick={() => goTo(7)}
                  >
                    {wizard.next}
                    <span className="sr-only">: {wizard.steps[6]}</span>
                  </button>
                </div>
                <p className="ck-twin">
                  <button type="button" className="link link--more" onClick={onTwin}>
                    {wizard.twin}
                  </button>
                </p>
              </div>
            )}

            {step === 6 && phase === "error" && failure && (
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
                  <button type="button" className="btn btn--primary ck-next" onClick={() => goTo(4)}>
                    {wizard.change}
                  </button>
                </div>
              </div>
            )}

            {step === 7 && run && tally && (
              <div className="ck-phase ck-phase--passport">
                {heading(wizard.steps[6])}

                <article className="ck-passport" aria-labelledby={id("passport-name")}>
                  <p className="ck-passport__label">{wizard.passportLabel}</p>
                  <p className="ck-passport__name" id={id("passport-name")}>
                    {run.facility.projectName}
                  </p>
                  <p className="ck-passport__notice" role="note">
                    {wizard.passportNotice}
                  </p>

                  <dl className="ck-passport__facts">
                    <div>
                      <dt>{wizard.activity}</dt>
                      <dd>{activityName(run.activityId)}</dd>
                    </div>
                    <div>
                      <dt>{wizard.passportPlace}</dt>
                      <dd>{[run.facility.city, run.facility.district].filter(Boolean).join("، ")}</dd>
                    </div>
                    <div>
                      <dt>{wizard.area}</dt>
                      <dd>
                        <span className="num">{formatArea(run.facility.area)}</span> {AREA_UNIT}
                      </dd>
                    </div>
                    <div>
                      <dt>{wizard.passportDate}</dt>
                      <dd>{formatRunDate(run.processedAt)}</dd>
                    </div>
                    <div className="ck-passport__wide">
                      <dt>{wizard.reviewFile}</dt>
                      <dd>
                        <bdi dir="ltr" className="ck-review__file">
                          {run.file.name}
                        </bdi>
                      </dd>
                    </div>
                  </dl>

                  <div className="ck-passport__result">
                    <p className="ck-score__label">{copy.results.scope}</p>
                    <p className="ck-passport__scope">
                      <span className="num">
                        {tally.verified} من {tally.total}
                      </span>{" "}
                      {clausesWord(tally.total)}
                    </p>
                    {counts}
                  </div>
                </article>

                <div className="ck-foot ck-foot--actions">
                  <button type="button" className="btn btn--primary ck-next" onClick={() => onDone(run)}>
                    {wizard.results}
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={() => onReport(run)}>
                    {wizard.report}
                  </button>
                  <button type="button" className="link ck-new" onClick={onNew}>
                    {wizard.newCheck}
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
