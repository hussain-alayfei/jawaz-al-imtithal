import { Fragment, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import heroUrl from "../assets/model-hero.webp";
import networksUrl from "../assets/model-networks.webp";
import { Button } from "../brand/ui";
import { copy } from "../content/copy";
import { RESTAURANT_REQUIREMENTS, RESTAURANT_REQUIREMENTS_SOURCE } from "../ifc/standard/requirements";
import type { LandingProps } from "./types";
import "./landing.css";

/* Strings this page needs that copy.ts does not have. */
const LOCAL = {
  heroAlt: "مشهد ثلاثي الأبعاد لمخطط المطعم التجريبي",
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

/* Latin runs (IFC, IFC2X3, GUID) keep their own direction inside Arabic sentences. Dots and hyphens
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

/** A real render of the sample model in a calm 16:10 frame; the render is cropped only at its edges. */
function Render({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="hm-render">
      <img
        className="hm-render__img"
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </div>
  );
}

export default function Landing({ onStart, onSample, onTwin }: LandingProps) {
  const { hero, clauses, how, model, twin, limits } = copy.home;

  return (
    <main className="hm">
      <section className="hm-hero fade-in" aria-labelledby="hm-hero-title">
        <div className="page hm-hero__grid">
          <div className="hm-hero__text">
            <h1 id="hm-hero-title" className="hm-hero__title">
              {hero.title}
            </h1>
            <p className="hm-hero__lede">
              <Latin text={hero.lede} />
            </p>
            <div className="hm-hero__actions">
              <Button onClick={onStart}>{hero.cta}</Button>
              <button type="button" className="link" onClick={() => onSample("tiles")}>
                {hero.secondary}
              </button>
            </div>
          </div>
          <figure className="hm-figure hm-hero__figure">
            <Render src={heroUrl} alt={LOCAL.heroAlt} priority />
            <figcaption className="hm-caption">
              <Latin text={hero.imageCaption} />
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="home-clauses"
        tabIndex={-1}
        className="hm-section hm-clauses fade-in"
        aria-labelledby="hm-clauses-title"
      >
        <div className="page">
          <header className="hm-head">
            <h2 id="hm-clauses-title" className="hm-h2">
              {clauses.title}
            </h2>
            <p className="hm-lede">{clauses.lede}</p>
          </header>

          <div className="hm-clauses__grid">
            <div className="hm-clauses__col">
              <h3 className="hm-h3">{clauses.measuredTitle}</h3>
              <ClauseList rows={MEASURED} />
            </div>
            <div className="hm-clauses__col">
              <h3 className="hm-h3">{clauses.unknownTitle}</h3>
              <ClauseList rows={NOT_IN_FILE} />
              <p className="hm-note">{clauses.unknownNote}</p>
            </div>
          </div>

          <p className="hm-ref">
            <a className="link" href={RESTAURANT_REQUIREMENTS_SOURCE.pageUrl} target="_blank" rel="noreferrer">
              {copy.site.footer.referenceLink}
              <ExternalLink size={16} strokeWidth={1.6} aria-hidden="true" />
              <span className="sr-only">{LOCAL.newTab}</span>
            </a>
            <span className="hm-ref__note">{copy.site.footer.referenceNote}</span>
          </p>
        </div>
      </section>

      <section id="home-how" tabIndex={-1} className="hm-section hm-how fade-in" aria-labelledby="hm-how-title">
        <div className="page">
          <h2 id="hm-how-title" className="hm-h2">
            {how.title}
          </h2>
          <ol className="hm-steps">
            {how.steps.map((step, index) => (
              <li key={step.title} className="hm-step">
                <span className="hm-step__no num">{index + 1}</span>
                <h3 className="hm-step__title">{step.title}</h3>
                <p className="hm-step__body">
                  <Latin text={step.body} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="home-model"
        tabIndex={-1}
        className="hm-section hm-model fade-in"
        aria-labelledby="hm-model-title"
      >
        <div className="page">
          <header className="hm-head hm-head--action">
            <div className="hm-head__text">
              <h2 id="hm-model-title" className="hm-h2">
                {model.title}
              </h2>
              <p className="hm-lede">
                <Latin text={model.lede} />
              </p>
            </div>
            <Button className="hm-head__cta" onClick={() => onSample("tiles")}>
              {model.cta}
            </Button>
          </header>

          <figure className="hm-figure hm-model__figure">
            <Render src={networksUrl} alt={LOCAL.modelAlt} />
            <figcaption className="hm-model__legend">
              <h3 className="hm-h4">{model.networks}</h3>
              <ul className="hm-networks">
                {LOCAL.networks.map((network) => (
                  <li key={network.name}>
                    <span className="hm-networks__dot" style={{ backgroundColor: network.color }} aria-hidden="true" />
                    {network.name}
                  </li>
                ))}
              </ul>
              <p className="hm-caption">{model.caption}</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="home-twin" tabIndex={-1} className="hm-section hm-twin fade-in" aria-labelledby="hm-twin-title">
        <div className="page hm-split">
          <h2 id="hm-twin-title" className="hm-h2">
            {twin.title}
          </h2>
          <div className="hm-twin__body">
            <p className="hm-lede">{twin.lede}</p>
            <p className="hm-note">{twin.note}</p>
            <Button variant="secondary" className="hm-twin__cta" onClick={onTwin}>
              {twin.cta}
            </Button>
          </div>
        </div>
      </section>

      <section className="hm-section hm-limits fade-in" aria-labelledby="hm-limits-title">
        <div className="page hm-split">
          <h2 id="hm-limits-title" className="hm-h2">
            {limits.title}
          </h2>
          <ul className="hm-limits__list">
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
