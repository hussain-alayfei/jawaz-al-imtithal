import planDeskUrl from "../../assets/site/plan-desk.webp";
import laptopModelUrl from "../../assets/site/laptop-model.webp";
import reportDeskUrl from "../../assets/site/report-desk.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { HOME } from "./strings";

const IMAGES = [planDeskUrl, laptopModelUrl, reportDeskUrl];

/** The three stages of a check: three rows, a large picture (about 58% of the row) and its words side by
    side, the picture changing sides each row (in RTL the first row's picture sits on the visual left). */
export function HowRows() {
  const { how } = copy.web;
  return (
    <section id="home-how" tabIndex={-1} className="hm-section hm-how" aria-labelledby="hm-how-title">
      <header className="page hm-head">
        <h2 id="hm-how-title" className="hm-title">
          {how.title}
        </h2>
        <p className="hm-lead">
          <Latin text={how.sub} />
        </p>
      </header>

      <ol className="hm-wide hm-rows" role="list">
        {how.rows.map((row, index) => (
          <li key={row.title} className={`hm-row ${index % 2 === 0 ? "hm-row--media-end" : "hm-row--media-start"}`}>
            <div className="hm-row__media">
              <img
                className="hm-row__img"
                src={IMAGES[index]}
                alt={HOME.howAlts[index]}
                width={1536}
                height={1152}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="hm-row__text">
              <h3 className="hm-row__title">{row.title}</h3>
              <p className="hm-row__body">
                <Latin text={row.body} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
