import { copy } from "../content/copy";
import { SAMPLE_FILES } from "../content/samples";
import type { NavTarget } from "./SiteHeader";
import "./site.css";

const REQUIREMENTS_URL = "https://momah.gov.sa/ar/node/14955";

/** Light, formal footer: identity and scope, the service links, the reference, the sample files. */
export function SiteFooter({ onNavigate }: { onNavigate: (target: NavTarget) => void }) {
  const go = (target: NavTarget) => (event: React.MouseEvent) => {
    event.preventDefault();
    onNavigate(target);
  };
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="page site-footer__grid">
        <section className="site-footer__about" aria-labelledby="ft-about">
          <h2 id="ft-about" className="site-footer__brand">
            {copy.brand.name}
          </h2>
          <p>{copy.site.footer.about}</p>
        </section>

        <nav className="site-footer__col" aria-labelledby="ft-service">
          <h2 id="ft-service">{copy.site.footer.serviceTitle}</h2>
          <ul>
            <li>
              <a href="#/check" onClick={go("check")}>
                {copy.site.nav.cta}
              </a>
            </li>
            <li>
              <a href="#/" onClick={go("how")}>
                {copy.site.nav.how}
              </a>
            </li>
            <li>
              <a href="#/" onClick={go("model")}>
                {copy.site.nav.model}
              </a>
            </li>
            <li>
              <a href="#/twin" onClick={go("twin")}>
                {copy.site.nav.twin}
              </a>
            </li>
          </ul>
        </nav>

        <section className="site-footer__col" aria-labelledby="ft-ref">
          <h2 id="ft-ref">{copy.site.footer.referenceTitle}</h2>
          <ul>
            <li>
              <a href={REQUIREMENTS_URL} target="_blank" rel="noreferrer">
                {copy.site.footer.referenceLink}
              </a>
            </li>
            <li className="site-footer__note">{copy.site.footer.referenceNote}</li>
          </ul>
        </section>

        <section className="site-footer__col" aria-labelledby="ft-files">
          <h2 id="ft-files">{copy.site.footer.filesTitle}</h2>
          <ul>
            {SAMPLE_FILES.map((sample) => (
              <li key={sample.id}>
                <a href={sample.url} download={sample.fileName}>
                  {sample.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="page site-footer__bottom">
        <p>
          © <span className="num">{year}</span> {copy.brand.name}
        </p>
        <p>{copy.site.footer.legal}</p>
      </div>
    </footer>
  );
}
