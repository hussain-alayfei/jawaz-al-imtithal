import { ChevronDown } from "../../brand/icons";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";

/** Common questions, answered in a sentence or two each. Native disclosure widgets: keyboard and screen
    readers work without script, and every answer is in the page for search. */
export function Faq() {
  const { faq } = copy.web;
  return (
    <section id="home-faq" tabIndex={-1} className="hm-section hm-faq" aria-labelledby="hm-faq-title">
      <div className="page hm-faq__inner">
        <header className="hm-head">
          <h2 id="hm-faq-title" className="hm-title">
            {faq.title}
          </h2>
        </header>
        <div className="hm-faq__list">
          {faq.items.map((item) => (
            <details key={item.q} className="hm-faq__item">
              <summary className="hm-faq__q">
                <span>
                  <Latin text={item.q} />
                </span>
                <ChevronDown className="hm-faq__chevron" size={20} />
              </summary>
              <p className="hm-faq__a">
                <Latin text={item.a} />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
