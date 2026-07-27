export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="presentation">
          <path className="brand__plan" d="M8.5 8.5h15v6.7h8v16.3h-23z" />
          <path className="brand__plan-line" d="M8.5 19.2h15m-5.7-10.7v23" />
          <path className="brand__check" d="m22.7 25.1 3.2 3.1 6.2-7.2" />
        </svg>
      </span>
      <span className="brand__copy">
        <strong>مِعيار</strong>
      </span>
    </div>
  );
}
