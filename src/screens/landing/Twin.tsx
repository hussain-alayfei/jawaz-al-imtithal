import twinUrl from "../../assets/site/twin.webp";
import { copy } from "../../content/copy";
import { follow } from "./follow";
import { SIZES, srcSetOf } from "./images";
import { reveal } from "./motion";
import { SectionLabel } from "./SectionHead";
import { HOME } from "./strings";

const TWIN_SRCSET = srcSetOf("twin", twinUrl, 1600);

/** The digital twin studio: a full-width deep-green section, a large picture on the visual right (the start side) wiped
    open as it arrives, and the words beside it in white with a text link to the studio. The picture is
    the studio's own 3D scene, captured with its panels hidden. */
export function Twin({ onTwin }: { onTwin: () => void }) {
  const { twin, labels } = copy.web;
  return (
    <section id="home-twin" className="hm-section hm-twin on-dark" aria-labelledby="hm-twin-title">
      <div className="hm-wide">
        <div className="hm-row hm-row--media-start hm-row--feature">
          <div className="hm-row__media hm-frame" {...reveal("media")}>
            <img
              className="hm-row__img hm-row__img--wide"
              src={twinUrl}
              srcSet={TWIN_SRCSET}
              sizes={SIZES.twin}
              alt={HOME.twinAlt}
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="hm-row__text">
            <SectionLabel n={6} text={labels.twin} />
            <h2 id="hm-twin-title" className="hm-row__heading" {...reveal("up", 1)}>
              {twin.title}
            </h2>
            <p className="hm-row__body" {...reveal("up", 2)}>
              {twin.body}
            </p>
            <div {...reveal("up", 3)}>
              <a href="#/twin" className="link link--more link-draw hm-row__link" onClick={follow(onTwin)}>
                <span>{twin.link}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
