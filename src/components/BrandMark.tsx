import { Check } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <span className="brand__corner brand__corner--one" />
        <span className="brand__corner brand__corner--two" />
        <Check size={20} strokeWidth={2.3} />
      </span>
      <span className="brand__copy">
        <strong>جواز الامتثال</strong>
        {!compact && <small>الفحص الاستباقي للمخططات</small>}
      </span>
    </div>
  );
}

