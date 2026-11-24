import { useEffect, useId, useRef, useState } from "react";
import { Wordmark } from "../brand/ui";
import { copy } from "../content/copy";
import "./site.css";

export type NavTarget = "home" | "how" | "clauses" | "model" | "faq" | "twin" | "check";

export interface SiteHeaderProps {
  /** The link that matches the current page, for aria-current. */
  current?: NavTarget;
  onNavigate: (target: NavTarget) => void;
}

/* Order: home, the service itself, how it works, what it checks against, then questions. The digital twin
   is a separate studio reached from the hero and the footer, not a page of the service. */
const LINKS: { target: NavTarget; label: string; href: string }[] = [
  { target: "home", label: copy.web.nav.home, href: "#/" },
  { target: "check", label: copy.web.nav.check, href: "#/check" },
  { target: "model", label: copy.web.nav.model, href: "#/model" },
  { target: "clauses", label: copy.web.nav.rules, href: "#/clauses" },
  { target: "faq", label: copy.web.nav.faq, href: "#/faq" },
];

/** Global navigation: the wordmark at the start, then five links. Solid white with a rule underneath; the
    current page carries a green bar. */
export function SiteHeader({ current, onNavigate }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sheetId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  /* The menu is for narrow screens: widening past them (a phone turned sideways) closes it. */
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 834px)");
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener?.("change", onChange);
    return () => wide.removeEventListener?.("change", onChange);
  }, []);

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
        return;
      }
      /* Tab stays inside the open menu: the toggle and the sheet's links. */
      if (event.key !== "Tab" || !headerRef.current) return;
      const stops = [
        toggleRef.current,
        ...headerRef.current.querySelectorAll<HTMLElement>(".gn__sheet a"),
      ].filter((item): item is HTMLElement => Boolean(item));
      if (!stops.length) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !headerRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !headerRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
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
    <header ref={headerRef} className={`gn${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
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
          <span aria-hidden="true" />
        </button>
      </div>

      <div id={sheetId} className="gn__sheet" hidden={!open}>
        <ul>
          {LINKS.map((link) => (
            <li key={link.target}>
              <a
                href={link.href}
                className="gn__sheet-link"
                aria-current={current === link.target ? "page" : undefined}
                onClick={go(link.target)}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
