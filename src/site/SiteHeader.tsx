import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandMark } from "../brand/ui";
import { copy } from "../content/copy";
import "./site.css";

export type NavTarget = "home" | "how" | "clauses" | "model" | "twin" | "check";

export interface SiteHeaderProps {
  /** The link that matches the current page, for aria-current. */
  current?: NavTarget;
  onNavigate: (target: NavTarget) => void;
}

const LINKS: { target: NavTarget; label: string }[] = [
  { target: "how", label: copy.site.nav.how },
  { target: "clauses", label: copy.site.nav.clauses },
  { target: "model", label: copy.site.nav.model },
  { target: "twin", label: copy.site.nav.twin },
];

const HREF: Record<NavTarget, string> = {
  home: "#/",
  how: "#/how",
  clauses: "#/clauses",
  model: "#/model",
  twin: "#/twin",
  check: "#/check",
};

/** Light, compact site header: wordmark, four text links and one action. */
export function SiteHeader({ current, onNavigate }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (target: NavTarget) => (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(false);
    onNavigate(target);
  };

  return (
    <header className="site-header">
      <div className="page site-header__inner">
        <a href="#/" className="site-brand" aria-label={copy.brand.homeLabel} onClick={go("home")}>
          <BrandMark className="site-brand__mark" />
          <span className="site-brand__name">{copy.brand.name}</span>
        </a>

        <nav className="site-nav" aria-label={copy.site.nav.label}>
          <ul id={menuId} className={`site-nav__list${open ? " is-open" : ""}`}>
            {LINKS.map((link) => (
              <li key={link.target}>
                <a
                  href={HREF[link.target]}
                  className="site-nav__link"
                  aria-current={current === link.target ? "page" : undefined}
                  onClick={go(link.target)}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="site-nav__cta-mobile">
              <a href="#/check" className="btn btn--primary" onClick={go("check")}>
                {copy.site.nav.cta}
              </a>
            </li>
          </ul>
        </nav>

        <div className="site-header__actions">
          <a href="#/check" className="btn btn--primary site-header__cta" onClick={go("check")}>
            {copy.site.nav.cta}
          </a>
          <button
            ref={toggleRef}
            type="button"
            className="icon-btn site-header__toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? copy.site.nav.close : copy.site.nav.open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} strokeWidth={1.8} /> : <Menu size={20} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </header>
  );
}
