import { Fragment, useRef, type CSSProperties } from "react";
import { copy } from "../../content/copy";
import { SectionLabel } from "./SectionHead";
import { motionAllowed, useScrollFrame } from "./motion";

const WORDS = copy.web.intro.text.split(/\s+/);
const LATIN = /[A-Za-z]/;

/** The statement after the hero: one large light paragraph on what the service does. As the visitor
    scrolls through it, its words brighten one after another, from about a fifth of their strength to
    full (one custom property, --hm-read, the number of words lit; landing.css turns it into each word's
    opacity). Without motion the paragraph is simply there at full strength. */
export function Intro() {
  const textRef = useRef<HTMLParagraphElement>(null);
  const active = motionAllowed();

  useScrollFrame(() => {
    const text = textRef.current;
    if (!text) return;
    const box = text.getBoundingClientRect();
    const view = window.innerHeight;
    /* 0 when the paragraph's top reaches 85% of the screen, 1 when its bottom reaches 45%. */
    const start = view * 0.85;
    const end = view * 0.45;
    const progress = Math.min(1, Math.max(0, (start - box.top) / (box.height + start - end)));
    text.style.setProperty("--hm-read", (progress * (WORDS.length + 1)).toFixed(2));
  }, active);

  return (
    <section id="home-intro" className="hm-section hm-intro" aria-label={copy.web.labels.intro}>
      <div className="hm-wide hm-intro__grid">
        <div className="hm-intro__label">
          <SectionLabel n={1} text={copy.web.labels.intro} />
        </div>
        <p ref={textRef} className="hm-intro__text" data-read={active || undefined}>
          {WORDS.map((word, index) => (
            <Fragment key={index}>
              {index > 0 && " "}
              <span className="hm-word" style={{ "--i": index } as CSSProperties}>
                {LATIN.test(word) ? <bdi dir="ltr">{word}</bdi> : word}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
