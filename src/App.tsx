import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clipboard,
  Coffee,
  Download,
  FileBox,
  FileCheck2,
  FileText,
  Info,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Menu,
  PanelTop,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Search,
  Scissors,
  ShieldCheck,
  Stethoscope,
  UploadCloud,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BrandMark } from "./components/BrandMark";
import {
  activityExamples,
  calculateSummary,
  defaultFacility,
  getActivityIdFromLabel,
  getAnalysisStages,
  getDefaultFacility,
  modelDisclaimer,
  primaryDisclaimer,
  statusLabels,
  statusShortLabels,
  type ActivityId,
  type FacilityDetails,
  type Finding,
  type ResultFilter,
  type ResultStatus,
  type Scenario,
} from "./data";
import {
  runIfcCompliance,
  type ComplianceRun,
  type IfcUpload,
  type PipelineEvent,
  type StageId,
  type StageState,
} from "./ifc";

const Viewer3D = lazy(() =>
  import("./components/Viewer3D").then((module) => ({
    default: module.Viewer3D,
  })),
);

type Screen =
  | "dashboard"
  | "details"
  | "model"
  | "analysis"
  | "workspace"
  | "report";

const STORAGE_KEY = "jawaz-compliance-demo";

function loadStoredState(): {
  facility: FacilityDetails;
  activityId: ActivityId;
} {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      const parsed = JSON.parse(value);
      const activityId = getActivityIdFromLabel(
        parsed.activityId ?? parsed.facility?.activity,
      );
      const activityDefaults = getDefaultFacility(activityId);
      return {
        facility: { ...activityDefaults, ...parsed.facility, activity: activityDefaults.activity },
        activityId,
      };
    }
  } catch {
    // The app remains fully usable when storage is unavailable.
  }
  return {
    facility: defaultFacility,
    activityId: "restaurant",
  };
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusIcon(status: ResultStatus, size = 16) {
  if (status === "pass") return <CheckCircle2 size={size} />;
  if (status === "fail") return <AlertCircle size={size} />;
  return <CircleHelp size={size} />;
}

function activityIcon(activityId: ActivityId, size = 20) {
  if (activityId === "cafe") return <Coffee size={size} />;
  if (activityId === "clinic") return <Stethoscope size={size} />;
  if (activityId === "salon") return <Scissors size={size} />;
  return <UtensilsCrossed size={size} />;
}

function AppHeader({
  onHome,
  onNew,
  minimal = false,
}: {
  onHome: () => void;
  onNew: () => void;
  minimal?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <button type="button" className="brand-button" onClick={onHome}>
        <BrandMark />
      </button>
      {!minimal && (
        <>
          {/* One route to "new scan", not three. The logo goes home, so a
              "الرئيسية" link is redundant too. */}
          <nav className={`app-nav ${menuOpen ? "is-open" : ""}`}>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              كيف يعمل؟
            </a>
          </nav>
          <div className="app-header__actions">
            <button
              type="button"
              className="button button--small button--primary"
              onClick={onNew}
            >
              <Plus size={16} />
              فحص جديد
            </button>
            <button
              type="button"
              className="icon-button menu-button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="فتح القائمة"
            >
              <Menu size={20} />
            </button>
          </div>
        </>
      )}
    </header>
  );
}

function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`disclaimer ${compact ? "disclaimer--compact" : ""}`}>
      <Info size={17} />
      <p>{primaryDisclaimer}</p>
    </div>
  );
}

function FlowDiagram() {
  const steps = [
    {
      number: "01",
      title: "بيانات المشروع",
      copy: "حدد النشاط والموقع ونطاق المنشأة.",
      icon: <Building2 size={20} />,
    },
    {
      number: "02",
      title: "النموذج الهندسي",
      copy: "ارفع نموذجًا منظمًا أو استخدم نموذج العرض.",
      icon: <FileBox size={20} />,
    },
    {
      number: "03",
      title: "الفحص الآلي",
      copy: "قواعد واضحة تفحص العناصر والعلاقات.",
      icon: <ShieldCheck size={20} />,
    },
    {
      number: "04",
      title: "المعالجة والتقرير",
      copy: "حدد موقع الملاحظة وصدّر تقرير الجاهزية.",
      icon: <FileText size={20} />,
    },
  ];

  return (
    <section className="flow-section" id="how-it-works">
      <div className="section-heading">
        <div>
          <span className="eyebrow">رحلة الفحص</span>
          <h2>من النموذج إلى ملاحظة قابلة للمعالجة</h2>
        </div>
      </div>
      <div className="flow-grid">
        {steps.map((step, index) => (
          <article className="flow-card" key={step.number}>
            <div className="flow-card__top">
              <span className="flow-card__icon">{step.icon}</span>
              <span className="flow-card__number">{step.number}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
            {index < steps.length - 1 && (
              <ChevronLeft className="flow-card__arrow" size={18} />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Dashboard({
  run,
  onStart,
  onDemo,
  onOpenRecent,
}: {
  run?: ComplianceRun;
  onStart: () => void;
  onDemo: (activityId?: ActivityId) => void;
  onOpenRecent: () => void;
}) {
  const recentActivityId = run?.activityId ?? "restaurant";

  return (
    <>
      <main className="dashboard">
        <section className="hero">
          <div className="hero__content">
            <h1>
              اعرف ملاحظات مخططك
              <br />
              <em>قبل تقديم الطلب.</em>
            </h1>
            <p>افحص نموذج BIM بقواعد واضحة، وشاهد كل ملاحظة في مكانها.</p>
            <div className="hero__actions">
              <button type="button" className="button button--light" onClick={onStart}>
                ابدأ فحصًا جديدًا
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                className="button button--ghost-light"
                onClick={() => onDemo(recentActivityId)}
              >
                <PanelTop size={18} />
                جرّب نموذجًا جاهزًا
              </button>
            </div>
          </div>

          <div className="hero__visual" aria-label="معاينة منتج جواز الامتثال">
            <div className="mini-window">
              <div className="mini-window__bar">
                <span />
                <span />
                <span />
                <small>semantic-model.ifc</small>
              </div>
              <div className="mini-window__body">
                <div className="mini-plan">
                  <span className="mini-plan__space mini-plan__space--dining" />
                  <span className="mini-plan__space mini-plan__space--kitchen" />
                  <span className="mini-plan__space mini-plan__space--service" />
                  <span className="mini-plan__route" />
                  <span className="mini-plan__issue mini-plan__issue--one">1</span>
                  <span className="mini-plan__issue mini-plan__issue--two">2</span>
                  <span className="mini-plan__label mini-plan__label--dining">
                    منطقة الطعام
                  </span>
                  <span className="mini-plan__label mini-plan__label--kitchen">
                    المطبخ
                  </span>
                </div>
                <aside className="mini-results">
                  <div className="mini-score">
                    <div>
                      <strong>78</strong>
                      <small>/ 100</small>
                    </div>
                    <span>مؤشر الجاهزية</span>
                  </div>
                  <div className="mini-result mini-result--fail">
                    <AlertCircle size={15} />
                    <span>
                      <strong>عرض مخرج الطوارئ</strong>
                      <small>0.82 م • يحتاج معالجة</small>
                    </span>
                  </div>
                  <div className="mini-result mini-result--fail">
                    <AlertCircle size={15} />
                    <span>
                      <strong>تضيق مسار الوصول</strong>
                      <small>0.76 م • يحتاج معالجة</small>
                    </span>
                  </div>
                  <div className="mini-result mini-result--unknown">
                    <CircleHelp size={15} />
                    <span>
                      <strong>تهوية المطبخ</strong>
                      <small>مخطط MEP غير مرفق</small>
                    </span>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <Disclaimer compact />

        <section className="example-section" aria-labelledby="example-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">نماذج قطاعية جاهزة</span>
              <h2 id="example-heading">اختبر الفكرة على أكثر من نشاط</h2>
            </div>
          </div>
          <div className="activity-grid">
            {activityExamples.map((example) => (
              <button
                type="button"
                className={`activity-card activity-card--${example.id}`}
                key={example.id}
                onClick={() => onDemo(example.id)}
                data-testid={`activity-example-${example.id}`}
              >
                <span className="activity-card__icon">
                  {activityIcon(example.id, 22)}
                </span>
                {/* "نموذج IFC دلالي" / "10 قواعد" / "عرض ثلاثي الأبعاد
                    تفاعلي" were identical on all four cards, so they told the
                    reader nothing. Only what differs stays. */}
                <span className="activity-card__copy">
                  <strong>{example.label}</strong>
                  <span>{example.description}</span>
                </span>
                <ArrowUpLeft size={18} />
              </button>
            ))}
          </div>
        </section>

        {run && <section className="dashboard-grid">
          <div className="dashboard-main">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">مساحة العمل</span>
                <h2>آخر مشروع</h2>
              </div>
            </div>

            <button type="button" className="recent-project" onClick={onOpenRecent}>
              <div className="recent-project__preview">
                <span className="recent-project__building">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="recent-project__status">
                  <i />{" "}
                  {run.summary.score === 100
                    ? "مستوفٍ لقواعد العرض"
                    : "يحتاج معالجة"}
                </span>
              </div>
              <div className="recent-project__content">
                <div>
                  <span className="project-type">{run.facility.activity} • IFC</span>
                  <h3>{run.facility.projectName}</h3>
                  <p>
                    <MapPin size={14} />
                    {run.facility.city}، {run.facility.district}
                    <span>•</span>
                    {run.facility.area} م²
                  </p>
                </div>
                <div className="recent-project__metrics">
                  <span>
                    <strong>{run.summary.score}%</strong>
                    مؤشر الجاهزية
                  </span>
                  <span className="metric-fail">
                    <strong>{run.summary.failed}</strong>
                    ملاحظات
                  </span>
                  <span className="metric-unknown">
                    <strong>{run.summary.unknown}</strong>
                    غير مكتمل
                  </span>
                </div>
                <div className="recent-project__footer">
                  <span>آخر فحص: {formatDate(new Date(run.processedAt))}</span>
                  <span className="open-project">
                    فتح مساحة الفحص <ArrowLeft size={15} />
                  </span>
                </div>
              </div>
            </button>
          </div>
        </section>}

        <FlowDiagram />
      </main>
      <footer className="site-footer">
        <BrandMark compact />
        <p>نموذج إثبات مفهوم. لا يوجد تكامل رسمي مع بلدي أو أي جهة حكومية.</p>
        <span dir="ltr">DEMO-MULTI-2026.2</span>
      </footer>
    </>
  );
}

function WizardProgress({ current }: { current: number }) {
  const steps = ["بيانات المنشأة", "النموذج الهندسي", "الفحص الآلي", "النتائج"];
  return (
    <div className="wizard-progress">
      {steps.map((label, index) => {
        const position = index + 1;
        const complete = position < current;
        const active = position === current;
        return (
          <div
            className={`wizard-progress__step ${
              complete ? "is-complete" : active ? "is-active" : ""
            }`}
            key={label}
          >
            <span>{complete ? <Check size={15} /> : position}</span>
            <small>{label}</small>
          </div>
        );
      })}
    </div>
  );
}

function WizardShell({
  current,
  title,
  description,
  children,
  onHome,
  onNew,
}: {
  current: number;
  title: string;
  description: string;
  children: React.ReactNode;
  onHome: () => void;
  onNew: () => void;
}) {
  return (
    <div className="wizard-page">
      <AppHeader onHome={onHome} onNew={onNew} minimal />
      <div className="wizard-page__progress">
        <WizardProgress current={current} />
      </div>
      <main className="wizard-container">
        {/* The progress bar above already names the step and its number, so
            the "الخطوة X من 4" label was saying it a third time. */}
        <div className="wizard-heading">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

function FacilityForm({
  value,
  activityId,
  onChange,
  onActivityChange,
  onSubmit,
  onHome,
  onNew,
}: {
  value: FacilityDetails;
  activityId: ActivityId;
  onChange: (value: FacilityDetails) => void;
  onActivityChange: (activityId: ActivityId) => void;
  onSubmit: () => void;
  onHome: () => void;
  onNew: () => void;
}) {
  const [attempted, setAttempted] = useState(false);
  const valid =
    value.projectName.trim() &&
    value.city.trim() &&
    value.district.trim() &&
    value.area > 0 &&
    value.capacity > 0;

  const update = <K extends keyof FacilityDetails>(
    key: K,
    fieldValue: FacilityDetails[K],
  ) => onChange({ ...value, [key]: fieldValue });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (valid) onSubmit();
  };

  return (
    <WizardShell
      current={1}
      title="عرّف مشروعك"
      description="تحدد هذه البيانات نطاق الفحص وحزمة القواعد المطبّقة."
      onHome={onHome}
      onNew={onNew}
    >
      <form className="form-card" onSubmit={submit}>
        <div className="form-card__notice">
          <BadgeCheck size={19} />
          <span>
            <strong>
              حزمة الفحص المختارة:{" "}
              {activityExamples.find((example) => example.id === activityId)?.label}
            </strong>
            <small>يمكنك تعديل البيانات قبل المتابعة.</small>
          </span>
        </div>

        <div className="form-grid">
          <label className="field field--wide">
            <span>اسم المشروع</span>
            <input
              value={value.projectName}
              onChange={(event) => update("projectName", event.target.value)}
              placeholder="مثال: مطعم النخيل، فرع الياسمين"
              aria-invalid={attempted && !value.projectName.trim()}
            />
            {attempted && !value.projectName.trim() && (
              <small className="field__error">أدخل اسم المشروع.</small>
            )}
          </label>

          <label className="field">
            <span>نوع النشاط</span>
            <div className="input-with-icon">
              <Building2 size={17} />
              <select
                value={value.activity}
                onChange={(event) =>
                  onActivityChange(getActivityIdFromLabel(event.target.value))
                }
                data-testid="activity-select"
              >
                {activityExamples.map((example) => (
                  <option key={example.id} value={example.label}>
                    {example.label}
                  </option>
                ))}
              </select>
            </div>
            <small>يغيّر النشاط البيانات التجريبية وحزمة القواعد والمشهد.</small>
          </label>

          <label className="field">
            <span>نوع المبنى</span>
            <select
              value={value.buildingType}
              onChange={(event) => update("buildingType", event.target.value)}
            >
              <option>محل ضمن مبنى تجاري</option>
              <option>مبنى تجاري مستقل</option>
              <option>مركز تجاري</option>
            </select>
          </label>

          <label className="field">
            <span>المدينة</span>
            <select
              value={value.city}
              onChange={(event) => update("city", event.target.value)}
            >
              <option>الرياض</option>
              <option>جدة</option>
              <option>الدمام</option>
              <option>مكة المكرمة</option>
            </select>
          </label>

          <label className="field">
            <span>الحي</span>
            <input
              value={value.district}
              onChange={(event) => update("district", event.target.value)}
              placeholder="اسم الحي"
              aria-invalid={attempted && !value.district.trim()}
            />
          </label>

          <fieldset className="field field--wide">
            <legend>حالة المنشأة</legend>
            <div className="segmented">
              <label className={value.establishmentState === "new" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="state"
                  checked={value.establishmentState === "new"}
                  onChange={() => update("establishmentState", "new")}
                />
                منشأة جديدة
              </label>
              <label
                className={value.establishmentState === "existing" ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="state"
                  checked={value.establishmentState === "existing"}
                  onChange={() => update("establishmentState", "existing")}
                />
                منشأة قائمة
              </label>
            </div>
          </fieldset>

          <label className="field">
            <span>المساحة الإجمالية</span>
            <div className="input-suffix">
              <input
                type="number"
                min="1"
                value={value.area}
                onChange={(event) => update("area", Number(event.target.value))}
              />
              <span>م²</span>
            </div>
          </label>

          <label className="field">
            <span>الطاقة الاستيعابية المتوقعة</span>
            <div className="input-suffix">
              <input
                type="number"
                min="1"
                value={value.capacity}
                onChange={(event) => update("capacity", Number(event.target.value))}
              />
              <span>شخص</span>
            </div>
          </label>

          <label className="field">
            <span>عدد الطوابق ضمن النطاق</span>
            <input
              type="number"
              min="1"
              max="5"
              value={value.floors}
              onChange={(event) => update("floors", Number(event.target.value))}
            />
          </label>
        </div>

        <div className="form-card__footer">
          <button type="button" className="button button--outline" onClick={onHome}>
            <ArrowRight size={17} />
            الرجوع
          </button>
          <button type="submit" className="button button--primary">
            حفظ ومتابعة إلى النموذج
            <ArrowLeft size={17} />
          </button>
        </div>
      </form>
      <Disclaimer compact />
    </WizardShell>
  );
}

function ModelUpload({
  activityId,
  upload,
  onUpload,
  onContinue,
  onBack,
  onHome,
  onNew,
}: {
  activityId: ActivityId;
  upload?: IfcUpload;
  onUpload: (upload: IfcUpload) => void;
  onContinue: () => void;
  onBack: () => void;
  onHome: () => void;
  onNew: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const processFile = async (file?: File) => {
    if (!file) return;
    setError("");

    if (!file.name.toLowerCase().endsWith(".ifc")) {
      setError("الملف غير مدعوم. اختر ملفًا بامتداد .ifc");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("حجم الملف يتجاوز حد نسخة العرض البالغ 50 MB.");
      return;
    }

    let text = "";
    try {
      text = await file.text();
    } catch {
      setError("تعذر قراءة الملف. جرّب نسخة أخرى.");
      return;
    }
    if (!text.trim()) {
      setError("الملف فارغ ولا يحتوي بيانات قابلة للمعالجة.");
      return;
    }

    onUpload({
      name: file.name,
      size: file.size,
      text,
      lastModified: file.lastModified,
    });
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void processFile(event.dataTransfer.files[0]);
  };

  return (
    <WizardShell
      current={2}
      title="أضف النموذج الهندسي"
      description="ارفع ملف IFC دلاليًا؛ سيجري التحقق والاستخراج وتطبيق القواعد من محتواه."
      onHome={onHome}
      onNew={onNew}
    >
      <div className="upload-layout">
        <section className="upload-card">
          <div
            className={`dropzone ${dragging ? "is-dragging" : ""} ${
              error ? "has-error" : ""
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <span className="dropzone__icon">
              <UploadCloud size={26} />
            </span>
            <h3>اسحب ملف IFC إلى هنا</h3>
            <label className="button button--outline">
              اختيار ملف
              <input
                type="file"
                accept=".ifc"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  void processFile(event.target.files?.[0])
                }
              />
            </label>
            <small>الحد الأقصى 50 MB. لا تبدأ أي نتيجة قبل قراءة الملف فعليًا.</small>
          </div>

          {error && (
            <div className="upload-error">
              <AlertCircle size={18} />
              <p>{error}</p>
              <button type="button" onClick={() => setError("")} aria-label="إغلاق">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="upload-contract">
            <ShieldCheck size={19} />
            <div>
              <strong>معالجة قابلة للتحقق</strong>
              <p>
                يقرأ المحرك سجلات STEP وخصائص IFC والعلاقات، ثم يستخرج الأدلة
                ويحسب النتيجة. لا يعتمد على اسم الملف أو علامة نتيجة مخفية.
              </p>
            </div>
          </div>
        </section>

        <aside className="model-summary">
          <div className="model-summary__head">
            <span className="file-icon">
              <FileBox size={22} />
            </span>
            <div>
              <strong dir="ltr">{upload?.name ?? "لم يُحدد ملف بعد"}</strong>
              <small>
                {upload
                  ? `${Math.max(upload.size / 1024, 0.1).toFixed(1)} KB`
                  : "اختر ملف IFC للمتابعة"}
              </small>
            </div>
            {upload && (
              <span className="quality-badge">
                <CheckCircle2 size={14} /> جاهز للمعالجة
              </span>
            )}
          </div>
          <div className="model-summary__preview">
            <div className="isometric-model">
              <span className="iso-floor" />
              <span className="iso-wall iso-wall--one" />
              <span className="iso-wall iso-wall--two" />
              <span className="iso-room iso-room--one" />
              <span className="iso-room iso-room--two" />
            </div>
          </div>
          <dl className="model-properties">
            <div>
              <dt>الحزمة المختارة</dt>
              <dd>{activityExamples.find((item) => item.id === activityId)?.label}</dd>
            </div>
            <div>
              <dt>نوع الملف</dt>
              <dd dir="ltr">IFC / STEP</dd>
            </div>
            <div>
              <dt>التحقق البنيوي</dt>
              <dd>{upload ? "يبدأ في المرحلة 1" : "بانتظار الملف"}</dd>
            </div>
            <div>
              <dt>استخراج المساحات</dt>
              <dd>{upload ? "يبدأ في المرحلة 2" : "بانتظار الملف"}</dd>
            </div>
            <div>
              <dt>تطبيق القواعد</dt>
              <dd>{upload ? "من أدلة النموذج" : "بانتظار الملف"}</dd>
            </div>
            <div>
              <dt>حد الحجم</dt>
              <dd dir="ltr">50 MB</dd>
            </div>
          </dl>
          <div className="model-summary__note">
            <Info size={15} />
            لن نعرض أعدادًا أو حالة امتثال قبل اكتمال المعالجة.
          </div>
        </aside>
      </div>

      <div className="wizard-actions">
        <button type="button" className="button button--outline" onClick={onBack}>
          <ArrowRight size={17} /> رجوع
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={onContinue}
          disabled={!upload || Boolean(error)}
        >
          تأكيد النموذج وبدء الفحص
          <ArrowLeft size={17} />
        </button>
      </div>
      <Disclaimer compact />
    </WizardShell>
  );
}

const analysisStageIds: StageId[] = [
  "validate",
  "extract",
  "completeness",
  "rules",
  "link",
  "report",
];

type AnalysisStageView = {
  id: StageId;
  label: string;
  state: StageState;
  detail?: string;
  errorCode?: string;
};

function AnalysisScreen({
  activityId,
  facility,
  upload,
  onProcessed,
  onOpenResults,
  onCancel,
}: {
  activityId: ActivityId;
  facility: FacilityDetails;
  upload: IfcUpload;
  onProcessed: (run: ComplianceRun) => void;
  onOpenResults: () => void;
  onCancel: () => void;
}) {
  const labels = useMemo(() => getAnalysisStages(activityId), [activityId]);
  const [stages, setStages] = useState<AnalysisStageView[]>(() =>
    analysisStageIds.map((id, index) => ({
      id,
      label: getAnalysisStages(activityId)[index],
      state: "pending",
    })),
  );
  const [completedRun, setCompletedRun] = useState<ComplianceRun>();
  const [failure, setFailure] = useState("");
  const activity = activityExamples.find((item) => item.id === activityId);

  useEffect(() => {
    const controller = new AbortController();
    setCompletedRun(undefined);
    setFailure("");
    setStages(
      analysisStageIds.map((id, index) => ({
        id,
        label: labels[index],
        state: "pending",
      })),
    );

    const handleEvent = (event: PipelineEvent) => {
      if (controller.signal.aborted) return;
      setStages((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                state: event.state,
                detail: event.detail,
                errorCode: event.errorCode,
              }
            : item,
        ),
      );
      if (event.state === "failed") setFailure(event.detail ?? "تعذر إكمال الفحص.");
    };

    void runIfcCompliance({
      activityId,
      facility,
      upload,
      signal: controller.signal,
      onEvent: handleEvent,
    })
      .then((run) => {
        if (controller.signal.aborted) return;
        setCompletedRun(run);
        onProcessed(run);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setFailure(error instanceof Error ? error.message : "تعذر إكمال الفحص.");
      });

    return () => controller.abort();
    // The facility and callbacks are snapshots for this immutable processing run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, upload]);

  const completedCount = stages.filter((stage) => stage.state === "completed").length;
  const complete = Boolean(completedRun);
  const progress = Math.round((completedCount / stages.length) * 100);

  return (
    <div className="analysis-page">
      <AppHeader onHome={onCancel} onNew={onCancel} minimal />
      <main className="analysis-card">
        <div className="analysis-card__visual">
          <div className="analysis-orbit">
            <span className="analysis-orbit__ring analysis-orbit__ring--one" />
            <span className="analysis-orbit__ring analysis-orbit__ring--two" />
            <div className="analysis-building">
              <span className="analysis-building__floor" />
              <span className="analysis-building__wall analysis-building__wall--one" />
              <span className="analysis-building__wall analysis-building__wall--two" />
              <span className="analysis-building__scan" />
            </div>
          </div>
          <span className="analysis-file" dir="ltr">
            <FileBox size={16} /> {upload.name}
          </span>
        </div>

        <div className="analysis-card__content">
          <span className="eyebrow">فحص حزمة {activity?.label}</span>
          <h1>
            {failure ? "توقف الفحص عند دليل غير صالح" : complete ? "اكتمل الفحص" : "جارٍ فحص النموذج…"}
          </h1>
          <p>
            {failure
              ? failure
              : "كل مرحلة تنفذ عملية فعلية وتحتفظ بدليلها في تقرير الجاهزية."}
          </p>

          <div className="analysis-progress">
            <div className="analysis-progress__track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong>{progress}%</strong>
          </div>

          <div className="analysis-stages">
            {stages.map((stage, index) => {
              const done = stage.state === "completed";
              const active = stage.state === "running";
              const failed = stage.state === "failed";
              return (
                <div
                  className={`analysis-stage ${done ? "is-done" : ""} ${
                    active ? "is-active" : ""
                  } ${failed ? "is-failed" : ""}`}
                  key={stage.id}
                >
                  <span>
                    {done ? (
                      <Check size={15} />
                    ) : failed ? (
                      <X size={15} />
                    ) : active ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <p>{stage.label}</p>
                  {stage.detail && <small>{stage.detail}</small>}
                  {failed && stage.errorCode && (
                    <code dir="ltr">{stage.errorCode}</code>
                  )}
                </div>
              );
            })}
          </div>

          {complete ? (
            <button
              type="button"
              className="button button--primary button--full"
              onClick={onOpenResults}
            >
              عرض نتائج الفحص
              <ArrowLeft size={17} />
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onCancel}>
              {failure ? "العودة واختيار ملف آخر" : "إلغاء والعودة إلى النموذج"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function SummaryStrip({
  scenario,
  findings,
}: {
  scenario: Scenario;
  findings: Finding[];
}) {
  const summary = calculateSummary(findings, scenario);
  return (
    <div className="summary-strip">
      <div className="summary-score">
        <div
          className={`score-ring ${
            summary.failed === 0 && summary.unknown === 0 ? "score-ring--ready" : ""
          }`}
          style={{ "--score": summary.score } as React.CSSProperties}
        >
          <strong>{summary.score}</strong>
          <small>/100</small>
        </div>
        <span>
          <strong>مؤشر الجاهزية</strong>
          <small>
            {summary.failed || summary.unknown
              ? "يحتاج معالجة قبل التقديم"
              : "مستوفٍ لقواعد العرض"}
          </small>
        </span>
      </div>
      <div className="summary-stat summary-stat--pass">
        <span>{statusIcon("pass", 18)}</span>
        <strong>{summary.passed}</strong>
        <small>مطابق</small>
      </div>
      <div className="summary-stat summary-stat--fail">
        <span>{statusIcon("fail", 18)}</span>
        <strong>{summary.failed}</strong>
        <small>ملاحظة</small>
      </div>
      <div className="summary-stat summary-stat--unknown">
        <span>{statusIcon("unknown", 18)}</span>
        <strong>{summary.unknown}</strong>
        <small>غير مكتمل</small>
      </div>
      <div className="summary-message">
        <ShieldCheck size={19} />
        <span>
          {summary.failed || summary.unknown
            ? `عالج ${summary.failed} من الملاحظات وأكمل ${summary.unknown} من المعلومات قبل التقديم.`
            : "اكتملت قواعد العرض العشر دون ملاحظات أو معلومات ناقصة."}
        </span>
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  selected,
  onClick,
}: {
  finding: Finding;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`finding-card finding-card--${finding.status} ${
        selected ? "is-selected" : ""
      }`}
      onClick={onClick}
    >
      <span className="finding-card__status">{statusIcon(finding.status)}</span>
      <span className="finding-card__body">
        <span className="finding-card__meta">
          <small>{finding.category}</small>
          <code dir="ltr">{finding.ruleId}</code>
        </span>
        <strong>{finding.shortTitle}</strong>
        <span className="finding-card__evidence">
          <small>المرصود</small>
          <b>{finding.actual}</b>
        </span>
      </span>
      <ChevronLeft size={17} className="finding-card__arrow" />
    </button>
  );
}

function FindingDetail({
  finding,
  onClose,
  onFocus,
  onCopy,
}: {
  finding: Finding;
  onClose: () => void;
  onFocus: () => void;
  onCopy: () => void;
}) {
  return (
    <div className={`finding-detail finding-detail--${finding.status}`}>
      <div className="finding-detail__head">
        <span className="finding-detail__icon">{statusIcon(finding.status, 19)}</span>
        <div>
          <small>{statusLabels[finding.status]}</small>
          <h3>{finding.title}</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>
      <div className="comparison">
        <div>
          <span>القيمة المرصودة</span>
          <strong>{finding.actual}</strong>
        </div>
        <ArrowLeft size={17} />
        <div>
          <span>المتوقع</span>
          <strong>{finding.expected}</strong>
        </div>
      </div>
      <div className="finding-detail__section">
        <h4>لماذا ظهرت هذه النتيجة؟</h4>
        <p>{finding.explanation}</p>
      </div>
      <div className="recommendation">
        <span>
          <ShieldCheck size={16} /> الإجراء المقترح
        </span>
        <p>{finding.recommendation}</p>
        <small>الجهد المتوقع: {finding.effort}</small>
      </div>
      <dl className="evidence-list">
        <div>
          <dt>العنصر</dt>
          <dd>{finding.elementName ?? "نتيجة على مستوى الملف"}</dd>
        </div>
        <div>
          <dt>المعرف</dt>
          <dd>
            <code dir="ltr">{finding.elementGuid ?? "N/A"}</code>
            {finding.elementGuid && (
              <button type="button" onClick={onCopy} title="نسخ المعرف">
                <Clipboard size={13} />
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>مرجع STEP</dt>
          <dd dir="ltr">
            {finding.elementStepId ? `#${finding.elementStepId}` : "N/A"}
          </dd>
        </div>
        <div>
          <dt>المصدر</dt>
          <dd>{finding.source}</dd>
        </div>
        <div>
          <dt>حالة المرجع</dt>
          <dd>{finding.clause}</dd>
        </div>
        <div>
          <dt>إصدار القاعدة</dt>
          <dd dir="ltr">{finding.version}</dd>
        </div>
      </dl>
      {finding.elementId && (
        <button type="button" className="button button--primary button--full" onClick={onFocus}>
          <Search size={16} />
          إظهار العنصر في النموذج
        </button>
      )}
    </div>
  );
}

function Workspace({
  run,
  onReport,
  onRerun,
  onHome,
  onNew,
  notify,
}: {
  run: ComplianceRun;
  onReport: () => void;
  onRerun: () => void;
  onHome: () => void;
  onNew: () => void;
  notify: (message: string) => void;
}) {
  const { activityId, facility, findings, scenario } = run;
  const firstUnresolved = findings.find((finding) => finding.status !== "pass");
  const activity = activityExamples.find((item) => item.id === activityId);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [selectedRule, setSelectedRule] = useState<string | undefined>(
    firstUnresolved?.ruleId,
  );
  const [selectedElement, setSelectedElement] = useState<string | undefined>(
    firstUnresolved?.elementId,
  );
  const [mobileTab, setMobileTab] = useState<"model" | "findings">("model");

  useEffect(() => {
    const unresolved = findings.find((finding) => finding.status !== "pass");
    setSelectedRule(unresolved?.ruleId);
    setSelectedElement(unresolved?.elementId);
    setFilter("all");
  }, [findings]);

  const visibleFindings =
    filter === "all"
      ? findings
      : findings.filter((finding) => finding.status === filter);
  const selectedFinding = findings.find((finding) => finding.ruleId === selectedRule);

  const selectFinding = (finding: Finding) => {
    setSelectedRule(finding.ruleId);
    setSelectedElement(finding.elementId);
    setMobileTab("model");
  };

  const selectElement = (elementId: string) => {
    if (!elementId) {
      setSelectedElement(undefined);
      return;
    }
    setSelectedElement(elementId);
    const linked =
      findings.find(
        (finding) =>
          finding.elementId === elementId && finding.status !== "pass",
      ) ?? findings.find((finding) => finding.elementId === elementId);
    setSelectedRule(linked?.ruleId);
  };

  const copyGuid = async () => {
    if (!selectedFinding?.elementGuid) return;
    await navigator.clipboard.writeText(selectedFinding.elementGuid);
    notify("تم نسخ معرف العنصر.");
  };

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <button type="button" className="brand-button" onClick={onHome}>
          <BrandMark compact />
        </button>
        <div className="workspace-project">
          <span className="workspace-project__icon">
            <Building2 size={17} />
          </span>
          <span>
            <strong>{facility.projectName}</strong>
            <small>
              {facility.city} • {facility.activity} • {facility.area} م²
            </small>
          </span>
        </div>
        <span className="prototype-badge">نموذج إثبات مفهوم</span>
        <div className="workspace-header__actions">
          <button type="button" className="button button--small button--outline" onClick={onRerun}>
            <RefreshCcw size={15} /> إعادة الفحص
          </button>
          <button type="button" className="button button--small button--primary" onClick={onReport}>
            <FileText size={15} /> تقرير الجاهزية
          </button>
          <button type="button" className="icon-button" onClick={onNew} title="فحص جديد">
            <Plus size={18} />
          </button>
        </div>
      </header>

      <SummaryStrip scenario={scenario} findings={findings} />

      <div className="mobile-workspace-tabs">
        <button
          type="button"
          className={mobileTab === "model" ? "is-active" : ""}
          onClick={() => setMobileTab("model")}
        >
          النموذج ثلاثي الأبعاد
        </button>
        <button
          type="button"
          className={mobileTab === "findings" ? "is-active" : ""}
          onClick={() => setMobileTab("findings")}
        >
          نتائج الفحص
        </button>
      </div>

      <main className="workspace">
        <section
          className={`workspace__viewer ${
            mobileTab !== "model" ? "is-mobile-hidden" : ""
          }`}
        >
          <Suspense
            fallback={
              <div className="viewer-loading">
                <LoaderCircle size={22} className="spin" />
                <strong>جارٍ تجهيز النموذج ثلاثي الأبعاد…</strong>
                <small>تحميل محرك العرض والعناصر الدلالية</small>
              </div>
            }
          >
            <Viewer3D
              key={`${activityId}-${scenario}`}
              activityId={activityId}
              scenario={scenario}
              selectedElement={selectedElement}
              selectedStatus={selectedFinding?.status}
              onSelectElement={selectElement}
            />
          </Suspense>
        </section>

        <aside
          className={`findings-panel ${
            mobileTab !== "findings" ? "is-mobile-hidden" : ""
          }`}
        >
          <div className="findings-panel__head">
            <div>
              <span className="eyebrow">{activity?.ruleVersion}</span>
              <h2>نتائج الفحص</h2>
            </div>
            <span className="findings-count">{findings.length} قواعد</span>
          </div>

          <div className="finding-filters">
            {(
              [
                ["all", "الكل"],
                ["fail", "الملاحظات"],
                ["unknown", "غير مكتمل"],
                ["pass", "مطابق"],
              ] as [ResultFilter, string][]
            ).map(([key, label]) => {
              const count =
                key === "all"
                  ? findings.length
                  : findings.filter((finding) => finding.status === key).length;
              return (
                <button
                  type="button"
                  className={filter === key ? "is-active" : ""}
                  onClick={() => {
                    setFilter(key);
                    setSelectedRule(undefined);
                  }}
                  key={key}
                >
                  {label} <span>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="findings-panel__scroll">
            {selectedFinding ? (
              <FindingDetail
                finding={selectedFinding}
                onClose={() => {
                  setSelectedRule(undefined);
                  setSelectedElement(undefined);
                }}
                onFocus={() => {
                  setSelectedElement(undefined);
                  window.setTimeout(
                    () => setSelectedElement(selectedFinding.elementId),
                    20,
                  );
                  setMobileTab("model");
                }}
                onCopy={() => void copyGuid()}
              />
            ) : (
              <div className="findings-list">
                {visibleFindings.map((finding) => (
                  <FindingCard
                    key={finding.ruleId}
                    finding={finding}
                    selected={finding.ruleId === selectedRule}
                    onClick={() => selectFinding(finding)}
                  />
                ))}
                {visibleFindings.length === 0 && (
                  <div className="empty-findings">
                    <CheckCircle2 size={27} />
                    <strong>لا توجد نتائج في هذا التصنيف</strong>
                    <p>اختر تصنيفًا آخر لعرض بقية القواعد.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="findings-panel__footer">
            <p>
              <Info size={14} />
              الحدود الرقمية تجريبية وتحتاج إلى اعتماد مختص.
            </p>
            <button type="button" className="button button--primary button--full" onClick={onReport}>
              <FileText size={16} /> فتح تقرير الجاهزية
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function Report({
  run,
  onBack,
  onHome,
  notify,
}: {
  run: ComplianceRun;
  onBack: () => void;
  onHome: () => void;
  notify: (message: string) => void;
}) {
  const { activityId, facility, findings, metadata, scenario, summary } = run;
  const activity = activityExamples.find((item) => item.id === activityId);
  const generatedAt = useMemo(
    () => formatDate(new Date(run.processedAt)),
    [run.processedAt],
  );

  const downloadReport = () => {
    const rows = findings
      .map(
        (finding) => `
          <tr>
            <td>${escapeHtml(finding.ruleId)}</td>
            <td>${escapeHtml(statusShortLabels[finding.status])}</td>
            <td>${escapeHtml(finding.shortTitle)}</td>
            <td>${escapeHtml(finding.actual)}</td>
            <td>${escapeHtml(finding.expected)}</td>
            <td>${escapeHtml(finding.elementStepId ? `#${finding.elementStepId}` : "N/A")}</td>
            <td>${escapeHtml(finding.recommendation)}</td>
          </tr>`,
      )
      .join("");
    const documentHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>تقرير جاهزية: ${escapeHtml(facility.projectName)}</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;color:#17231f;margin:42px;line-height:1.7}
h1{color:#0b5d48;margin-bottom:4px}.meta{color:#637069}.summary{display:flex;gap:12px;margin:24px 0}
.summary span{border:1px solid #d7ded9;border-radius:10px;padding:12px 18px}.summary strong{font-size:24px;display:block}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d7ded9;padding:8px;text-align:right;vertical-align:top}
th{background:#eef3ef}.notice{margin-top:26px;padding:14px;border:1px solid #d7ded9;background:#f5f7f3}
</style></head><body>
<p>جواز الامتثال • نسخة تجريبية</p>
<h1>تقرير جاهزية الطلب</h1>
<p class="meta">${escapeHtml(facility.projectName)} • ${escapeHtml(facility.city)} • ${escapeHtml(generatedAt)}</p>
<div class="summary"><span><strong>${summary.score}</strong>مؤشر الجاهزية</span><span><strong>${summary.passed}</strong>مطابق</span><span><strong>${summary.failed}</strong>ملاحظة</span><span><strong>${summary.unknown}</strong>غير مكتمل</span></div>
<p>الملف: ${escapeHtml(metadata.fileName)} • ${escapeHtml(metadata.schema)} • ${metadata.elements} عنصرًا</p>
<p>بصمة الملف SHA-256: ${escapeHtml(run.file.sha256)}</p>
<table><thead><tr><th>القاعدة</th><th>الحالة</th><th>النتيجة</th><th>المرصود</th><th>المتوقع</th><th>مرجع STEP</th><th>الإجراء المقترح</th></tr></thead><tbody>${rows}</tbody></table>
<div class="notice"><strong>تنبيه:</strong> ${escapeHtml(primaryDisclaimer)}<br>${escapeHtml(modelDisclaimer)}</div>
</body></html>`;
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jawaz-readiness-${activityId}-${scenario}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("تم تنزيل نسخة HTML قابلة للطباعة من التقرير.");
  };

  return (
    <div className="report-page">
      <header className="report-toolbar no-print">
        <button type="button" className="brand-button" onClick={onHome}>
          <BrandMark compact />
        </button>
        <span>معاينة تقرير الجاهزية</span>
        <div>
          <button type="button" className="button button--small button--outline" onClick={onBack}>
            <ArrowRight size={15} /> العودة للنتائج
          </button>
          <button type="button" className="button button--small button--outline" onClick={downloadReport}>
            <Download size={15} /> تنزيل HTML
          </button>
          <button
            type="button"
            className="button button--small button--primary"
            onClick={() => window.print()}
          >
            <Printer size={15} /> طباعة / حفظ PDF
          </button>
        </div>
      </header>

      <main className="report-sheet">
        <div className="report-sheet__head">
          <BrandMark />
          <div>
            <span className="prototype-badge">تقرير تجريبي غير رسمي</span>
            <small>رقم التقرير</small>
            <strong dir="ltr">JCP-{run.file.sha256.slice(0, 12).toUpperCase()}</strong>
          </div>
        </div>

        <div className="report-title">
          <span className="eyebrow">تقرير فحص استباقي</span>
          <h1>تقرير جاهزية الطلب</h1>
          <p>{facility.projectName}</p>
        </div>

        <section className="report-project">
          <div>
            <small>النشاط</small>
            <strong>{facility.activity}</strong>
          </div>
          <div>
            <small>الموقع</small>
            <strong>
              {facility.city}، {facility.district}
            </strong>
          </div>
          <div>
            <small>المساحة</small>
            <strong>{facility.area} م²</strong>
          </div>
          <div>
            <small>الطاقة</small>
            <strong>{facility.capacity} شخصًا</strong>
          </div>
          <div>
            <small>تاريخ التوليد</small>
            <strong>{generatedAt}</strong>
          </div>
        </section>

        <section className="report-summary">
          <div className="report-score">
            <span>
              <strong>{summary.score}</strong>
              <small>/100</small>
            </span>
            <div>
              <h2>مؤشر جاهزية الطلب</h2>
              <p>
                {summary.failed
                  ? "يحتاج المشروع إلى معالجة الملاحظات واستكمال البيانات قبل التقديم."
                  : "اجتاز المشروع جميع قواعد العرض التجريبية."}
              </p>
            </div>
          </div>
          <div className="report-summary__stats">
            <span className="report-stat report-stat--pass">
              <strong>{summary.passed}</strong> مطابق
            </span>
            <span className="report-stat report-stat--fail">
              <strong>{summary.failed}</strong> ملاحظة
            </span>
            <span className="report-stat report-stat--unknown">
              <strong>{summary.unknown}</strong> غير مكتمل
            </span>
          </div>
        </section>

        <section className="report-model">
          <div className="report-section-title">
            <span>
              <FileCheck2 size={18} />
              <strong>ملخص النموذج الهندسي</strong>
            </span>
            <small dir="ltr">{activity?.ruleVersion}</small>
          </div>
          <div className="report-model__grid">
            <span>
              <small>اسم الملف</small>
              <strong dir="ltr">{metadata.fileName}</strong>
            </span>
            <span>
              <small>المخطط</small>
              <strong dir="ltr">{metadata.schema}</strong>
            </span>
            <span>
              <small>المساحات</small>
              <strong>{metadata.spaces}</strong>
            </span>
            <span>
              <small>الأبواب</small>
              <strong>{metadata.doors}</strong>
            </span>
            <span>
              <small>العناصر</small>
              <strong>{metadata.elements}</strong>
            </span>
            <span>
              <small>بصمة الملف</small>
              <strong dir="ltr">{run.file.sha256.slice(0, 16)}…</strong>
            </span>
          </div>
        </section>

        <section className="report-audit">
          <div className="report-section-title">
            <span>
              <FileCheck2 size={18} />
              <strong>سجل المعالجة والأدلة</strong>
            </span>
            <small>{run.stages.length} مراحل مكتملة</small>
          </div>
          <ol>
            {run.stages.map((stage) => (
              <li key={stage.id}>
                <span>
                  <Check size={13} />
                </span>
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
                <code dir="ltr">{stage.durationMs} ms</code>
              </li>
            ))}
          </ol>
        </section>

        <section className="report-results">
          <div className="report-section-title">
            <span>
              <ShieldCheck size={18} />
              <strong>تفاصيل نتائج القواعد</strong>
            </span>
            <small>{findings.length} نتائج</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>الحالة</th>
                <th>القاعدة والنتيجة</th>
                <th>الدليل</th>
                <th>العنصر</th>
                <th>الإجراء المقترح</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.ruleId}>
                  <td>
                    <span className={`report-status report-status--${finding.status}`}>
                      {statusIcon(finding.status, 13)}
                      {statusShortLabels[finding.status]}
                    </span>
                  </td>
                  <td>
                    <code dir="ltr">{finding.ruleId}</code>
                    <strong>{finding.shortTitle}</strong>
                  </td>
                  <td>
                    <span>{finding.actual}</span>
                    <small>المتوقع: {finding.expected}</small>
                  </td>
                  <td>
                    <span>{finding.elementName ?? "على مستوى الملف"}</span>
                    {finding.elementGuid && <code dir="ltr">{finding.elementGuid}</code>}
                    {finding.elementStepId && (
                      <small dir="ltr">STEP #{finding.elementStepId}</small>
                    )}
                  </td>
                  <td>{finding.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="report-disclaimer">
          <AlertCircle size={19} />
          <div>
            <strong>حدود التقرير</strong>
            <p>{primaryDisclaimer}</p>
            <p>{modelDisclaimer}</p>
            <p>
              قواعد وحدود النسخة التجريبية مخصصة لإثبات المفهوم، وتحتاج إلى
              مراجعة واعتماد مختص وربطها بالوثيقة الرسمية وإصدارها وتاريخ
              سريانها.
            </p>
          </div>
        </section>

        <footer className="report-footer">
          <span>جواز الامتثال • نموذج إثبات مفهوم</span>
          <span dir="ltr">Page 1 / 1</span>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  const stored = useMemo(loadStoredState, []);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [facility, setFacility] = useState<FacilityDetails>(stored.facility);
  const [activityId, setActivityId] = useState<ActivityId>(stored.activityId);
  const [upload, setUpload] = useState<IfcUpload>();
  const [run, setRun] = useState<ComplianceRun>();
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ facility, activityId }),
    );
  }, [activityId, facility]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [screen]);

  const startNew = () => {
    setUpload(undefined);
    setScreen("details");
  };

  const selectActivity = (nextActivityId: ActivityId) => {
    setActivityId(nextActivityId);
    setFacility(getDefaultFacility(nextActivityId));
    setUpload(undefined);
  };

  const openDemo = (nextActivityId: ActivityId = "restaurant") => {
    setActivityId(nextActivityId);
    setFacility(getDefaultFacility(nextActivityId));
    setUpload(undefined);
    setScreen("details");
  };

  const resetAll = () => {
    setActivityId("restaurant");
    setFacility(defaultFacility);
    setUpload(undefined);
    setScreen("details");
  };

  return (
    <div className="app" dir="rtl">
      {screen === "dashboard" && (
        <>
          <AppHeader
            onHome={() => setScreen("dashboard")}
            onNew={startNew}
          />
          <Dashboard
            run={run}
            onStart={startNew}
            onDemo={openDemo}
            onOpenRecent={() => {
              if (!run) return;
              setActivityId(run.activityId);
              setFacility(run.facility);
              setScreen("workspace");
            }}
          />
        </>
      )}

      {screen === "details" && (
        <FacilityForm
          value={facility}
          activityId={activityId}
          onChange={setFacility}
          onActivityChange={selectActivity}
          onSubmit={() => setScreen("model")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
        />
      )}

      {screen === "model" && (
        <ModelUpload
          activityId={activityId}
          upload={upload}
          onUpload={setUpload}
          onContinue={() => setScreen("analysis")}
          onBack={() => setScreen("details")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
        />
      )}

      {screen === "analysis" && upload && (
        <AnalysisScreen
          activityId={activityId}
          facility={facility}
          upload={upload}
          onProcessed={setRun}
          onOpenResults={() => setScreen("workspace")}
          onCancel={() => setScreen("model")}
        />
      )}

      {screen === "workspace" && run && (
        <Workspace
          run={run}
          onReport={() => setScreen("report")}
          onRerun={() => setScreen("model")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
          notify={setToast}
        />
      )}

      {screen === "report" && run && (
        <Report
          run={run}
          onBack={() => setScreen("workspace")}
          onHome={() => setScreen("dashboard")}
          notify={setToast}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
