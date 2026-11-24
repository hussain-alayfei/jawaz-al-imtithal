import type { ReactNode } from "react";
import { reveal } from "./motion";

/** Section labels (number, rule, word) are not shown: the headings carry the sections. Kept as a no-op so
    callers stay simple. */
export function SectionLabel(_props: { n: number; text: string }) {
  return null;
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
