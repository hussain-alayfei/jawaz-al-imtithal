import planDeskUrl from "../../assets/site/plan-desk.webp";
import laptopModelUrl from "../../assets/site/laptop-model.webp";
import reportDeskUrl from "../../assets/site/report-desk.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { SIZES, srcSetOf } from "./images";
import { HOME } from "./strings";
import { SectionHead } from "./SectionHead";
import { reveal, twoDigits } from "./motion";

/* 1536×1152 originals, with smaller copies for srcset. */
const IMAGES = [
  { src: planDeskUrl, srcSet: srcSetOf("plan-desk", planDeskUrl, 1536) },
  { src: laptopModelUrl, srcSet: srcSetOf("laptop-model", laptopModelUrl, 1536) },
  { src: reportDeskUrl, srcSet: srcSetOf("report-desk", reportDeskUrl, 1536) },
];

/** The three stages of a check: three rows, a large picture (about 58% of the row) and its words side by
    side, the picture changing sides each row (in RTL the first row's picture sits on the visual left).
    Each picture is wiped open as it arrives; the words rise in after it: the stage's number on a thin
    rule, a light headline, one sentence. */
export function HowRows() {
  const { how, labels } = copy.web;
  return (
    <section id="home-how" tabIndex={-1} className="hm-section hm-how" aria-labelledby="hm-how-title">
      <div className="hm-wide">
        <SectionHead n={2} label={labels.how} id="hm-how-title" title={how.title} lead={<Latin text={how.sub} />} />
      </div>

      <ol className="hm-wide hm-rows" role="list">
        {how.rows.map((row, index) => (
          <li key={row.title} className={`hm-row ${index % 2 === 0 ? "hm-row--media-end" : "hm-row--media-start"}`}>
            <div className="hm-row__media hm-frame" {...reveal("media")}>
              <img
                className="hm-row__img"
                src={IMAGES[index].src}
                srcSet={IMAGES[index].srcSet}
                sizes={SIZES.rows}
                alt={HOME.howAlts[index]}
                width={1536}
                height={1152}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="hm-row__text">
              <p className="hm-row__no num" {...reveal("rule", 2)}>
                <span>{twoDigits(index + 1)}</span>
                <span className="hm-row__rule" aria-hidden="true" />
              </p>
              <h3 className="hm-row__title" {...reveal("up", 3)}>
                {row.title}
              </h3>
              <p className="hm-row__body" {...reveal("up", 4)}>
                <Latin text={row.body} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
