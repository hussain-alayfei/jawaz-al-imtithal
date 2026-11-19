import { useEffect, useId, useRef, useState } from "react";
import { Wordmark } from "../brand/ui";
import { copy } from "../content/copy";
import "./site.css";

export type NavTarget = "home" | "how" | "clauses" | "model" | "twin" | "check";

export interface SiteHeaderProps {
  /** The link that matches the current page, for aria-current. */
  current?: NavTarget;
  onNavigate: (target: NavTarget) => void;
}

const LINKS: { target: NavTarget; label: string; href: string }[] = [
  { target: "check", label: copy.web.nav.check, href: "#/check" },
  { target: "model", label: copy.web.nav.model, href: "#/model" },
  { target: "clauses", label: copy.web.nav.rules, href: "#/clauses" },
  { target: "twin", label: copy.web.nav.twin, href: "#/twin" },
];

/** Slim translucent global navigation (Apple-style): wordmark, four links, one small action. */
export function SiteHeader({ current, onNavigate }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sheetId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (target: NavTarget) => (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(false);
    onNavigate(target);
  };

  return (
    <header className={`gn${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="gn__inner">
        <Wordmark className="gn__brand" onClick={() => { setOpen(false); onNavigate("home"); }} />

        <nav className="gn__nav" aria-label={copy.web.nav.label}>
          <ul>
            {LINKS.map((link) => (
              <li key={link.target}>
                <a
                  href={link.href}
                  className="gn__link"
                  aria-current={current === link.target ? "page" : undefined}
                  onClick={go(link.target)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="#/check" className="btn btn--primary btn--small gn__cta" onClick={go("check")}>
          {copy.web.nav.cta}
        </a>

        <button
          ref={toggleRef}
          type="button"
          className="gn__menu"
          aria-expanded={open}
          aria-controls={sheetId}
          aria-label={open ? copy.web.nav.close : copy.web.nav.open}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <div id={sheetId} className="gn__sheet" hidden={!open}>
        <ul>
          {LINKS.map((link) => (
            <li key={link.target}>
              <a href={link.href} className="gn__sheet-link" onClick={go(link.target)}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <a href="#/check" className="btn btn--primary btn--large gn__sheet-cta" onClick={go("check")}>
          {copy.web.nav.cta}
        </a>
      </div>
    </header>
  );
}
