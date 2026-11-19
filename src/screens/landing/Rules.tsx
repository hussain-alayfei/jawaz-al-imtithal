import type { CSSProperties } from "react";
import { copy } from "../../content/copy";
import { RESTAURANT_REQUIREMENTS_SOURCE } from "../../ifc/standard/requirements";
import { CLAUSE_ROWS } from "./clauses";
import { HOME } from "./strings";

/* The list runs down the first column, then the second (column-first, like an index). */
const ROWS_PER_COLUMN = Math.ceil(CLAUSE_ROWS.length / 2);

/** Every result is tied to a clause: the ministry's clauses, marked by what the file can prove. */
export function Rules() {
  const { rules } = copy.web;
  return (
    <section id="home-clauses" tabIndex={-1} className="hm-section" aria-labelledby="hm-rules-title">
      <div className="page">
        <header className="hm-head">
          <h2 id="hm-rules-title" className="hm-title">
            {rules.title}
          </h2>
          <p className="hm-lead">{rules.body}</p>
          <a
            className="link link--more hm-head__link"
            href={RESTAURANT_REQUIREMENTS_SOURCE.pageUrl}
            target="_blank"
            rel="noreferrer"
          >
            {rules.link}
            <span className="sr-only">{HOME.newTab}</span>
          </a>
        </header>

        <ul className="hm-clauses" role="list" style={{ "--hm-rows": ROWS_PER_COLUMN } as CSSProperties}>
          {CLAUSE_ROWS.map((row) => (
            <li key={row.id} className="hm-clause">
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

        <p className="hm-legend" aria-hidden="true">
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
