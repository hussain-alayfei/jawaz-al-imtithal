import type { Finding } from "../../data";
import { copy } from "../../content/copy";
import { Bidi } from "./Bidi";
import { splitValue } from "./findings";

/* Local strings (missing from copy.ts): the bound beside a required value. */
const BOUND_LABEL = { min: "على الأقل", max: "على الأكثر" } as const;

/** Measured against required, with the number large and the engine's explanation beneath it. */
export function Measure({ finding, prefix }: { finding: Finding; prefix: "rs" | "rp" }) {
  const measured = splitValue(finding.actual);
  const required = splitValue(finding.expected);
  return (
    <dl className={`${prefix}-meas`}>
      <div>
        <dt>{copy.results.detail.measured}</dt>
        <dd>
          {measured.value && (
            <span className={`${prefix}-meas__num ${prefix}-meas__num--${finding.status}`}>{measured.value}</span>
          )}
          {measured.rest && (
            <span className={`${prefix}-meas__note${measured.value ? "" : ` ${prefix}-meas__note--lead`}`}>
              <Bidi text={measured.rest} />
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>{copy.results.detail.required}</dt>
        <dd>
          {required.value && (
            <span className={`${prefix}-meas__num`}>
              {required.value}
              {required.bound && <small>{BOUND_LABEL[required.bound]}</small>}
            </span>
          )}
          {required.rest && (
            <span className={`${prefix}-meas__note${required.value ? "" : ` ${prefix}-meas__note--lead`}`}>
              <Bidi text={required.rest} />
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}
