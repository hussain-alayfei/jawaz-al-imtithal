import { useEffect, useLayoutEffect, useRef, useState } from "react";
import heroUrl from "../../assets/site/hero.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow, goToSection } from "./follow";

/** The opening photograph, edge to edge: the whole building stands low in the frame and the evening sky
    above it carries the headline, one line and two actions in white. The sky's own colour sits behind the
    photo (and continues it upward where the screen is narrower than the photo), so the words are readable
    before the file arrives; the photo then fades in and settles. Scrolling out of the hero, the words lift
    and fade, the photo drifts and grows a little, and the lower corners round off (--hp, 0 to 1). */
export function Hero({ onStart }: { onStart: () => void }) {
  const { hero } = copy.web;
  const heroRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (imageRef.current?.complete) setReady(true);
    /* A slow network never keeps the picture hidden. */
    const timeout = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(timeout);
  }, []);

  /* How far the page has scrolled past the hero, 0 to 1, for the stylesheet's exit motion. */
  useEffect(() => {
    const section = heroRef.current;
    if (!section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = "";
    const update = () => {
      frame = 0;
      const height = section.offsetHeight || 1;
      const progress = reduce.matches ? 0 : Math.min(1, Math.max(0, window.scrollY / height));
      const value = progress.toFixed(4);
      if (value !== last) {
        last = value;
        section.style.setProperty("--hp", value);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduce.addEventListener?.("change", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduce.removeEventListener?.("change", schedule);
    };
  }, []);

  /* Where the words end, for the stylesheet: the photo is set low enough that the palms start below the
     actions, whatever the words' wrapping and the font do (never so low that the steps are cut). */
  useLayoutEffect(() => {
    const section = heroRef.current;
    const head = headRef.current;
    if (!section || !head || typeof ResizeObserver === "undefined") return;
    const measure = () => section.style.setProperty("--hm-head-end", `${Math.ceil(head.offsetTop + head.offsetHeight)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={heroRef} className="hm-hero" aria-labelledby="hm-hero-title">
      <div className="hm-hero__media" data-ready={ready || undefined}>
        <img
          ref={imageRef}
          className="hm-hero__img"
          src={heroUrl}
          alt={hero.imageAlt}
          width={2400}
          height={1200}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
      </div>

      <div ref={headRef} className="hm-hero__head on-dark">
        <h1 id="hm-hero-title" className="hm-hero__title">
          {hero.title}
        </h1>
        <p className="hm-hero__sub">
          <Latin text={hero.sub} />
        </p>
        <div className="hm-hero__actions">
          <a href="#/check" className="btn btn--large hm-hero__cta" onClick={follow(onStart)}>
            {hero.cta}
          </a>
          <a
            href="#/model"
            className="btn btn--large hm-hero__ghost"
            onClick={follow(() => goToSection("home-model", "#/model"))}
          >
            {hero.link}
          </a>
        </div>
      </div>
    </section>
  );
}
