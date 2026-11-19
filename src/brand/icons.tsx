import type { ReactNode, SVGProps } from "react";

/* موائم's own glyphs, drawn for this site in the manner of system symbols: a 24 px grid, one thin
   round-capped stroke, generous inner space, and filled circles for statuses. Every glyph takes the
   text colour. Names follow the ones the screens already use, so a screen only changes its import.
   `strokeWidth` from callers is ignored on purpose: the family keeps one weight (slightly heavier at
   small sizes, so the optical weight holds). */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number | string;
  strokeWidth?: number | string;
  title?: string;
}

type Glyph = (props: IconProps) => ReactNode;

function glyph(name: string, body: ReactNode, filled = false): Glyph {
  function Icon({ size = 20, strokeWidth: _ignored, className, title, ...rest }: IconProps) {
    const px = typeof size === "number" ? size : Number.parseFloat(size) || 20;
    const stroke = px <= 16 ? 1.8 : px <= 20 ? 1.6 : 1.5;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={["icon", `icon-${name}`, filled ? "icon--filled" : "", className].filter(Boolean).join(" ")}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title && <title>{title}</title>}
        {body}
      </svg>
    );
  }
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

const dot = (cx: number, cy: number, r = 1.05) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const ring = <circle cx="12" cy="12" r="8.75" />;
const page = <path d="M13.75 3.75H7.5a2 2 0 0 0-2 2v12.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z M13.75 3.75V8.5h4.75" />;

/* ---- marks ---- */
export const Check = glyph("check", <path d="M5.25 12.75l4.25 4.25 9.25-10" />);
export const X = glyph("xmark", <path d="M6.75 6.75l10.5 10.5M17.25 6.75l-10.5 10.5" />);
export const Minus = glyph("minus", <path d="M6.25 12h11.5" />);
export const ChevronRight = glyph("chevron-right", <path d="M9.5 5.5L16 12l-6.5 6.5" />);
export const ChevronLeft = glyph("chevron-left", <path d="M14.5 5.5L8 12l6.5 6.5" />);
export const ChevronDown = glyph("chevron-down", <path d="M5.5 9.25L12 15.75l6.5-6.5" />);

/* ---- circles (statuses use the filled ones) ---- */
export const Circle = glyph("circle", ring);
export const CircleDot = glyph("circle-dot", <>{ring}<circle cx="12" cy="12" r="3.75" fill="currentColor" stroke="none" /></>);
const filledCheck = (
  <>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" />
    <path d="M7.9 12.4l2.75 2.75 5.5-6" stroke="#fff" strokeWidth="1.9" />
  </>
);
const filledX = (
  <>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" />
    <path d="M8.9 8.9l6.2 6.2M15.1 8.9l-6.2 6.2" stroke="#fff" strokeWidth="1.9" />
  </>
);
export const CircleCheck = glyph("checkmark-circle-fill", filledCheck, true);
export const CheckCircle2 = CircleCheck;
export const CircleX = glyph("xmark-circle-fill", filledX, true);
export const XCircle = CircleX;
export const Info = glyph("info-circle", <>{ring}<path d="M12 11v5.5" />{dot(12, 7.9)}</>);
export const CircleAlert = glyph("exclamation-circle", <>{ring}<path d="M12 7.5v5.25" />{dot(12, 16.1)}</>);
export const CircleHelp = glyph(
  "question-circle",
  <>{ring}<path d="M9.6 9.7a2.45 2.45 0 1 1 3.55 2.2c-.75.38-1.15.9-1.15 1.65v.25" />{dot(12, 16.5)}</>,
);
export const LoaderCircle = glyph("progress", <path d="M12 3.25a8.75 8.75 0 1 0 8.75 8.75" />);

/* ---- documents and transfer ---- */
export const FileText = glyph("doc-text", <>{page}<path d="M8.75 12.5h6.5M8.75 15.75h4.5" /></>);
export const FileCode2 = glyph("doc-code", <>{page}<path d="M10.25 12.25L8.5 14l1.75 1.75M13.75 12.25L15.5 14l-1.75 1.75" /></>);
export const FileCheck2 = glyph("doc-check", <>{page}<path d="M9 14.25l2 2 4-4.25" /></>);
export const FolderOpen = glyph(
  "folder",
  <path d="M3.75 7.25a2 2 0 0 1 2-2h3.5l2 2.25h7a2 2 0 0 1 2 2v7.75a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2z M3.75 10.25h16.5" />,
);
export const Copy = glyph(
  "doc-on-doc",
  <>
    <rect x="8.75" y="8.75" width="11" height="11" rx="2.25" />
    <path d="M15.25 8.75V6.25a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.5" />
  </>,
);
export const Download = glyph("arrow-down-tray", <path d="M12 4.25v10.5M7.75 10.75L12 15l4.25-4.25M5 19.75h14" />);
export const Upload = glyph("arrow-up-tray", <path d="M12 15V4.5M7.75 8.75L12 4.5l4.25 4.25M5 19.75h14" />);

/* ---- model and view ---- */
export const Layers = glyph(
  "layers",
  <path d="M12 4l8.25 4.25L12 12.5 3.75 8.25z M3.75 12.1L12 16.35l8.25-4.25 M3.75 15.95L12 20.2l8.25-4.25" />,
);
export const Layers3 = Layers;
export const LayoutGrid = glyph(
  "square-grid",
  <>
    <rect x="4.25" y="4.25" width="6.5" height="6.5" rx="1.75" />
    <rect x="13.25" y="4.25" width="6.5" height="6.5" rx="1.75" />
    <rect x="4.25" y="13.25" width="6.5" height="6.5" rx="1.75" />
    <rect x="13.25" y="13.25" width="6.5" height="6.5" rx="1.75" />
  </>,
);
/** Section cut: a box with the plane through it. */
export const Scissors = glyph(
  "section",
  <>
    <path d="M12 3.75l7.25 4.1v8.3L12 20.25l-7.25-4.1v-8.3z" strokeOpacity=".55" />
    <path d="M3.5 12.75l8.5-4.5 8.5 4.5-8.5 4.5z" fill="currentColor" fillOpacity=".14" />
  </>,
);
export const Crosshair = glyph("scope", <><circle cx="12" cy="12" r="7" /><path d="M12 2.75v3.5M12 17.75v3.5M2.75 12h3.5M17.75 12h3.5" />{dot(12, 12, 1.25)}</>);
export const Focus = glyph(
  "viewfinder",
  <>
    <path d="M4.25 8.75v-2.5a2 2 0 0 1 2-2h2.5M15.25 4.25h2.5a2 2 0 0 1 2 2v2.5M19.75 15.25v2.5a2 2 0 0 1-2 2h-2.5M8.75 19.75h-2.5a2 2 0 0 1-2-2v-2.5" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
);
export const ScanLine = glyph(
  "viewfinder-line",
  <path d="M4.25 8.75v-2.5a2 2 0 0 1 2-2h2.5M15.25 4.25h2.5a2 2 0 0 1 2 2v2.5M19.75 15.25v2.5a2 2 0 0 1-2 2h-2.5M8.75 19.75h-2.5a2 2 0 0 1-2-2v-2.5 M7.5 12h9" />,
);
export const Box = glyph("cube", <path d="M12 3.75l7.25 4.1v8.3L12 20.25l-7.25-4.1v-8.3z M4.75 7.85L12 12l7.25-4.15M12 12v8.25" />);
export const BoxSelect = glyph("square-dashed", <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" strokeDasharray="2.6 2.4" />);
export const Move3d = glyph(
  "move-3d",
  <path d="M12 12.5V4.5M9.75 6.5L12 4.25l2.25 2.25M12 12.5l6.75 3.9M16.25 17.5l2.75-1-.6-2.85M12 12.5l-6.75 3.9M5.6 13.65l-.6 2.85 2.75 1" />,
);
export const Maximize2 = glyph("expand", <path d="M14.25 4.25h5.5v5.5M9.75 19.75h-5.5v-5.5M19.75 4.25l-6.25 6.25M4.25 19.75l6.25-6.25" />);
export const Minimize2 = glyph("collapse", <path d="M19.5 4.5l-5.75 5.75M13.75 5.75v4.5h4.5M4.5 19.5l5.75-5.75M10.25 18.25v-4.5h-4.5" />);
export const RotateCcw = glyph("arrow-counterclockwise", <path d="M5.1 9.25A7.5 7.5 0 1 1 4.5 12 M4.75 4.75v4.75h4.75" />);
export const Compass = glyph("compass", <>{ring}<path d="M14.9 9.1l-1.65 4.15-4.15 1.65 1.65-4.15z" /></>);
export const Eye = glyph(
  "eye",
  <>
    <path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
/** Route (escape paths). */
export const Footprints = glyph(
  "route",
  <>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h6.5a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6H16" />
  </>,
);
export const Ruler = glyph(
  "ruler",
  <path d="M3.9 15.5L15.5 3.9l4.6 4.6L8.5 20.1z M7.6 11.8l1.7 1.7M10.2 9.2l2.4 2.4M12.8 6.6l1.7 1.7" />,
);
export const Tags = glyph(
  "tag",
  <>
    <path d="M3.75 12.4V5.75a2 2 0 0 1 2-2h6.65l7.9 7.9a2 2 0 0 1 0 2.8l-5.85 5.85a2 2 0 0 1-2.8 0z" />
    {dot(8.25, 8.25, 1.35)}
  </>,
);
export const MousePointer2 = glyph("cursor", <path d="M5.75 4.75l12.5 6.9-5.55 1.6-2.75 5.5z" />);
export const ShieldAlert = glyph(
  "exclamation-shield",
  <>
    <path d="M12 3.5l7 2.65v5.35c0 4.3-2.85 7.55-7 9-4.15-1.45-7-4.7-7-9V6.15z" />
    <path d="M12 8.25v4.75" />
    {dot(12, 16)}
  </>,
);
export const Building2 = glyph(
  "building",
  <path d="M5 20.25V5.25a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v15M14.5 9.25H18a1 1 0 0 1 1 1v10M3.25 20.25h17.5M8.25 8h3M8.25 11.5h3M8.25 15h3" />,
);
/** Sidebar on the trailing side; the same glyph opens and closes it. */
const sidebar = (
  <>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2.5" />
    <path d="M14.5 4.75v14.5" />
  </>
);
export const PanelRightOpen = glyph("sidebar", sidebar);
export const PanelRightClose = PanelRightOpen;
