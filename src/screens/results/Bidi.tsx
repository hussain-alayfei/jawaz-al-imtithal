import { Fragment, type ReactNode } from "react";

/* Engine sentences mix Arabic with IFC names ("Kitchen wall tiles west", "IfcCovering",
   "SBC-801"). Each Latin run is isolated in <bdi> so it keeps its own direction inside RTL text. */

/* A Latin run, or a Latin run with its own parentheses so they do not mirror when the line wraps. */
const LATIN_RUN = /\([A-Za-z][\w\-.$ ]*\)|[A-Za-z][\w\-.$]*(?:\s+[A-Za-z0-9][\w\-.$]*)*/g;

export function Bidi({ text }: { text: string }): ReactNode {
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
