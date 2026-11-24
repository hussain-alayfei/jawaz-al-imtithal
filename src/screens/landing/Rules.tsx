import type { CSSProperties } from "react";
import { copy } from "../../content/copy";
import { RESTAURANT_REQUIREMENTS_SOURCE } from "../../ifc/standard/requirements";
import { CLAUSE_ROWS } from "./clauses";
import { HOME } from "./strings";
import { SectionHead } from "./SectionHead";
import { STAGGER_MS } from "./motion";

/* The list runs down the first column, then the second (column-first, like an index). */
const ROWS_PER_COLUMN = Math.ceil(CLAUSE_ROWS.length / 2);

/** Every result is tied to a clause: the ministry's clauses, marked by what the file can prove. A calm
    index between thin rules; its rows rise in one after another, down each column. */
export function Rules() {
  const { rules, labels } = copy.web;
  return (
    <section id="home-clauses" tabIndex={-1} className="hm-section hm-rules" aria-labelledby="hm-rules-title">
      <div className="hm-wide">
        <SectionHead n={4} label={labels.rules} id="hm-rules-title" title={rules.title} lead={rules.body}>
          <a
            className="link link--more link-draw hm-head__link"
            href={RESTAURANT_REQUIREMENTS_SOURCE.pageUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span>{rules.link}</span>
            <span className="sr-only">{HOME.newTab}</span>
          </a>
        </SectionHead>

        <ul className="hm-clauses" role="list" style={{ "--hm-rows": ROWS_PER_COLUMN } as CSSProperties}>
          {CLAUSE_ROWS.map((row, index) => (
            <li
              key={row.id}
              className="hm-clause"
              data-reveal="up"
              style={{ "--hm-d": `${(index % ROWS_PER_COLUMN) * (STAGGER_MS / 2)}ms` } as CSSProperties}
            >
              <span className="hm-clause__no num">
                <span className={`hm-mark hm-mark--${row.measured ? "measured" : "open"}`} aria-hidden="true" />
                <bdi dir="ltr">{row.number}</bdi>
              </span>
              <span className="hm-clause__subject">
                {row.subject}
                <span className="sr-only">، {row.measured ? HOME.measured : HOME.notProvable}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="hm-legend" aria-hidden="true" data-reveal="fade">
          <span className="hm-legend__item">
            <span className="hm-mark hm-mark--measured" />
            {HOME.measured}
          </span>
          <span className="hm-legend__item">
            <span className="hm-mark hm-mark--open" />
            {HOME.notProvable}
          </span>
        </p>
      </div>
    </section>
  );
}
