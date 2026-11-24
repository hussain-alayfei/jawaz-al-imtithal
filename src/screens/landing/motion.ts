import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";

/*
 * The home page's motion, written small: no animation library.
 *
 * Reveals: an element marked with reveal() starts hidden only once Landing.tsx has switched motion on
 * (data-motion on the page root, set before the first paint), and is shown once, for good, when it enters
 * the screen (an IntersectionObserver sets data-in, then stops watching it). Without script, without
 * IntersectionObserver or with prefers-reduced-motion: reduce, motion never switches on, so nothing is
 * hidden. The look of each kind is in landing.css (.hm[data-motion] [data-reveal=…]).
 *
 * Scroll-linked parts (the hero's parallax, the statement's words) run in one requestAnimationFrame per
 * scroll or resize, through useScrollFrame, and only write transform, opacity or a custom property.
 */

/** up: words rise and fade in. media: a picture is wiped open from below while it settles from a slight
    zoom. wipe: the wipe alone. rule: a thin line draws from the start side. fade: opacity only. */
export type RevealKind = "up" | "media" | "wipe" | "rule" | "fade";

/** Stagger between neighbours, in milliseconds. */
export const STAGGER_MS = 120;

/** Props for an element that reveals once; `step` delays it by that many staggers. Merge `style` by hand
    when the element has its own. */
export function reveal(kind: RevealKind = "up", step = 0): { "data-reveal": RevealKind; style?: CSSProperties } {
  return step
    ? { "data-reveal": kind, style: { "--hm-d": `${Math.round(step * STAGGER_MS)}ms` } as CSSProperties }
    : { "data-reveal": kind };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** True when motion may run: the browser can observe, and the visitor has not asked for reduced motion. */
export function motionAllowed(): boolean {
  return typeof IntersectionObserver !== "undefined" && !prefersReducedMotion();
}

/** Switches the reveals on inside `root` and shows each marked element once as it enters the screen,
    including elements that mount later (the model story swaps its pictures at 1024px). */
export function useReveals(root: RefObject<HTMLElement | null>) {
  /* Before the first paint, so nothing that is about to be hidden flashes in first. */
  useLayoutEffect(() => {
    const scope = root.current;
    if (!scope || !motionAllowed()) return;
    scope.setAttribute("data-motion", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );
    const watch = (node: ParentNode) => {
      node.querySelectorAll?.("[data-reveal]:not([data-in])").forEach((element) => observer.observe(element));
    };
    watch(scope);
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.hasAttribute("data-reveal") && !node.hasAttribute("data-in")) observer.observe(node);
          watch(node);
        });
      }
    });
    mutations.observe(scope, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      scope.removeAttribute("data-motion");
    };
  }, [root]);
}

/** Runs `update` once, then at most once per frame while the page scrolls or resizes. Not at all with
    reduced motion (the scroll-linked effects are decoration). The latest `update` is always the one run. */
export function useScrollFrame(update: () => void, enabled = true) {
  const latest = useRef(update);
  latest.current = update;

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      latest.current();
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled]);
}

/** "01", "02", …: the numbers on the home page's labels and rows. */
export const twoDigits = (value: number) => String(value).padStart(2, "0");
