import { useEffect, useLayoutEffect, useRef, useState } from "react";
import heroUrl from "../../assets/site/hero.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow, goToSection } from "./follow";

/** The opening photograph, edge to edge: the restaurant stands low in the frame and the evening sky above
    it carries the headline, one sentence and two actions in white. The sky's own colour sits behind the
    photo (and continues it upward where the screen is narrower than the photo), so the words are readable
    before the file arrives; the photo then fades in and settles, never over an empty frame. */
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

  /* Where the words end, for the stylesheet: the photo is set low enough that the palms start below the
     actions, whatever the words' wrapping and the font do. Without it the photo keeps its default place. */
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
            className="link link--more hm-hero__link"
            onClick={follow(() => goToSection("home-model", "#/model"))}
          >
            {hero.link}
          </a>
        </div>
      </div>
    </section>
  );
}
