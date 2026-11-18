import { Fragment, type ReactNode } from "react";
import { ExternalLink, Upload, X } from "lucide-react";
import heroUrl from "../assets/model-hero.webp";
import networksUrl from "../assets/model-networks.webp";
import { copy } from "../content/copy";
import { SAMPLE_FILES, sampleById } from "../content/samples";
import { RESTAURANT_REQUIREMENTS, RESTAURANT_REQUIREMENTS_SOURCE, requirementById } from "../ifc/standard/requirements";
import type { LandingProps } from "./types";
import "./landing.css";

/* The sample whose measurement the hero shows: its kitchen cladding is 1.50 m against 1.80 m required. */
const HERO_SAMPLE = sampleById("tiles");
const HERO_CLAUSE = requirementById.get("MOMAH-REST-4.5.2-CLADDING");

/* Strings this page needs that copy.ts does not have. */
const LOCAL = {
  cta: "ارفع ملف IFC",
  samplesLead: "أو جرّب مخططًا جاهزًا:",
  heroAlt: "مشهد ثلاثي الأبعاد للمطعم التجريبي مبني من ملف IFC",
  heroCaption: "النموذج ثلاثي الأبعاد لملف العينة نفسه",
  measured: "1.50",
  required: "1.80",
  unit: "م",
  requiredLabel: "المطلوب",
  modelCta: "افتح النموذج التفاعلي",
  modelAlt: "مشهد ثلاثي الأبعاد للمطعم التجريبي تظهر فيه شبكات المبنى بألوانها",
  newTab: "، يفتح في صفحة جديدة",
  networks: [
    { name: "المياه", color: "#2b6cb0" },
    { name: "الصرف الصحي", color: "#8a5a2b" },
    { name: "الكهرباء", color: "#b7791f" },
    { name: "التكييف والتهوية", color: "#5a7184" },
    { name: "الحماية من الحريق", color: "#b42318" },
  ],
} as const;

/* Clauses an architectural IFC file cannot prove; every other requirement clause is measured from the file. */
const NOT_VERIFIABLE = new Set(["MOMAH-REST-4.3.2-FACADE", "MOMAH-REST-4.7.1-VENT", "MOMAH-REST-4.4.1-ACCESS"]);

interface ClauseRow {
  id: string;
  number: string;
  subject: string;
}

/** Same reading as the results screen (results/findings.ts clauseOf): "4.9.1 → SBC-801" is 4.9.1,
    "4.10.1 (2)" keeps its item number so the rows match the results register. */
function clauseNumber(clause: string): string {
  return /^\d+(?:\.\d+)*(?:\s*\(\d+\))?/.exec(clause)?.[0] ?? clause;
}

function byClauseNumber(a: ClauseRow, b: ClauseRow): number {
  const left = (a.number.match(/\d+/g) ?? []).map(Number);
  const right = (b.number.match(/\d+/g) ?? []).map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/* Built from the requirements registry, so numbers and subjects match the results screen. */
const CLAUSES: ClauseRow[] = RESTAURANT_REQUIREMENTS.filter((requirement) => requirement.kind !== "platform")
  .map((requirement) => ({
    id: requirement.id,
    number: clauseNumber(requirement.clause),
    subject: requirement.subject,
  }))
  .sort(byClauseNumber);

const MEASURED = CLAUSES.filter((row) => !NOT_VERIFIABLE.has(row.id));
const NOT_IN_FILE = CLAUSES.filter((row) => NOT_VERIFIABLE.has(row.id));

/* Latin runs (IFC, IFC2X3, GUID, Revit) keep their own direction inside Arabic sentences. Dots and hyphens
   only join a run from inside, so a sentence's own full stop stays outside the <bdi>. */
const LATIN_RUN = /[A-Za-z]\w*(?:[.-]\w+)*(?:\s+[A-Za-z0-9]\w*(?:[.-]\w+)*)*/g;

function Latin({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_RUN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <bdi key={start} dir="ltr">
        {match[0]}
      </bdi>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

function ClauseList({ rows }: { rows: ClauseRow[] }) {
  return (
    <ul className="hm-clause-list">
      {rows.map((row) => (
        <li key={row.id} className="hm-clause">
          <span className="hm-clause__no num">
            <bdi dir="ltr">{row.number}</bdi>
          </span>
          <span className="hm-clause__subject">{row.subject}</span>
        </li>
      ))}
    </ul>
  );
}

/** The measurement signature: the value read from the sample file against the value the clause requires. */
function Measurement() {
  const subject = HERO_CLAUSE?.subject ?? "ارتفاع تكسية حوائط المطبخ";
  const clause = HERO_CLAUSE?.clause ?? "4.5.2";
  return (
    <div className="hm-measure" role="group" aria-label={`${clause} ${subject}`}>
      <p className="hm-measure__clause">
        <bdi dir="ltr" className="num">
          {clause}
        </bdi>{" "}
        {subject}
      </p>
      <p className="hm-measure__row">
        <span className="hm-measure__value num">
          {LOCAL.measured}
          <span className="hm-measure__unit"> {LOCAL.unit}</span>
        </span>
        <span className="hm-measure__required">
          {LOCAL.requiredLabel}{" "}
          <span className="num">
            {LOCAL.required} {LOCAL.unit}
          </span>
        </span>
      </p>
      <p className="status status--fail hm-measure__status">
        <span className="status__glyph" aria-hidden="true">
          <X size={13} strokeWidth={3} />
        </span>
        {copy.status.fail}
      </p>
    </div>
  );
}

export default function Landing({ onStart, onSample, onTwin }: LandingProps) {
  const { hero, clauses, how, model, twin, limits } = copy.home;

  return (
    <main className="hm">
      <section className="hm-hero" aria-labelledby="hm-hero-title">
        <div className="page hm-hero__grid">
          <div className="hm-hero__text">
            <h1 id="hm-hero-title" className="hm-hero__title">
              {hero.title}
            </h1>
            <p className="hm-hero__lede">
              <Latin text={hero.lede} />
            </p>

            <button type="button" className="btn btn--accent btn--large hm-hero__cta" onClick={onStart}>
              <Upload size={20} strokeWidth={2} aria-hidden="true" />
              <span>
                <Latin text={LOCAL.cta} />
              </span>
            </button>

            <div className="hm-samples" role="group" aria-labelledby="hm-samples-lead">
              <p id="hm-samples-lead" className="hm-samples__lead">
                {LOCAL.samplesLead}
              </p>
              <ul className="hm-samples__list">
                {SAMPLE_FILES.map((sample) => (
                  <li key={sample.id}>
                    <button type="button" className="hm-chip" onClick={() => onSample(sample.id)}>
                      <span className="hm-chip__label">
                        <Latin text={sample.label} />
                      </span>
                      <span className="hm-chip__note">
                        <Latin text={sample.note} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <figure className="hm-figure hm-hero__figure">
            <div className="hm-hero__frame">
              <div className="hm-render">
                <img
                  className="hm-render__img"
                  src={heroUrl}
                  alt={LOCAL.heroAlt}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </div>
              <Measurement />
            </div>
            <figcaption className="hm-caption">
              {LOCAL.heroCaption}: <bdi dir="ltr">{HERO_SAMPLE.fileName}</bdi>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="home-clauses" tabIndex={-1} className="hm-section" aria-labelledby="hm-clauses-title">
        <div className="page">
          <header className="hm-head">
            <h2 id="hm-clauses-title" className="hm-h2">
              {clauses.title}
            </h2>
            <p className="hm-lede">{clauses.lede}</p>
          </header>

          <div className="hm-clauses__grid">
            <div className="hm-clauses__col">
              <h3 className="hm-h3">
                {clauses.measuredTitle} <span className="count">({MEASURED.length})</span>
              </h3>
              <ClauseList rows={MEASURED} />
            </div>
            <div className="hm-clauses__col">
              <h3 className="hm-h3">
                {clauses.unknownTitle} <span className="count">({NOT_IN_FILE.length})</span>
              </h3>
              <ClauseList rows={NOT_IN_FILE} />
              <p className="hm-note">{clauses.unknownNote}</p>
            </div>
          </div>

          <p className="hm-ref">
            <a className="link" href={RESTAURANT_REQUIREMENTS_SOURCE.pageUrl} target="_blank" rel="noreferrer">
              {copy.site.footer.referenceLink}
              <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">{LOCAL.newTab}</span>
            </a>
            <span>{copy.site.footer.referenceNote}</span>
          </p>
        </div>
      </section>

      <section id="home-how" tabIndex={-1} className="hm-section hm-how" aria-labelledby="hm-how-title">
        <div className="page">
          <h2 id="hm-how-title" className="hm-h2">
            {how.title}
          </h2>
          <ol className="hm-steps">
            {how.steps.map((step, index) => (
              <li key={step.title} className="hm-step">
                <span className="hm-step__no num" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className="hm-step__title">{step.title}</h3>
                  <p className="hm-step__body">
                    <Latin text={step.body} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="home-model" tabIndex={-1} className="hm-section" aria-labelledby="hm-model-title">
        <div className="page hm-model">
          <div className="hm-model__text">
            <h2 id="hm-model-title" className="hm-h2">
              {model.title}
            </h2>
            <p className="hm-lede">
              <Latin text={model.lede} />
            </p>
            <h3 className="hm-h4">{model.networks}</h3>
            <ul className="hm-networks">
              {LOCAL.networks.map((network) => (
                <li key={network.name}>
                  <span className="hm-networks__dot" style={{ backgroundColor: network.color }} aria-hidden="true" />
                  {network.name}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--primary hm-model__cta" onClick={() => onSample("tiles")}>
              {LOCAL.modelCta}
            </button>
          </div>
          <figure className="hm-figure hm-model__figure">
            <div className="hm-render">
              <img
                className="hm-render__img"
                src={networksUrl}
                alt={LOCAL.modelAlt}
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className="hm-caption">{model.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section id="home-twin" tabIndex={-1} className="hm-section" aria-labelledby="hm-twin-title">
        <div className="page hm-split">
          <h2 id="hm-twin-title" className="hm-h2">
            {twin.title}
          </h2>
          <div>
            <p className="hm-body">{twin.lede}</p>
            <p className="hm-note">{twin.note}</p>
            <button type="button" className="btn btn--secondary hm-twin__cta" onClick={onTwin}>
              {twin.cta}
            </button>
          </div>
        </div>
      </section>

      <section className="hm-section" aria-labelledby="hm-limits-title">
        <div className="page hm-split">
          <h2 id="hm-limits-title" className="hm-h2">
            {limits.title}
          </h2>
          <ul className="hm-limits">
            {limits.items.map((item) => (
              <li key={item}>
                <Latin text={item} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
