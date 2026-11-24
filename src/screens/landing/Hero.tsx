import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import heroUrl from "../../assets/site/hero.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow } from "./follow";
import { SIZES, srcSetOf } from "./images";
import { useScrollFrame } from "./motion";

/** How much slower than the page the photo moves while the hero scrolls away (0 = with the page). */
const PARALLAX = 0.35;

/** The opening: one photograph, the whole screen tall, under a dark shade that deepens towards the
    bottom and the start side, where the words sit: a short label after a thin orange line, the title in
    light weight over two lines, one line under it, and two actions (start a check; the digital twin
    studio, as a text link). On load the photo settles slowly from a slight zoom, the title's lines rise
    from behind a mask one after the other, then the rest fades in (landing.css). While the page scrolls,
    the photo moves slower than the page and the words fade as they leave. The header lies over the
    photo, transparent with white words, until the page scrolls (data-hm-overlay on the root, site.css). */
export function Hero({ onStart, onTwin }: { onStart: () => void; onTwin: () => void }) {
  const { hero } = copy.web;
  const heroRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (imageRef.current?.complete) setReady(true);
    /* A slow network never keeps the picture hidden. */
    const timeout = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(timeout);
  }, []);

  /* The header lies over the hero while it is on the page. */
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-hm-overlay", "");
    return () => root.removeAttribute("data-hm-overlay");
  }, []);

  useScrollFrame(() => {
    const section = heroRef.current;
    const media = mediaRef.current;
    const content = contentRef.current;
    if (!section || !media || !content) return;
    const height = section.offsetHeight || 1;
    const y = Math.max(0, window.scrollY);
    /* Past the hero nothing shows, so nothing needs writing. */
    if (y > height * 1.2) return;
    const progress = Math.min(1, y / height);
    media.style.transform = `translate3d(0, ${(y * PARALLAX).toFixed(1)}px, 0)`;
    content.style.opacity = Math.max(0, 1 - progress * 1.7).toFixed(3);
    content.style.transform = `translate3d(0, ${(-y * 0.12).toFixed(1)}px, 0)`;
  });

  return (
    <section ref={heroRef} className="hm-hero" aria-labelledby="hm-hero-title">
      <div ref={mediaRef} className="hm-hero__media" data-ready={ready || undefined}>
        <img
          ref={imageRef}
          className="hm-hero__img"
          src={heroUrl}
          srcSet={srcSetOf("hero", heroUrl, 2400)}
          sizes={SIZES.hero}
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
      <div className="hm-hero__shade" aria-hidden="true" />

      <div ref={contentRef} className="hm-hero__content on-dark">
        <div className="hm-hero__inner">
          <p className="hm-hero__label hm-hero__in" style={{ "--hm-d": "300ms" } as CSSProperties}>
            <span className="hm-hero__label-line" aria-hidden="true" />
            {hero.label}
          </p>
          <h1 id="hm-hero-title" className="hm-hero__title">
            {hero.titleLines.map((line, index) => (
              <Fragment key={line}>
                {index > 0 && " "}
                <span className="hm-hero__mask">
                  <span className="hm-hero__line" style={{ "--hm-i": index } as CSSProperties}>
                    {line}
                  </span>
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="hm-hero__sub hm-hero__in" style={{ "--hm-d": "1300ms" } as CSSProperties}>
            <Latin text={hero.sub} />
          </p>
          <div className="hm-hero__actions hm-hero__in" style={{ "--hm-d": "1550ms" } as CSSProperties}>
            <a href="#/check" className="btn btn--primary btn--large hm-hero__cta" onClick={follow(onStart)}>
              {hero.cta}
            </a>
            <a href="#/twin" className="link link--more link-draw hm-hero__twin" onClick={follow(onTwin)}>
              <span>{hero.twin}</span>
            </a>
          </div>
        </div>
      </div>

      <div className="hm-hero__cue" aria-hidden="true">
        <span className="hm-hero__cue-line" />
      </div>
    </section>
  );
}
