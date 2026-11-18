import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { FileSearch, Menu, Upload, X } from "lucide-react";
import heroUrl from "../assets/hero-khatm.webp";
import { BrandMark, Button, IconButton, Seal, StatusMark, Wordmark } from "../brand/ui";
import { copy } from "../content/copy";
import type { ResultStatus } from "../data";
import ModelDrawing from "./landing/ModelDrawing";
import type { LandingProps } from "./types";
import "./landing.css";

/* Strings that copy.ts does not have. Kept local so copy.ts stays shared and untouched. */
const LOCAL = {
  navLabel: "أقسام الصفحة",
  menu: "القائمة",
  sealMain: "13 من 17",
  notInFile: "لا يثبته الملف المعماري",
  quote: "… ويجب تكسية الحوائط بمواد متينة وقابلة للتنظيف، على ألا يقل ارتفاعها عن (1.80) متر من منسوب الأرضية.",
  cite: "البند 4.5.2، صفحة 24، بند إلزامي",
  elementName: "Kitchen wall tiles west",
  elementType: "IfcCovering",
  guid: "2jRhPSWXnLPRVwBbnm6Iqv",
  insetLabel: "تكسية جدار المطبخ الغربي بارتفاع 1.50 م، وخط متقطع عند 1.80 م المطلوبة.",
  insetCaption: "موضع العنصر في الرسم.",
  plateLabel:
    "رسم محوري لمخطط المطعم التجريبي: المطبخ والمستودع والتحضير ودورة المياه وصالة الطعام. جدار المطبخ الغربي مبرز بلون المخالفة، بتكسية ارتفاعها 1.50 م، وخط متقطع عند 1.80 م المطلوبة.",
  plateCaption: "رسم توضيحي للملف التجريبي",
  legendFail: "العنصر غير المطابق",
  legendRequired: "الارتفاع المطلوب",
} as const;

/* Known result of the sample file, as quoted in copy.dossier.note. */
const TALLY: ReadonlyArray<readonly [ResultStatus, number]> = [
  ["pass", 12],
  ["fail", 1],
  ["unknown", 4],
];

interface RegisterRow {
  clause: string;
  what: string;
  /** Omitted when the architectural file cannot prove the clause. */
  measured?: string;
  required?: string;
  note?: string;
  status: ResultStatus;
}

/* Excerpt of the sample run in clause order (values from the approved board and BRIEF.md). */
const REGISTER: readonly RegisterRow[] = [
  { clause: "3.1", what: "الحد الأدنى لمساحة الموقع", measured: "159.3 م²", required: "16 م² على الأقل", status: "pass" },
  { clause: "4.1.3", what: "الصرف", status: "unknown" },
  {
    clause: "4.2.2",
    what: "مساحات التحضير والطهي والتخزين والتقديم",
    measured: "محددة في الملف",
    required: "مطبخ ومخزن وصالة",
    status: "pass",
  },
  { clause: "4.3.2", what: "خدمات الواجهة", status: "unknown" },
  { clause: "4.4.1", what: "الوصول الشامل", status: "unknown" },
  {
    clause: "4.5.2",
    what: "تكسية حوائط المطبخ من منسوب الأرضية",
    measured: "1.50 م",
    required: "1.80 م على الأقل",
    status: "fail",
  },
  { clause: "4.7.1", what: "التهوية", status: "unknown" },
  {
    clause: "4.8.1",
    what: "مساحة المستودع",
    measured: "11.2 م²",
    required: "71.0 م² حدًّا أعلى",
    note: "25% من الترخيص أو 150 م²، أيهما أقل",
    status: "pass",
  },
  { clause: "4.9.1", what: "عرض مخرج الطوارئ", measured: "0.95 م", required: "0.90 م على الأقل", note: "حد مؤقت", status: "pass" },
  {
    clause: "4.10.1",
    what: "موقع باب دورة المياه",
    measured: "يفتح على صالة الطعام",
    required: "ألا يفتح على المطبخ",
    status: "pass",
  },
];

const ICON = { size: 18, strokeWidth: 1.6 } as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Gold rule with the seal's triangle at its centre. */
function Ornament({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 168 10" aria-hidden="true" focusable="false">
      <path d="M0 7.5H72M96 7.5H168" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M78 9.5L84 0.5L90 9.5Z" fill="currentColor" />
    </svg>
  );
}

export default function Landing({ onStart, onSample }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const listId = useId();

  /* Escape or a click outside closes the small-screen menu. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      navRef.current?.querySelector<HTMLButtonElement>(".lp-nav__toggle")?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  /* In-page links scroll without touching the hash, which the shell uses for routing. */
  const scrollTo = (id: string) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenuOpen(false);
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };

  const toTop = () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });

  const navLinks = [
    { id: "lp-model", label: copy.nav.how },
    { id: "lp-register", label: copy.nav.clauses },
    { id: "lp-dossier", label: copy.nav.sample },
  ];

  return (
    <div className="lp">
      <header className="lp-bar">
        <div className="lp-wrap lp-bar__inner">
          <Wordmark className="lp-bar__brand" onClick={toTop} />
          <nav className="lp-nav" aria-label={LOCAL.navLabel} ref={navRef} data-open={menuOpen}>
            <IconButton
              className="lp-nav__toggle"
              label={LOCAL.menu}
              aria-expanded={menuOpen}
              aria-controls={listId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X {...ICON} aria-hidden="true" /> : <Menu {...ICON} aria-hidden="true" />}
            </IconButton>
            <ul className="lp-nav__list" id={listId}>
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a className="lp-nav__link" href={`#${link.id}`} onClick={scrollTo(link.id)}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <Button variant="on-dark" size="small" className="lp-bar__cta" onClick={onStart}>
            {copy.nav.cta}
          </Button>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <img
            className="lp-hero__img"
            src={heroUrl}
            alt={copy.hero.imageAlt}
            width={2048}
            height={1152}
            fetchPriority="high"
            decoding="async"
          />
          <div className="lp-hero__frame" aria-hidden="true">
            <svg className="lp-frame lp-frame--outer" focusable="false">
              <rect width="100%" height="100%" pathLength={1} />
            </svg>
            <svg className="lp-frame lp-frame--inner" focusable="false">
              <rect width="100%" height="100%" pathLength={1} />
            </svg>
          </div>
          <div className="lp-hero__copy">
            <div className="lp-hero__words">
              <Ornament className="lp-hero__ornament" />
              <h1 id="lp-hero-title" className="lp-hero__title">
                {copy.hero.title}
              </h1>
              <p className="lp-hero__lede">{copy.hero.lede}</p>
            </div>
            <Button className="lp-hero__cta" icon={<Upload {...ICON} />} onClick={onStart}>
              {copy.hero.cta}
            </Button>
          </div>
        </section>

        <section className="lp-dossier" id="lp-dossier" tabIndex={-1} aria-labelledby="lp-dossier-title">
          <div className="lp-wrap">
            <article className="lp-dossier__card on-stone">
              <Seal className="lp-dossier__seal" size={168} main={LOCAL.sealMain} label={copy.dossier.sealLabel} />
              <h2 id="lp-dossier-title" className="lp-dossier__title">
                {copy.dossier.title}
              </h2>
              <dl className="lp-record">
                <div className="lp-record__item lp-record__item--file">
                  <dt>{copy.dossier.fileLabel}</dt>
                  <dd>
                    <bdi dir="ltr">{copy.dossier.file}</bdi>
                  </dd>
                </div>
                <div className="lp-record__item">
                  <dt>{copy.dossier.schemaLabel}</dt>
                  <dd>
                    <bdi dir="ltr">{copy.dossier.schema}</bdi>
                  </dd>
                </div>
                <div className="lp-record__item">
                  <dt>{copy.dossier.elementsLabel}</dt>
                  <dd>{copy.dossier.elements}</dd>
                </div>
                <div className="lp-record__item lp-record__item--wide">
                  <dt>{copy.dossier.referenceLabel}</dt>
                  <dd>{copy.dossier.reference}</dd>
                </div>
                <div className="lp-record__item">
                  <dt>{copy.dossier.scopeLabel}</dt>
                  <dd>{copy.dossier.scope}</dd>
                </div>
              </dl>
              <div className="lp-dossier__foot">
                <ul className="lp-tally">
                  {TALLY.map(([status, count]) => (
                    <li key={status}>
                      <StatusMark status={status} label={`${count} ${copy.status[status]}`} />
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" icon={<FileSearch {...ICON} />} onClick={() => onSample("tiles")}>
                  {copy.dossier.cta}
                </Button>
              </div>
            </article>
          </div>
        </section>

        <section className="lp-register" id="lp-register" tabIndex={-1} aria-labelledby="lp-register-title">
          <div className="lp-wrap">
            <header className="lp-section-head">
              <h2 id="lp-register-title" className="lp-h2">
                {copy.register.title}
              </h2>
              <p className="lp-lede">{copy.register.lede}</p>
            </header>

            <table className="lp-table" role="table">
              <caption className="sr-only">
                {copy.register.title}: <bdi dir="ltr">{copy.dossier.file}</bdi>
              </caption>
              <colgroup>
                <col className="lp-col-clause" />
                <col />
                <col className="lp-col-measured" />
                <col className="lp-col-required" />
                <col className="lp-col-status" />
              </colgroup>
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">
                    {copy.register.col.clause}
                  </th>
                  <th scope="col" role="columnheader">
                    {copy.register.col.what}
                  </th>
                  <th scope="col" role="columnheader">
                    {copy.register.col.measured}
                  </th>
                  <th scope="col" role="columnheader">
                    {copy.register.col.required}
                  </th>
                  <th scope="col" role="columnheader">
                    {copy.register.col.status}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {REGISTER.map((row) => (
                  <RegisterRows key={row.clause} row={row} />
                ))}
              </tbody>
            </table>
            <p className="lp-register__foot">{copy.register.foot}</p>
          </div>
        </section>

        <section className="lp-model" id="lp-model" tabIndex={-1} aria-labelledby="lp-model-title">
          <div className="lp-wrap">
            <Ornament className="lp-chapter-mark" />
            <div className="lp-model__grid">
              <div className="lp-model__text">
                <h2 id="lp-model-title" className="lp-h2">
                  {copy.model.title}
                </h2>
                <p className="lp-lede">{copy.model.body}</p>
                <dl className="lp-facts">
                  <div>
                    <dt>{copy.model.element}</dt>
                    <dd>
                      <bdi dir="ltr">{LOCAL.elementName}</bdi>
                      <span className="lp-facts__sub">
                        <bdi dir="ltr">{LOCAL.elementType}</bdi>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.model.guid}</dt>
                    <dd>
                      <bdi dir="ltr" className="lp-guid">
                        {LOCAL.guid}
                      </bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.dossier.elementsLabel}</dt>
                    <dd>{copy.dossier.elements}</dd>
                  </div>
                </dl>
              </div>
              <figure className="lp-plate">
                <div className="lp-plate__frame">
                  <ModelDrawing variant="plate" label={LOCAL.plateLabel} />
                </div>
                <div className="lp-plate__foot">
                  <ul className="lp-legend">
                    <li>
                      <span className="lp-legend__swatch" aria-hidden="true" />
                      {LOCAL.legendFail}
                    </li>
                    <li>
                      <span className="lp-legend__dash" aria-hidden="true" />
                      {LOCAL.legendRequired}
                    </li>
                  </ul>
                  <figcaption>
                    {LOCAL.plateCaption} <bdi dir="ltr">{copy.dossier.file}</bdi>
                  </figcaption>
                </div>
              </figure>
            </div>
          </div>
        </section>

        <section className="lp-notes" aria-labelledby="lp-notes-title">
          <div className="lp-wrap lp-notes__grid">
            <h2 id="lp-notes-title" className="lp-notes__title">
              {copy.notes.title}
            </h2>
            <ul className="lp-notes__list">
              {copy.notes.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-closing" aria-labelledby="lp-closing-title">
          <div className="lp-wrap lp-closing__inner">
            <BrandMark className="lp-closing__mark" />
            <div className="lp-closing__text">
              <h2 id="lp-closing-title">{copy.closing.title}</h2>
              <p>{copy.closing.lede}</p>
            </div>
            <Button variant="gold" className="lp-closing__cta" icon={<Upload {...ICON} />} onClick={onStart}>
              {copy.closing.cta}
            </Button>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer__rule lp-footer__inner">
            <div className="lp-footer__brand">
              <Wordmark onClick={toTop} />
              <p className="lp-footer__disclaimer">{copy.footer.disclaimer}</p>
            </div>
            <p className="lp-footer__basis">{copy.footer.basis}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RegisterRows({ row }: { row: RegisterRow }) {
  const failing = row.status === "fail";
  const cellLabel = (text: string) => (
    <span className="lp-cell-label" aria-hidden="true">
      {text}
    </span>
  );
  return (
    <>
      <tr role="row" className={failing ? "lp-row lp-row--fail" : "lp-row"}>
        <th scope="row" role="rowheader" className="lp-cell-clause">
          <span className="num">{row.clause}</span>
        </th>
        <td role="cell" className="lp-cell-what">
          {row.what}
        </td>
        {row.measured ? (
          <>
            <td role="cell" className={failing ? "lp-cell-measured lp-cell-measured--fail" : "lp-cell-measured"}>
              {cellLabel(copy.register.col.measured)}
              <span className="num">{row.measured}</span>
            </td>
            <td role="cell" className="lp-cell-required">
              {cellLabel(copy.register.col.required)}
              <span className="num">{row.required}</span>
              {row.note && <span className="lp-cell-note">{row.note}</span>}
            </td>
          </>
        ) : (
          <td role="cell" colSpan={2} className="lp-cell-na">
            {LOCAL.notInFile}
          </td>
        )}
        <td role="cell" className="lp-cell-status">
          <StatusMark status={row.status} />
        </td>
      </tr>
      {failing && (
        <tr role="row" className="lp-row-detail">
          <td role="cell" colSpan={5}>
            <div className="lp-detail">
              <div className="lp-detail__clause">
                <p className="lp-detail__label">{copy.results.detail.clause}</p>
                <blockquote className="lp-detail__quote">«{LOCAL.quote}»</blockquote>
                <p className="lp-detail__cite">{LOCAL.cite}</p>
              </div>
              <div className="lp-detail__element">
                <p className="lp-detail__label">{copy.results.detail.element}</p>
                <p className="lp-detail__name">
                  <bdi dir="ltr">{LOCAL.elementName}</bdi>
                </p>
                <p className="lp-detail__sub">
                  <bdi dir="ltr">{LOCAL.elementType}</bdi>
                </p>
                <p className="lp-detail__sub">
                  <bdi dir="ltr">GUID {LOCAL.guid}</bdi>
                </p>
                <p className="lp-detail__label lp-detail__label--gap">{copy.results.detail.action}</p>
                <p className="lp-detail__action">{copy.results.detail.action452}</p>
              </div>
              <figure className="lp-detail__inset">
                <ModelDrawing variant="inset" label={LOCAL.insetLabel} />
                <figcaption>{LOCAL.insetCaption}</figcaption>
              </figure>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
