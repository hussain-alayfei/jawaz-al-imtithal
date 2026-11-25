import { Component, Fragment, createRef, useLayoutEffect, type CSSProperties, type ReactNode, type RefObject } from "react";
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

/* Motion, in the home page's language (src/screens/landing/motion.ts): slow rises on cubic-bezier(.16,1,.3,1),
   clip-path wipes, and nothing at all with prefers-reduced-motion: reduce. Only transform, opacity, clip-path
   and the stage's measured height move. */

const EASE_LUX = "cubic-bezier(0.16, 1, 0.3, 1)";
/** The outgoing step fades out in this time; the incoming one (check.css, .ck-view) waits about as long. */
const LEAVE_MS = 180;
/** The stage's height follows the new step's in this time. */
const RESIZE_MS = 640;

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

type Snapshot = { height: number; ghost: HTMLElement | null } | null;

/**
 * Holds one view of the wizard at a time (its child, keyed by `viewKey`). When the view changes, the old view
 * is copied just before React replaces it and laid over the new one as an inert, hidden-from-assistive-tech
 * ghost that fades out quickly; the stage's height moves from the old view's to the new one's instead of
 * jumping; the new view rises in through its own CSS animation. The live view carries data-live, the ghost
 * does not. A class, because only getSnapshotBeforeUpdate can read the old DOM before the commit.
 */
export class ViewStage extends Component<{ viewKey: string; className?: string; children: ReactNode }> {
  private stage = createRef<HTMLDivElement>();
  private animations: Animation[] = [];
  private ghost: HTMLElement | null = null;

  getSnapshotBeforeUpdate(previous: Readonly<{ viewKey: string }>): Snapshot {
    const stage = this.stage.current;
    if (!stage || previous.viewKey === this.props.viewKey || reducedMotion() || typeof stage.animate !== "function") {
      return null;
    }
    const live = stage.querySelector<HTMLElement>(":scope > [data-live]");
    return { height: stage.getBoundingClientRect().height, ghost: live ? (live.cloneNode(true) as HTMLElement) : null };
  }

  componentDidUpdate(_props: unknown, _state: unknown, snapshot: Snapshot) {
    const stage = this.stage.current;
    if (!snapshot || !stage) return;
    this.settle();

    const { ghost } = snapshot;
    if (ghost) {
      ghost.removeAttribute("data-live");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("inert", "");
      ghost.classList.add("ck-ghost");
      ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      ghost.querySelectorAll("[name]").forEach((element) => element.removeAttribute("name"));
      stage.append(ghost);
      this.ghost = ghost;
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: "ease-out", fill: "forwards" });
      fade.onfinish = () => {
        ghost.remove();
        if (this.ghost === ghost) this.ghost = null;
      };
      this.animations.push(fade);
    }

    const to = stage.getBoundingClientRect().height;
    if (Math.abs(to - snapshot.height) > 1) {
      stage.style.overflow = "clip";
      const resize = stage.animate([{ height: `${snapshot.height}px` }, { height: `${to}px` }], {
        duration: RESIZE_MS,
        easing: EASE_LUX,
      });
      const release = () => {
        stage.style.overflow = "";
      };
      resize.onfinish = release;
      resize.oncancel = release;
      this.animations.push(resize);
    }
  }

  componentWillUnmount() {
    this.settle();
  }

  /** Ends a transition still running: a new one starts from wherever it had got to. */
  private settle() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.ghost?.remove();
    this.ghost = null;
    if (this.stage.current) this.stage.current.style.overflow = "";
  }

  render() {
    return (
      <div ref={this.stage} className={["ck-viewport", this.props.className ?? ""].filter(Boolean).join(" ")}>
        {this.props.children}
      </div>
    );
  }
}

/**
 * The overview's reveals: elements marked data-reveal inside `root` start hidden once motion is switched on
 * (data-motion, set before the first paint) and show once, for good, as they enter the screen. Without
 * IntersectionObserver or with reduced motion nothing is ever hidden.
 */
export function useReveals(root: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const scope = root.current;
    if (!active || !scope || typeof IntersectionObserver === "undefined" || reducedMotion()) return;
    scope.setAttribute("data-motion", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    scope.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      scope.removeAttribute("data-motion");
    };
  }, [root, active]);
}

/** Props for an element that reveals once, `order` staggers after the first. */
export function reveal(kind: "up" | "rule" | "fade" = "up", order = 0) {
  return {
    "data-reveal": kind,
    style: order ? ({ "--ck-d": `${order * 120}ms` } as CSSProperties) : undefined,
  };
}

/** «موائم» with its orange dimension line, as plain text (the passport's band is not a link). */
export function PassportMark({ name }: { name: string }) {
  return (
    <span className="wordmark ck-passport__mark">
      <span className="wordmark__text">{name}</span>
      <svg className="wordmark__line" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <path d="M1 4H99" stroke="#F26A1B" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d="M1 0.5V7.5M99 0.5V7.5" stroke="#F26A1B" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}
