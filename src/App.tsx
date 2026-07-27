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
  ShieldCheck,
  UploadCloud,
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
  analysisStages,
  calculateSummary,
  defaultFacility,
  getFindings,
  modelDisclaimer,
  modelMetadata,
  primaryDisclaimer,
  statusLabels,
  statusShortLabels,
  type FacilityDetails,
  type Finding,
  type ModelMetadata,
  type ResultFilter,
  type ResultStatus,
  type Scenario,
} from "./data";

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
  scenario: Scenario;
} {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      const parsed = JSON.parse(value);
      return {
        facility: { ...defaultFacility, ...parsed.facility },
        scenario: parsed.scenario === "ready" ? "ready" : "review",
      };
    }
  } catch {
    // The app remains fully usable when storage is unavailable.
  }
  return { facility: defaultFacility, scenario: "review" };
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
          <nav className={`app-nav ${menuOpen ? "is-open" : ""}`}>
            <button type="button" onClick={onHome}>
              الرئيسية
            </button>
            <button type="button" onClick={onNew}>
              فحص جديد
            </button>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              كيف يعمل؟
            </a>
            <span className="prototype-badge">نسخة تجريبية</span>
          </nav>
          <div className="app-header__actions">
            <button
              type="button"
              className="button button--small button--outline"
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
        <p>
          مسار عملي يحافظ على الدليل الهندسي ومصدر القاعدة في كل خطوة.
        </p>
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
  facility,
  onStart,
  onDemo,
  onOpenRecent,
}: {
  facility: FacilityDetails;
  onStart: () => void;
  onDemo: () => void;
  onOpenRecent: () => void;
}) {
  return (
    <>
      <main className="dashboard">
        <section className="hero">
          <div className="hero__content">
            <span className="eyebrow eyebrow--light">
              فحص هندسي استباقي، مدعوم بالدليل
            </span>
            <h1>
              اعرف ملاحظات مخططك
              <br />
              <em>قبل تقديم الطلب.</em>
            </h1>
            <p>
              جواز الامتثال يربط بيانات BIM بقواعد قابلة للتتبع، ثم يعرض
              الملاحظات داخل نموذج ثلاثي الأبعاد ويقترح خطوة المعالجة.
            </p>
            <div className="hero__actions">
              <button type="button" className="button button--light" onClick={onStart}>
                ابدأ فحصًا جديدًا
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                className="button button--ghost-light"
                onClick={onDemo}
              >
                <PanelTop size={18} />
                استكشف النموذج التفاعلي
              </button>
            </div>
            <div className="hero__trust">
              <span>
                <Check size={15} /> نتائج مرتبطة بعناصر النموذج
              </span>
              <span>
                <Check size={15} /> حالات واضحة: مطابق، ملاحظة، غير مكتمل
              </span>
            </div>
          </div>

          <div className="hero__visual" aria-label="معاينة منتج جواز الامتثال">
            <div className="mini-window">
              <div className="mini-window__bar">
                <span />
                <span />
                <span />
                <small>restaurant-review.ifc</small>
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
            <div className="hero__float hero__float--top">
              <ShieldCheck size={19} />
              <span>
                <strong>10 قواعد</strong>
                <small>DEMO-REST-2026.1</small>
              </span>
            </div>
            <div className="hero__float hero__float--bottom">
              <FileCheck2 size={19} />
              <span>
                <strong>الدليل محفوظ</strong>
                <small>GUID + القياس + المصدر</small>
              </span>
            </div>
          </div>
        </section>

        <Disclaimer compact />

        <section className="dashboard-grid">
          <div className="dashboard-main">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">مساحة العمل</span>
                <h2>مرحبًا، مكتب المسار الهندسي</h2>
              </div>
              <button type="button" className="text-button" onClick={onStart}>
                عرض كل المشاريع <ArrowUpLeft size={15} />
              </button>
            </div>

            <button type="button" className="recent-project" onClick={onOpenRecent}>
              <div className="recent-project__preview">
                <span className="recent-project__building">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="recent-project__status">
                  <i /> يحتاج معالجة
                </span>
              </div>
              <div className="recent-project__content">
                <div>
                  <span className="project-type">مطعم • IFC</span>
                  <h3>{facility.projectName}</h3>
                  <p>
                    <MapPin size={14} />
                    {facility.city}، {facility.district}
                    <span>•</span>
                    {facility.area} م²
                  </p>
                </div>
                <div className="recent-project__metrics">
                  <span>
                    <strong>78%</strong>
                    مؤشر الجاهزية
                  </span>
                  <span className="metric-fail">
                    <strong>2</strong>
                    ملاحظات
                  </span>
                  <span className="metric-unknown">
                    <strong>1</strong>
                    غير مكتمل
                  </span>
                </div>
                <div className="recent-project__footer">
                  <span>آخر فحص: اليوم، 10:42 ص</span>
                  <span className="open-project">
                    فتح مساحة الفحص <ArrowLeft size={15} />
                  </span>
                </div>
              </div>
            </button>
          </div>

          <aside className="quick-start">
            <div className="quick-start__icon">
              <Plus size={23} />
            </div>
            <h3>ابدأ من نموذج جاهز</h3>
            <p>
              جرّب الرحلة الكاملة على مطعم معدّ مسبقًا وفيه ملاحظات مقصودة.
            </p>
            <button type="button" className="button button--primary" onClick={onDemo}>
              تشغيل العرض التجريبي
              <ArrowLeft size={17} />
            </button>
            <button type="button" className="text-button" onClick={onStart}>
              أو أدخل بيانات مشروعك
            </button>
          </aside>
        </section>

        <FlowDiagram />
      </main>
      <footer className="site-footer">
        <BrandMark compact />
        <p>نموذج إثبات مفهوم — لا يوجد تكامل رسمي مع بلدي أو أي جهة حكومية.</p>
        <span dir="ltr">DEMO-REST-2026.1</span>
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
        <div className="wizard-heading">
          <span className="eyebrow">الخطوة {current} من 4</span>
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
  onChange,
  onSubmit,
  onHome,
  onNew,
}: {
  value: FacilityDetails;
  onChange: (value: FacilityDetails) => void;
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
      description="هذه البيانات تحدد نطاق الفحص وحزمة القواعد التي ستطبق على النموذج."
      onHome={onHome}
      onNew={onNew}
    >
      <form className="form-card" onSubmit={submit}>
        <div className="form-card__notice">
          <BadgeCheck size={19} />
          <span>
            <strong>نطاق النموذج الأولي: نشاط المطاعم</strong>
            <small>
              البيانات التالية معبأة لتستطيع تجربة الرحلة مباشرة، ويمكنك تعديلها.
            </small>
          </span>
        </div>

        <div className="form-grid">
          <label className="field field--wide">
            <span>اسم المشروع</span>
            <input
              value={value.projectName}
              onChange={(event) => update("projectName", event.target.value)}
              placeholder="مثال: مطعم النخيل — فرع الياسمين"
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
                onChange={(event) => update("activity", event.target.value)}
              >
                <option>مطعم</option>
              </select>
            </div>
            <small>النشاط الوحيد المتاح في نسخة العرض.</small>
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
  scenario,
  metadata,
  onScenario,
  onMetadata,
  onContinue,
  onBack,
  onHome,
  onNew,
}: {
  scenario: Scenario;
  metadata: ModelMetadata;
  onScenario: (scenario: Scenario) => void;
  onMetadata: (metadata: ModelMetadata) => void;
  onContinue: () => void;
  onBack: () => void;
  onHome: () => void;
  onNew: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(true);

  const chooseScenario = (nextScenario: Scenario) => {
    onScenario(nextScenario);
    onMetadata(modelMetadata[nextScenario]);
    setError("");
    setValidated(true);
  };

  const processFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setValidated(false);

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

    if (!text.includes("ISO-10303-21") || !text.includes("FILE_SCHEMA")) {
      setError("لم يتم العثور على ترويسة IFC صالحة في الملف.");
      return;
    }

    const marker = text.match(/JAWAZ_SCENARIO=(review|ready)/i)?.[1] as
      | Scenario
      | undefined;

    if (!marker) {
      setError(
        "تم التحقق من ترويسة IFC، لكن الفحص الكامل في هذه النسخة يعمل فقط على ملفي الاختبار المرتبطين بالنموذج الدلالي. استخدم أحد الملفين أدناه.",
      );
      return;
    }

    const spaces = (text.match(/IFCSPACE\s*\(/gi) ?? []).length || 6;
    const doors = (text.match(/IFCDOOR\s*\(/gi) ?? []).length || 7;
    const nextMetadata: ModelMetadata = {
      ...modelMetadata[marker],
      fileName: file.name,
      size: `${Math.max(file.size / 1024, 1).toFixed(1)} KB`,
      spaces,
      doors,
      elements: (text.match(/^#\d+=/gim) ?? []).length || modelMetadata[marker].elements,
      scenario: marker,
    };

    onScenario(marker);
    onMetadata(nextMetadata);
    setValidated(true);
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
      description="استخدم أحد نموذجي الاختبار للحصول على تجربة ثلاثية كاملة، أو تحقّق من ملف IFC خاص بك."
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
            <p>أو اختر ملفًا من جهازك • الحد الأقصى 50 MB</p>
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
            <small>
              لا تدّعي النسخة التجريبية تحليل ملفات عشوائية؛ المسار الكامل متاح
              لملفي الاختبار فقط.
            </small>
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

          <div className="fixture-heading">
            <div>
              <span className="eyebrow">نماذج اختبار جاهزة</span>
              <h3>اختر نتيجة الرحلة التي تريد تجربتها</h3>
            </div>
            <span>IFC4 • نموذج دلالي</span>
          </div>

          <div className="fixture-grid">
            <button
              type="button"
              className={`fixture-card ${scenario === "review" ? "is-selected" : ""}`}
              onClick={() => chooseScenario("review")}
            >
              <span className="fixture-card__check">
                {scenario === "review" && <Check size={14} />}
              </span>
              <span className="fixture-card__preview fixture-card__preview--review">
                <i />
                <i />
                <i />
              </span>
              <span className="fixture-card__copy">
                <strong>مطعم — يحتاج معالجة</strong>
                <small>7 مطابق • 2 ملاحظة • 1 غير مكتمل</small>
              </span>
              <span className="fixture-card__tag fixture-card__tag--fail">
                مناسب للعرض
              </span>
            </button>

            <button
              type="button"
              className={`fixture-card ${scenario === "ready" ? "is-selected" : ""}`}
              onClick={() => chooseScenario("ready")}
            >
              <span className="fixture-card__check">
                {scenario === "ready" && <Check size={14} />}
              </span>
              <span className="fixture-card__preview fixture-card__preview--ready">
                <i />
                <i />
                <i />
              </span>
              <span className="fixture-card__copy">
                <strong>مطعم — مستوفٍ لقواعد العرض</strong>
                <small>10 مطابق • لا توجد حالات معلقة</small>
              </span>
              <span className="fixture-card__tag fixture-card__tag--pass">جاهز</span>
            </button>
          </div>

          <div className="sample-downloads">
            <span>هل تريد اختبار الرفع بنفسك؟</span>
            <a href="/samples/restaurant-review.ifc" download>
              <Download size={14} /> تحميل ملف يحتاج معالجة
            </a>
            <a href="/samples/restaurant-ready.ifc" download>
              <Download size={14} /> تحميل الملف الجاهز
            </a>
          </div>
        </section>

        <aside className="model-summary">
          <div className="model-summary__head">
            <span className="file-icon">
              <FileBox size={22} />
            </span>
            <div>
              <strong dir="ltr">{metadata.fileName}</strong>
              <small>{metadata.size}</small>
            </div>
            <span className="quality-badge">
              <CheckCircle2 size={14} /> صالح للفحص
            </span>
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
              <dt>المخطط</dt>
              <dd dir="ltr">{metadata.schema}</dd>
            </div>
            <div>
              <dt>الوحدات</dt>
              <dd>{metadata.units}</dd>
            </div>
            <div>
              <dt>الطوابق</dt>
              <dd>{metadata.storeys}</dd>
            </div>
            <div>
              <dt>المساحات</dt>
              <dd>{metadata.spaces}</dd>
            </div>
            <div>
              <dt>الأبواب</dt>
              <dd>{metadata.doors}</dd>
            </div>
            <div>
              <dt>العناصر</dt>
              <dd>{metadata.elements}</dd>
            </div>
          </dl>
          <div className="model-summary__note">
            <Info size={15} />
            النموذج ثلاثي الأبعاد في هذه النسخة مبني دلاليًا ويرتبط بمعرفات
            ثابتة لاختبار الفكرة بدقة.
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
          disabled={!validated || Boolean(error)}
        >
          تأكيد النموذج وبدء الفحص
          <ArrowLeft size={17} />
        </button>
      </div>
      <Disclaimer compact />
    </WizardShell>
  );
}

function AnalysisScreen({
  metadata,
  scenario,
  onComplete,
  onCancel,
}: {
  metadata: ModelMetadata;
  scenario: Scenario;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setStage(0);
    const timer = window.setInterval(() => {
      setStage((current) => {
        if (current >= analysisStages.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 620);
    return () => window.clearInterval(timer);
  }, [scenario]);

  const complete = stage >= analysisStages.length;
  const progress = Math.min(100, Math.round((stage / analysisStages.length) * 100));

  useEffect(() => {
    if (!complete) return;
    const timeout = window.setTimeout(onComplete, 900);
    return () => window.clearTimeout(timeout);
  }, [complete, onComplete]);

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
            <FileBox size={16} /> {metadata.fileName}
          </span>
        </div>

        <div className="analysis-card__content">
          <span className="eyebrow">فحص حزمة المطاعم</span>
          <h1>{complete ? "اكتمل الفحص بنجاح" : "نفحص النموذج الآن…"}</h1>
          <p>
            ينفذ محرك القواعد حسابات محددة ويربط كل نتيجة بالدليل والعنصر
            الهندسي.
          </p>

          <div className="analysis-progress">
            <div className="analysis-progress__track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong>{progress}%</strong>
          </div>

          <div className="analysis-stages">
            {analysisStages.map((label, index) => {
              const done = index < stage;
              const active = index === stage && !complete;
              return (
                <div
                  className={`analysis-stage ${done ? "is-done" : ""} ${
                    active ? "is-active" : ""
                  }`}
                  key={label}
                >
                  <span>
                    {done ? (
                      <Check size={15} />
                    ) : active ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <p>{label}</p>
                  {done && index === 1 && (
                    <small>
                      {metadata.spaces} مساحات • {metadata.doors} أبواب •{" "}
                      {metadata.elements} عنصرًا
                    </small>
                  )}
                  {done && index === 3 && (
                    <small dir="ltr">DEMO-REST-2026.1 • 10 rules</small>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="text-button" onClick={onCancel}>
            إلغاء والعودة إلى النموذج
          </button>
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
            {summary.failed
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
            <code dir="ltr">{finding.elementGuid ?? "—"}</code>
            {finding.elementGuid && (
              <button type="button" onClick={onCopy} title="نسخ المعرف">
                <Clipboard size={13} />
              </button>
            )}
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
  facility,
  scenario,
  metadata,
  onReport,
  onRerun,
  onHome,
  onNew,
  notify,
}: {
  facility: FacilityDetails;
  scenario: Scenario;
  metadata: ModelMetadata;
  onReport: () => void;
  onRerun: () => void;
  onHome: () => void;
  onNew: () => void;
  notify: (message: string) => void;
}) {
  const findings = useMemo(() => getFindings(scenario), [scenario]);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [selectedRule, setSelectedRule] = useState<string | undefined>(
    scenario === "review" ? "DOOR-WIDTH-001" : undefined,
  );
  const [selectedElement, setSelectedElement] = useState<string | undefined>(
    scenario === "review" ? "D-EXIT-02" : undefined,
  );
  const [mobileTab, setMobileTab] = useState<"model" | "findings">("model");

  useEffect(() => {
    setSelectedRule(scenario === "review" ? "DOOR-WIDTH-001" : undefined);
    setSelectedElement(scenario === "review" ? "D-EXIT-02" : undefined);
  }, [scenario]);

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
    if (linked) setSelectedRule(linked.ruleId);
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
              <span className="eyebrow">DEMO-REST-2026.1</span>
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
  facility,
  scenario,
  metadata,
  onBack,
  onHome,
  notify,
}: {
  facility: FacilityDetails;
  scenario: Scenario;
  metadata: ModelMetadata;
  onBack: () => void;
  onHome: () => void;
  notify: (message: string) => void;
}) {
  const findings = useMemo(() => getFindings(scenario), [scenario]);
  const summary = calculateSummary(findings, scenario);
  const generatedAt = useMemo(() => formatDate(), []);

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
            <td>${escapeHtml(finding.recommendation)}</td>
          </tr>`,
      )
      .join("");
    const documentHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>تقرير جاهزية — ${escapeHtml(facility.projectName)}</title>
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
<table><thead><tr><th>القاعدة</th><th>الحالة</th><th>النتيجة</th><th>المرصود</th><th>المتوقع</th><th>الإجراء المقترح</th></tr></thead><tbody>${rows}</tbody></table>
<div class="notice"><strong>تنبيه:</strong> ${escapeHtml(primaryDisclaimer)}<br>${escapeHtml(modelDisclaimer)}</div>
</body></html>`;
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jawaz-readiness-${scenario}.html`;
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
            <strong dir="ltr">JCP-2026-0727-001</strong>
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
            <small dir="ltr">DEMO-REST-2026.1</small>
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
          </div>
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
  const [scenario, setScenario] = useState<Scenario>(stored.scenario);
  const [metadata, setMetadata] = useState<ModelMetadata>(
    modelMetadata[stored.scenario],
  );
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ facility, scenario }));
  }, [facility, scenario]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [screen]);

  const startNew = () => {
    setScreen("details");
  };

  const openDemo = () => {
    setScenario("review");
    setMetadata(modelMetadata.review);
    setScreen("analysis");
  };

  const resetAll = () => {
    setFacility(defaultFacility);
    setScenario("review");
    setMetadata(modelMetadata.review);
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
            facility={facility}
            onStart={startNew}
            onDemo={openDemo}
            onOpenRecent={() => {
              setScenario("review");
              setMetadata(modelMetadata.review);
              setScreen("workspace");
            }}
          />
        </>
      )}

      {screen === "details" && (
        <FacilityForm
          value={facility}
          onChange={setFacility}
          onSubmit={() => setScreen("model")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
        />
      )}

      {screen === "model" && (
        <ModelUpload
          scenario={scenario}
          metadata={metadata}
          onScenario={(nextScenario) => {
            setScenario(nextScenario);
            setMetadata(modelMetadata[nextScenario]);
          }}
          onMetadata={setMetadata}
          onContinue={() => setScreen("analysis")}
          onBack={() => setScreen("details")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
        />
      )}

      {screen === "analysis" && (
        <AnalysisScreen
          metadata={metadata}
          scenario={scenario}
          onComplete={() => setScreen("workspace")}
          onCancel={() => setScreen("model")}
        />
      )}

      {screen === "workspace" && (
        <Workspace
          facility={facility}
          scenario={scenario}
          metadata={metadata}
          onReport={() => setScreen("report")}
          onRerun={() => setScreen("analysis")}
          onHome={() => setScreen("dashboard")}
          onNew={resetAll}
          notify={setToast}
        />
      )}

      {screen === "report" && (
        <Report
          facility={facility}
          scenario={scenario}
          metadata={metadata}
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
