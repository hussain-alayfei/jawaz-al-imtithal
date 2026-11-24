import type { ReactNode } from "react";
import { reveal, twoDigits } from "./motion";

/** A section's small label: its two-digit number, a thin rule that draws in, and one word. */
export function SectionLabel({ n, text }: { n: number; text: string }) {
  return (
    <p className="hm-label" {...reveal("rule")}>
      <span className="hm-label__no num">{twoDigits(n)}</span>
      <span className="hm-label__line" aria-hidden="true" />
      <span className="hm-label__text">{text}</span>
    </p>
  );
}

/** A section head: the label, a large light headline on the start side, and (from 1024px) the lead and any
    link beside it, aligned to the headline's last line. Each part rises in after the one before. */
export function SectionHead({
  n,
  label,
  id,
  title,
  lead,
  children,
  className,
}: {
  n: number;
  label: string;
  /** The headline's id, for the section's aria-labelledby. */
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Shown under the lead (a link). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["hm-head", className].filter(Boolean).join(" ")}>
      <SectionLabel n={n} text={label} />
      <h2 id={id} className="hm-title" {...reveal("up", 1)}>
        {title}
      </h2>
      {(lead || children) && (
        <div className="hm-head__aside" {...reveal("up", 2)}>
          {lead && <p className="hm-lead">{lead}</p>}
          {children}
        </div>
      )}
    </header>
  );
}
