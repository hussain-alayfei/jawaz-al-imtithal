import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { reveal } from "./motion";
import { SectionHead } from "./SectionHead";

/** Common questions, answered in a sentence or two each: the head on the start side, the questions beside
    it between thin rules, each with a thin plus that turns into a minus; an answer opens slowly (height
    and opacity, where the browser can animate a disclosure; landing.css). Native disclosure widgets:
    keyboard and screen readers work without script, and every answer is in the page for search. */
export function Faq() {
  const { faq, labels } = copy.web;
  return (
    <section id="home-faq" tabIndex={-1} className="hm-section hm-faq" aria-labelledby="hm-faq-title">
      <div className="hm-wide hm-faq__grid">
        <SectionHead n={7} label={labels.faq} id="hm-faq-title" title={faq.title} className="hm-faq__head" />
        <div className="hm-faq__list">
          {faq.items.map((item, index) => (
            <details key={item.q} className="hm-faq__item" {...reveal("up", index * 0.6)}>
              <summary className="hm-faq__q">
                <span>
                  <Latin text={item.q} />
                </span>
                <span className="hm-faq__sign" aria-hidden="true" />
              </summary>
              <div className="hm-faq__a">
                <p>
                  <Latin text={item.a} />
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
