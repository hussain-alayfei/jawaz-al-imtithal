import { DRAWING_PATHS } from "./drawingPaths";

/* Static axonometric illustration of the sample restaurant (restaurant-kitchen-tiles-1.5m.ifc), ported from
   the approved board. "plate" is the full plan with room labels and the 4.5.2 callout; "inset" crops to the
   west kitchen wall for the expanded register row. Labels are drawing data, so they live here. */

const ROOMS = {
  kitchen: "المطبخ",
  store: "المستودع",
  prep: "التحضير",
  wc: "دورة المياه",
  dining: "صالة الطعام",
  exit: "مخرج الطوارئ",
  exitWidth: "0.95 م",
};

const MEASURED = "1.50 م";
const REQUIRED = "المطلوب 1.80 م";

interface ModelDrawingProps {
  variant: "plate" | "inset";
  /** Accessible description of the drawing. */
  label: string;
  className?: string;
}

export default function ModelDrawing({ variant, label, className }: ModelDrawingProps) {
  const viewBox = variant === "plate" ? "26 92 854 604" : "40 172 340 266";
  return (
    <svg
      className={["lp-drawing", `lp-drawing--${variant}`, className ?? ""].filter(Boolean).join(" ")}
      viewBox={viewBox}
      role="img"
      aria-label={label}
      focusable="false"
    >
      {DRAWING_PATHS.map(([style, d], index) => (
        <path key={index} className={`lp-d-${style}`} d={d} />
      ))}

      {variant === "plate" ? (
        <>
          {/* Wide screens: full room labels at drawing size. */}
          <g className="lp-dl lp-dl--wide">
            <text className="lp-dl__room" x="284" y="324">{ROOMS.kitchen}</text>
            <text className="lp-dl__room" x="385" y="278">{ROOMS.store}</text>
            <text className="lp-dl__room" x="479" y="332">{ROOMS.prep}</text>
            <text className="lp-dl__room lp-dl__room--small" x="327" y="514">{ROOMS.wc}</text>
            <text className="lp-dl__room" x="606" y="447">{ROOMS.dining}</text>
            <text className="lp-dl__room lp-dl__room--out" x="806" y="547">{ROOMS.exit}</text>
            <text className="lp-dl__room lp-dl__room--out" x="806" y="567">{ROOMS.exitWidth}</text>
            <path className="lp-dl__leader" d="M124 184 L162 314" />
            <circle className="lp-dl__pin" cx="162" cy="314" r="3.5" />
            <rect className="lp-dl__callout" x="34.5" y="100.5" width="180" height="83" rx="14" />
            <text className="lp-dl__measured" x="124.5" y="145">{MEASURED}</text>
            <text className="lp-dl__required" x="124.5" y="171">{REQUIRED}</text>
          </g>
          {/* Narrow screens: the plate shrinks to about 0.4x, so fewer, larger labels. */}
          <g className="lp-dl lp-dl--compact">
            <text className="lp-dl__room lp-dl__room--lg" x="560" y="470">{ROOMS.dining}</text>
            <path className="lp-dl__leader" d="M148 218 L170 330" />
            <circle className="lp-dl__pin" cx="170" cy="330" r="6" />
            <rect className="lp-dl__callout" x="30.5" y="96.5" width="236" height="122" rx="22" />
            <text className="lp-dl__measured lp-dl__measured--lg" x="148.5" y="158">{MEASURED}</text>
            <text className="lp-dl__required lp-dl__required--lg" x="148.5" y="198">{REQUIRED}</text>
          </g>
        </>
      ) : (
        <g className="lp-dl">
          <text className="lp-dl__on-wall" x="168" y="342">{MEASURED}</text>
          <text className="lp-dl__on-dash" x="300" y="208">{REQUIRED}</text>
        </g>
      )}
    </svg>
  );
}
