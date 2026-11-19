import twinUrl from "../../assets/site/twin.webp";
import { copy } from "../../content/copy";
import { follow } from "./follow";
import { HOME } from "./strings";

/** The digital twin studio: one row, a large picture on the visual right and the words beside it. The
    picture is the studio's own 3D scene, captured with its panels hidden. */
export function Twin({ onTwin }: { onTwin: () => void }) {
  const { twin } = copy.web;
  return (
    <section id="home-twin" className="hm-section hm-twin" aria-labelledby="hm-twin-title">
      <div className="hm-wide">
        <div className="hm-row hm-row--media-start hm-row--feature">
          <div className="hm-row__media">
            <img
              className="hm-row__img hm-row__img--wide"
              src={twinUrl}
              alt={HOME.twinAlt}
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="hm-row__text">
            <h2 id="hm-twin-title" className="hm-row__heading">
              {twin.title}
            </h2>
            <p className="hm-row__body">{twin.body}</p>
            <a href="#/twin" className="link link--more hm-row__link" onClick={follow(onTwin)}>
              {twin.link}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
