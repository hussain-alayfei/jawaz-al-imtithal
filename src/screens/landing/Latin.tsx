import { Fragment, type ReactNode } from "react";

/* Latin runs (IFC, Revit, BIM) keep their own direction inside Arabic sentences. Dots and hyphens only
   join a run from inside, so a sentence's own full stop stays outside the <bdi>. */
const LATIN_RUN = /[A-Za-z]\w*(?:[.-]\w+)*(?:\s+[A-Za-z0-9]\w*(?:[.-]\w+)*)*/g;

export function Latin({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_RUN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <bdi key={start} dir="ltr">
        {match[0]}
      </bdi>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
