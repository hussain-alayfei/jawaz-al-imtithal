/*
 * The home page's pictures at several widths, so each screen downloads about the size it draws.
 * The smaller copies live in src/assets/site/sized/ (<name>-<width>.webp, made by
 * scripts/responsive-images.py: same crop, same aspect ratio); the original file is the largest candidate.
 */

const SIZED = import.meta.glob<string>("../../assets/site/sized/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

/** "url 800w, url 1200w, …, original <width>w" for the picture called `name` (its file name without .webp). */
export function srcSetOf(name: string, original: string, originalWidth: number): string {
  const candidates: [string, number][] = [];
  for (const [path, url] of Object.entries(SIZED)) {
    const match = /\/([^/]+)-(\d+)\.webp$/.exec(path);
    if (match && match[1] === name) candidates.push([url, Number(match[2])]);
  }
  candidates.sort((a, b) => a[1] - b[1]);
  candidates.push([original, originalWidth]);
  return candidates.map(([url, width]) => `${url} ${width}w`).join(", ");
}

/*
 * `sizes` for each kind of picture: the width the picture is drawn at, from src/screens/landing.css
 * (--gutter is clamp(20px, 5vw, 48px)). Pictures drawn with object-fit: cover are drawn wider than their
 * box, so their sizes give the drawn width, not the box. An entry a browser cannot parse (max()) is skipped
 * and the plain one after it applies.
 */
export const SIZES = {
  /* The hero photo is 2:1 and as tall as max(50vw, 64% of the hero) on phones (hero: max(500px, 80svh)),
     max(50vw, 58% of the hero) from 834px (hero: max(520px, min(100svh - header, 1100px))). */
  hero: [
    "(max-width: 833px) max(100vw, 640px, 102.4vh)",
    "(max-width: 833px) 102.4vh",
    "max(100vw, 116vh - 74px)",
    "100vw",
  ].join(", "),
  /* The three stage rows (4:3 picture in a 4:3 box): full width inside the gutters on phones, then 58% of
     the row (the row is at most 1280px wide). */
  rows: "(min-width: 1376px) 743px, (min-width: 834px) 54vw, 92vw",
  /* The twin row (16:10 picture in a 16:10 box): 62% of the row from 834px. */
  twin: "(min-width: 1376px) 794px, (min-width: 834px) 58vw, 92vw",
  /* The model story's 16:9 renders. Below 1024px each fills a full-width 4:3 box (below 600px) or 16:10 box,
     so it is drawn 4/3 or 10/9 as wide as the screen. From 1024px the pinned frame is 64% of the story
     (at most 1600px wide) and 0.8 times as tall as it is wide, so the render is drawn about 1.42 times the
     frame's width. */
  story: "(min-width: 1696px) 1456px, (min-width: 1024px) calc(91vw - 87px), (min-width: 600px) 112vw, 134vw",
} as const;
