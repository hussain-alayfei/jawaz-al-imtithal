import { useEffect, useRef, useState } from "react";
import heroUrl from "../../assets/site/hero.webp";
import { copy } from "../../content/copy";
import { Latin } from "./Latin";
import { follow } from "./follow";

/** Headline, one sentence, two actions, then the big picture. The picture waits for its file, so its
    entrance never plays over an empty frame. */
export function Hero({ onStart, onSample }: { onStart: () => void; onSample: () => void }) {
  const { hero } = copy.web;
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (imageRef.current?.complete) setReady(true);
    /* A slow network never keeps the picture hidden. */
    const timeout = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="hm-hero" aria-labelledby="hm-hero-title">
      <div className="hm-hero__head">
        <h1 id="hm-hero-title" className="hm-hero__title">
          {hero.title}
        </h1>
        <p className="hm-hero__sub">
          <Latin text={hero.sub} />
        </p>
        <div className="hm-hero__actions">
          <a href="#/check" className="btn btn--primary btn--large" onClick={follow(onStart)}>
            {hero.cta}
          </a>
          <a href="#/check?sample=tiles" className="link link--more" onClick={follow(onSample)}>
            {hero.link}
          </a>
        </div>
      </div>

      <div className="hm-hero__media">
        <div className="hm-hero__frame" data-ready={ready || undefined}>
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
      </div>
    </section>
  );
}
