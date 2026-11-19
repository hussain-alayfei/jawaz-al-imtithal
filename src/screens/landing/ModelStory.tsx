import { useEffect, useRef, useState } from "react";
import modelHeroUrl from "../../assets/model-hero.webp";
import modelNetworksUrl from "../../assets/model-networks.webp";
import modelSectionUrl from "../../assets/site/model-section.webp";
import modelViolationUrl from "../../assets/site/model-violation.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow } from "./follow";
import { HOME } from "./strings";
import { useMediaQuery } from "./useMediaQuery";

interface Shot {
  src: string;
  width: number;
  height: number;
  /** The section render ends in a thin black band; the frame crops it off. */
  trim?: boolean;
}

/* Real renders of the 3D model built from the sample file, one per step. */
const SHOTS: readonly Shot[] = [
  { src: modelHeroUrl, width: 2400, height: 1350 },
  { src: modelSectionUrl, width: 1920, height: 1080 },
  { src: modelViolationUrl, width: 1920, height: 1080 },
  { src: modelNetworksUrl, width: 2400, height: 1350 },
];

/** From this width the story runs beside one pinned frame; below it each step shows its own picture. */
const WIDE = "(min-width: 1024px)";

function ShotImage({ index, active }: { index: number; active?: boolean }) {
  const shot = SHOTS[index];
  return (
    <img
      className={`hm-shot${shot.trim ? " hm-shot--trim" : ""}`}
      data-active={active || undefined}
      aria-hidden={active === false ? true : undefined}
      src={shot.src}
      alt={HOME.modelAlts[index]}
      width={shot.width}
      height={shot.height}
      loading="lazy"
      decoding="async"
    />
  );
}

/** The result on your plan: four steps through the model, told with scroll. */
export function ModelStory({ onSample }: { onSample: () => void }) {
  const { model } = copy.web;
  const wide = useMediaQuery(WIDE);
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  /* While a chosen step scrolls into view, the steps it passes do not take over. */
  const settling = useRef(false);
  const stopSettling = useRef<() => void>(() => {});

  /** The step that crosses the middle of the viewport. */
  const syncWithScroll = () => {
    const middle = window.innerHeight / 2;
    steps.current.forEach((step, index) => {
      const box = step?.getBoundingClientRect();
      if (box && box.top <= middle && box.bottom >= middle) setActive(index);
    });
  };

  useEffect(() => {
    if (!wide || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (settling.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const step of steps.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, [wide]);

  useEffect(() => () => stopSettling.current(), []);

  const choose = (index: number) => {
    const step = steps.current[index];
    setActive(index);
    if (!step) return;
    stopSettling.current();
    settling.current = true;
    const done = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("scrollend", done);
      settling.current = false;
      stopSettling.current = () => {};
      syncWithScroll();
    };
    const timeout = window.setTimeout(done, 1200);
    window.addEventListener("scrollend", done);
    stopSettling.current = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("scrollend", done);
      settling.current = false;
    };
    step.scrollIntoView({ block: "center" });
  };

  return (
    <section id="home-model" tabIndex={-1} className="hm-section hm-model" aria-labelledby="hm-model-title">
      <header className="page hm-head">
        <h2 id="hm-model-title" className="hm-title">
          {model.title}
        </h2>
        <p className="hm-lead">{model.sub}</p>
      </header>

      <div className={`hm-story${wide ? " hm-story--pinned" : ""}`}>
        <ol className="hm-story__steps" role="list">
          {model.steps.map((step, index) => (
            <li
              key={step.title}
              ref={(node) => {
                steps.current[index] = node;
              }}
              data-step={index}
              data-active={(wide && index === active) || undefined}
              className="hm-step"
            >
              {!wide && (
                <div className="hm-step__media">
                  <ShotImage index={index} />
                </div>
              )}
              <div className="hm-step__text">
                <h3 className="hm-step__title">
                  {wide ? (
                    <button
                      type="button"
                      className="hm-step__pick"
                      aria-current={index === active ? "step" : undefined}
                      onClick={() => choose(index)}
                    >
                      {step.title}
                    </button>
                  ) : (
                    step.title
                  )}
                </h3>
                <p className="hm-step__body">
                  <Latin text={step.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>

        {wide && (
          <div className="hm-story__media">
            <div className="hm-story__pin">
              <div className="hm-story__frame">
                {SHOTS.map((shot, index) => (
                  <ShotImage key={shot.src} index={index} active={index === active} />
                ))}
              </div>
              <div className="hm-story__dots" aria-hidden="true">
                {SHOTS.map((shot, index) => (
                  <span key={shot.src} className="hm-story__dot" data-active={index === active || undefined} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="page hm-model__foot">
        <p className="hm-caption">{HOME.modelCaption}</p>
        <a href="#/check?sample=tiles" className="btn btn--primary" onClick={follow(onSample)}>
          {model.cta}
        </a>
      </div>
    </section>
  );
}
