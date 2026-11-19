import { Fragment, type ReactNode } from "react";
import { Circle, CircleCheck, CircleDot, CircleX } from "../../brand/icons";
import type { StageState } from "../../ifc/types";

export const STROKE = 1.6;

/* Latin runs (IFC4, Revit, file names, ISO-10303-21) and «50 MB» keep their direction and stay on one line.
   Dots and hyphens only join a run from inside, so a sentence's own full stop stays outside the <bdi>. */
const LATIN_RUN = /\d+(?:\.\d+)?\s?MB|[A-Za-z]\w*(?:[.-]\w+)*(?:\s+[A-Za-z0-9]\w*(?:[.-]\w+)*)*/g;

export function Bidi({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_RUN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <bdi key={start} dir="ltr" className="ck-nowrap">
        {match[0]}
      </bdi>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

export function StageIcon({ state }: { state: StageState }) {
  const props = { size: 20, strokeWidth: STROKE, "aria-hidden": true } as const;
  if (state === "completed") return <CircleCheck {...props} />;
  if (state === "running") return <CircleDot {...props} />;
  if (state === "failed") return <CircleX {...props} />;
  return <Circle {...props} />;
}
