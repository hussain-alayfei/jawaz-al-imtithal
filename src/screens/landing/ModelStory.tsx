import { useEffect, useRef, useState, type CSSProperties } from "react";
import story1Url from "../../assets/site/story-1.webp";
import story2Url from "../../assets/site/story-2.webp";
import story3Url from "../../assets/site/story-3.webp";
import story4Url from "../../assets/site/story-4.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow } from "./follow";
import { HOME } from "./strings";
import { useMediaQuery } from "./useMediaQuery";

/* Real renders of the 3D model built from the sample file, one per step. They are 16:9 (1920×1080 or
   larger) and are re-rendered in place, so the frames crop them with object-fit and assume nothing else. */
const SHOTS: readonly string[] = [story1Url, story2Url, story3Url, story4Url];
const SHOT_WIDTH = 1920;
const SHOT_HEIGHT = 1080;

/** From this width the story runs beside one pinned frame; below it each step shows its own picture. */
const WIDE = "(min-width: 1024px)";

function ShotImage({ index, active }: { index: number; active?: boolean }) {
  return (
    <img
      className="hm-shot"
      data-active={active || undefined}
      aria-hidden={active === false ? true : undefined}
      src={SHOTS[index]}
      alt={HOME.modelAlts[index]}
      width={SHOT_WIDTH}
      height={SHOT_HEIGHT}
      loading="lazy"
      decoding="async"
    />
  );
}

/** How the check works, in four steps through the model, told with scroll: on wide screens a large pinned
    frame cross-fades between the renders while the steps pass beside it, and a thin rail under the frame
    names the four steps and fills as the reading moves on. On smaller screens each step shows its own
    picture, edge to edge, above its words. */
export function ModelStory({ onStart }: { onStart: () => void }) {
  const { model } = copy.web;
  const wide = useMediaQuery(WIDE);
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  const rail = useRef<HTMLDivElement>(null);
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

  /* The rail follows the reading: a step's segment fills while that step crosses the middle of the
     viewport, the band where it is the active one. One custom property on the rail drives all four. */
  useEffect(() => {
    const node = rail.current;
    if (!wide || !node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = window.innerHeight / 2;
      let progress = 0;
      steps.current.forEach((step, index) => {
        const box = step?.getBoundingClientRect();
        if (!box || box.height === 0) return;
        if (middle >= box.bottom) progress = index + 1;
        else if (middle >= box.top) progress = index + (middle - box.top) / box.height;
      });
      node.style.setProperty("--hm-progress", progress.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
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
                {SHOTS.map((_, index) => (
                  <ShotImage key={index} index={index} active={index === active} />
                ))}
              </div>
              {/* The step titles above are the accessible controls; the rail repeats them for the eye and
                  the pointer only. */}
              <div ref={rail} className="hm-rail" aria-hidden="true">
                {model.steps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    tabIndex={-1}
                    className="hm-rail__item"
                    data-active={index === active || undefined}
                    style={{ "--hm-i": index } as CSSProperties}
                    onClick={() => choose(index)}
                  >
                    <span className="hm-rail__track">
                      <span className="hm-rail__fill" />
                    </span>
                    <span className="hm-rail__label">{step.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="page hm-model__foot">
        <p className="hm-caption">{HOME.modelCaption}</p>
        <a href="#/check" className="btn btn--primary btn--large" onClick={follow(onStart)}>
          {model.cta}
        </a>
      </div>
    </section>
  );
}
