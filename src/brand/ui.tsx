import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check, Minus, X } from "lucide-react";
import type { ResultStatus } from "../data";
import { copy } from "../content/copy";

type ButtonVariant = "primary" | "secondary" | "on-dark" | "gold";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "default" | "small";
  /** Icon shown inside the round disc at the start of the pill. */
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "default",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size === "small" ? "btn--small" : "",
    icon ? "btn--with-icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon && (
        <span className="btn__disc" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={["icon-btn", className ?? ""].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

const STATUS_LABEL: Record<ResultStatus, string> = {
  pass: copy.status.pass,
  fail: copy.status.fail,
  unknown: copy.status.unknown,
};

export function statusLabel(status: ResultStatus): string {
  return STATUS_LABEL[status];
}

export function StatusGlyph({ status, size = 20 }: { status: ResultStatus; size?: number }) {
  const icon = Math.round(size * 0.62);
  return (
    <span className="status__glyph" aria-hidden="true" style={{ width: size, height: size }}>
      {status === "pass" && <Check size={icon} strokeWidth={3} />}
      {status === "fail" && <X size={icon} strokeWidth={3} />}
      {status === "unknown" && <Minus size={icon} strokeWidth={2.5} />}
    </span>
  );
}

export function StatusMark({
  status,
  size = "default",
  label,
}: {
  status: ResultStatus;
  size?: "default" | "large";
  /** Override the visible word (defaults to the official status term). */
  label?: string;
}) {
  return (
    <span className={`status status--${status}${size === "large" ? " status--lg" : ""}`}>
      <StatusGlyph status={status} size={size === "large" ? 24 : 20} />
      <span>{label ?? STATUS_LABEL[status]}</span>
    </span>
  );
}

/** 32 triangular openings around the ring, as in the identity board. */
const SEAL_TEETH = (() => {
  const parts: string[] = [];
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    const tip = 89;
    const base = 78;
    const half = 0.034 * Math.PI * 2 * 0.5;
    const p = (r: number, t: number) =>
      `${(100 + r * Math.sin(t)).toFixed(1)} ${(100 - r * Math.cos(t)).toFixed(1)}`;
    parts.push(`M${p(base, a - half)} L${p(tip, a)} L${p(base, a + half)} Z`);
  }
  return parts.join(" ");
})();

export interface SealProps {
  size: number;
  top?: string;
  main: string;
  bottom?: string;
  /** Accessible description of the seal. */
  label: string;
  className?: string;
}

export function Seal({ size, top = copy.seal.top, main, bottom = copy.brand.name, label, className }: SealProps) {
  return (
    <div
      className={["seal", className ?? ""].filter(Boolean).join(" ")}
      style={{ width: size, height: size, fontSize: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="97" fill="#FFFFFF" stroke="#B98B2E" strokeWidth="1.5" />
        <path d={SEAL_TEETH} fill="#B98B2E" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="#B98B2E" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="68" fill="none" stroke="#B98B2E" strokeWidth=".75" />
      </svg>
      <p className="seal__text" aria-hidden="true">
        {top && <span className="seal__top">{top}</span>}
        <span className="seal__main">{main}</span>
        {bottom && <span className="seal__bottom">{bottom}</span>}
      </p>
    </div>
  );
}

/** Small mark: gold ring of triangles around a palm disc. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <circle cx="100" cy="100" r="97" fill="none" stroke="#B98B2E" strokeWidth="6" />
      <path d={SEAL_TEETH} fill="#B98B2E" />
      <circle cx="100" cy="100" r="66" fill="currentColor" />
      <path d="M100 62 L128 112 H72 Z" fill="#D9B76A" />
      <path d="M78 128 H122" stroke="#D9B76A" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({
  href = "#/",
  className,
  onClick,
}: {
  href?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      className={["wordmark", className ?? ""].filter(Boolean).join(" ")}
      aria-label={copy.brand.homeLabel}
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClick();
      }}
    >
      <BrandMark />
      <span>{copy.brand.name}</span>
    </a>
  );
}
