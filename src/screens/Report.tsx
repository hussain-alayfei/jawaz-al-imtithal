import { useMemo } from "react";
import { BrandMark, Button, StatusGlyph, StatusMark, statusLabel } from "../brand/ui";
import { copy } from "../content/copy";
import type { Finding } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { ReportProps } from "./types";
import { Bidi } from "./results/Bidi";
import { Measure } from "./results/Measure";
import {
  ELEMENT_FORMS,
  actionOf,
  citationOf,
  clauseOf,
  counted,
  elementOf,
  groupFindings,
  isDataCheck,
  referenceOf,
  scopeOf,
  splitValue,
  tallyOf,
  type FindingGroup,
} from "./results/findings";
import "./report.css";

/* Local strings (missing from copy.ts). */
const L = {
  generated: "تاريخ الفحص",
  fingerprint: "بصمة الملف SHA-256",
  download: "تنزيل نسخة HTML",
  downloaded: "تم تنزيل نسخة HTML قابلة للطباعة من التقرير.",
  fileLevel: "نتيجة على مستوى الملف",
  newTab: "يفتح في نافذة جديدة",
  tools: "إجراءات التقرير",
  counts: "النتائج حسب الحالة",
} as const;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function groupNote(group: FindingGroup): string | undefined {
  if (group.key === "unknown") return copy.results.groups.unknownNote;
  if (group.key === "data") return copy.results.groups.dataNote;
  return undefined;
}

function ReportFinding({ run, finding }: { run: ComplianceRun; finding: Finding }) {
  const clause = clauseOf(finding);
  const element = elementOf(run, finding);
  const action = actionOf(finding);
  return (
    <article className="rp-finding">
      <header className="rp-finding__head">
        <h3>
          {clause.number && <span className="rp-finding__no">{clause.number}</span>}
          <span>{clause.subject}</span>
        </h3>
        <StatusMark status={finding.status} />
      </header>

      <Measure finding={finding} prefix="rp" />

      {finding.clauseText && isDataCheck(finding) && (
        <p className="rp-desc">
          <Bidi text={finding.clauseText} />
        </p>
      )}

      {finding.clauseText && !isDataCheck(finding) && (
        <figure className="rp-quote">
          <blockquote>«{finding.clauseText}»</blockquote>
          <figcaption>
            <cite>
              <Bidi text={citationOf(finding)} />
            </cite>
            {finding.sourceUrl && (
              <a className="link rp-screen" href={finding.sourceUrl} target="_blank" rel="noreferrer">
                {copy.results.detail.showClause}
                <span className="sr-only"> ({L.newTab})</span>
              </a>
            )}
          </figcaption>
        </figure>
      )}

      <dl className="rp-facts">
        <div>
          <dt>{copy.results.detail.element}</dt>
          <dd>
            {element ? (
              <>
                {element.name && <bdi className="rp-facts__name">{element.name}</bdi>}
                {element.ifcClass && (
                  <span className="rp-facts__sub">
                    <bdi dir="ltr">{element.ifcClass}</bdi>
                  </span>
                )}
              </>
            ) : (
              L.fileLevel
            )}
          </dd>
        </div>
        {element?.guid && (
          <div>
            <dt>{copy.model.guid}</dt>
            <dd>
              <bdi dir="ltr" className="rp-guid">
                {element.guid}
              </bdi>
            </dd>
          </div>
        )}
        {!finding.clauseText && finding.clause && (
          <div className="rp-facts__wide">
            <dt>{copy.dossier.referenceLabel}</dt>
            <dd>
              <Bidi text={[finding.source, citationOf(finding)].filter(Boolean).join("، ")} />
            </dd>
          </div>
        )}
        {action && (
          <div className="rp-facts__wide">
            <dt>{copy.results.detail.action}</dt>
            <dd>
              <Bidi text={action} />
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function ReportGroup({ run, group }: { run: ComplianceRun; group: FindingGroup }) {
  const note = groupNote(group);
  return (
    <section className={`rp-group rp-group--${group.key}`} aria-labelledby={`rp-g-${group.key}`}>
      <div className="rp-group__head">
        <h2 id={`rp-g-${group.key}`}>
          {group.status && (
            <span className={`status status--${group.status}`}>
              <StatusGlyph status={group.status} size={22} />
            </span>
          )}
          {copy.results.groups[group.key]}
        </h2>
        <span className="count">{group.items.length}</span>
      </div>
      {note && <p className="rp-note rp-group__note">{note}</p>}
      {group.items.map((finding) => (
        <ReportFinding key={finding.ruleId} run={run} finding={finding} />
      ))}
    </section>
  );
}

export default function Report({ run, onBack, notify }: ReportProps) {
  const { findings, metadata } = run;
  const summary = tallyOf(run);
  const generatedAt = useMemo(() => formatDate(run.processedAt), [run.processedAt]);
  const groups = useMemo(() => groupFindings(findings), [findings]);
  const clauseGroups = groups.filter((group) => group.key !== "data");
  const dataGroup = groups.find((group) => group.key === "data");
  const reference = referenceOf(run);
  const scopeText = scopeOf(run);

  const downloadReport = () => {
    const sections = groups
      .map((group) => {
        const rows = group.items
          .map((finding) => {
            const clause = clauseOf(finding);
            const element = elementOf(run, finding);
            const measured = splitValue(finding.actual);
            const action = actionOf(finding);
            return `
<article>
  <h3><span class="no">${escapeHtml(clause.number ?? "")}</span> ${escapeHtml(clause.subject)} <span class="st st-${finding.status}">${escapeHtml(statusLabel(finding.status))}</span></h3>
  <table><tbody>
    <tr><th>${escapeHtml(copy.results.detail.measured)}</th><td>${measured.value ? `<b>${escapeHtml(measured.value)}</b> ` : ""}${escapeHtml(measured.rest)}</td></tr>
    <tr><th>${escapeHtml(copy.results.detail.required)}</th><td>${escapeHtml(finding.expected)}</td></tr>
    <tr><th>${escapeHtml(copy.results.detail.element)}</th><td>${element ? `${escapeHtml(element.name ?? "")} <bdi dir="ltr">${escapeHtml(element.ifcClass ?? "")}</bdi>` : escapeHtml(L.fileLevel)}</td></tr>
    ${element?.guid ? `<tr><th>${escapeHtml(copy.model.guid)}</th><td><bdi dir="ltr">${escapeHtml(element.guid)}</bdi></td></tr>` : ""}
    ${!finding.clauseText && finding.clause ? `<tr><th>${escapeHtml(copy.dossier.referenceLabel)}</th><td>${escapeHtml([finding.source, citationOf(finding)].filter(Boolean).join("، "))}</td></tr>` : ""}
    ${action ? `<tr><th>${escapeHtml(copy.results.detail.action)}</th><td>${escapeHtml(action)}</td></tr>` : ""}
  </tbody></table>
  ${
    !finding.clauseText
      ? ""
      : isDataCheck(finding)
        ? `<p class="note">${escapeHtml(finding.clauseText)}</p>`
        : `<blockquote>«${escapeHtml(finding.clauseText)}»<cite>${escapeHtml(citationOf(finding))}</cite></blockquote>`
  }
</article>`;
          })
          .join("");
        const note = groupNote(group) ?? "";
        return `<section><h2>${escapeHtml(copy.results.groups[group.key])} <span class="count">${group.items.length}</span></h2>${
          note ? `<p class="note">${escapeHtml(note)}</p>` : ""
        }${rows}</section>`;
      })
      .join("");
    const documentHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${escapeHtml(copy.report.title)}: ${escapeHtml(run.file.name)}</title>
<style>
body{font-family:"Noto Sans Arabic","Noto Sans",Tahoma,Arial,sans-serif;color:#0f172a;margin:40px auto;max-width:72ch;padding:0 24px;font-size:16px;line-height:1.7}
h1,h2,h3{color:#0f172a;line-height:1.4;font-weight:700}
.brand{margin:0 0 20px;font-weight:700;font-size:18px;color:#1e3a8a}
h1{margin:0;font-size:32px}.file{margin:2px 0 0;color:#475569}
hr{border:0;border-top:1px solid #cbd5e1;margin:20px 0}
dl.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 24px;margin:0}dl.meta dt{font-size:13px;color:#475569}dl.meta dd{margin:0 0 8px;overflow-wrap:anywhere}
h2{font-size:24px;margin:28px 0 6px}.counts span{margin-inline-end:20px;font-weight:700}
section{margin-top:28px;page-break-before:always}section h2{font-size:20px;margin:0;padding-bottom:6px;border-bottom:1px solid #0f172a}.count{color:#475569}
article{padding:14px 0;border-bottom:1px solid #e2e8f0;page-break-inside:avoid}h3{font-size:17px;margin:0 0 8px}.no{color:#1e3a8a;font-variant-numeric:tabular-nums}
.st{font-size:14px;margin-inline-start:8px}.st-fail{color:#dc2626}.st-pass{color:#15803d}.st-unknown{color:#475569}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px 8px;text-align:right;vertical-align:top;border-bottom:1px solid #e2e8f0}th{width:140px;color:#475569;font-weight:400}
td b{font-size:18px;font-variant-numeric:tabular-nums}
blockquote{margin:10px 0 0;padding-inline-start:12px;border-inline-start:3px solid #cbd5e1}cite{display:block;font-style:normal;font-size:13px;color:#475569}
.note{font-size:14px;color:#475569}.foot{margin-top:32px;font-size:14px;color:#475569}
@media print{body{margin:0;max-width:none;font-size:12.5px}}
</style></head><body>
<p class="brand">${escapeHtml(copy.brand.name)}</p>
<h1>${escapeHtml(copy.report.title)}</h1>
<p class="file"><bdi dir="ltr">${escapeHtml(run.file.name)}</bdi></p>
<hr>
<dl class="meta">
<dt>${escapeHtml(copy.results.file)}</dt><dd><bdi dir="ltr">${escapeHtml(run.file.name)}</bdi></dd>
<dt>${escapeHtml(copy.dossier.schemaLabel)}</dt><dd>${escapeHtml(metadata.schema)}</dd>
<dt>${escapeHtml(copy.dossier.elementsLabel)}</dt><dd>${escapeHtml(counted(metadata.elements, ELEMENT_FORMS))}</dd>
<dt>${escapeHtml(L.generated)}</dt><dd>${escapeHtml(generatedAt)}</dd>
<dt>${escapeHtml(L.fingerprint)}</dt><dd><bdi dir="ltr">${escapeHtml(run.file.sha256)}</bdi></dd>
<dt>${escapeHtml(copy.dossier.referenceLabel)}</dt><dd>${escapeHtml(reference)}</dd>
</dl>
<h2>${escapeHtml(copy.report.summary)}</h2>
<p>${escapeHtml(copy.results.scope)}: ${escapeHtml(scopeText)}</p>
<p class="counts"><span>${summary.passed} ${escapeHtml(copy.status.pass)}</span><span>${summary.failed} ${escapeHtml(copy.status.fail)}</span><span>${summary.unknown} ${escapeHtml(copy.status.unknown)}</span></p>
${sections}
<hr>
<p class="foot">${escapeHtml(copy.report.disclaimer)}<br>${escapeHtml(copy.footer.basis)}</p>
</body></html>`;
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mowaem-report-${run.file.name.replace(/\.ifc$/i, "")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(L.downloaded);
  };

  return (
    <main className="rp">
      <div className="rp-tools" role="toolbar" aria-label={L.tools}>
        <Button variant="secondary" onClick={onBack}>
          {copy.report.back}
        </Button>
        <div className="rp-tools__end">
          <button type="button" className="link" onClick={downloadReport}>
            {L.download}
          </button>
          <button type="button" className="btn btn--accent" onClick={() => window.print()}>
            {copy.report.print}
          </button>
        </div>
      </div>

      <article className="rp-sheet" aria-labelledby="rp-title">
        <header className="rp-head">
          <p className="rp-letterhead">
            <BrandMark className="rp-letterhead__mark" />
            <span>{copy.brand.name}</span>
          </p>
          <h1 id="rp-title">{copy.report.title}</h1>
          <p className="rp-head__file">
            <bdi dir="ltr">{run.file.name}</bdi>
          </p>
        </header>

        <dl className="rp-record">
          <div className="rp-record__file">
            <dt>{copy.results.file}</dt>
            <dd>
              <bdi dir="ltr">{run.file.name}</bdi>
            </dd>
          </div>
          <div>
            <dt>{copy.dossier.schemaLabel}</dt>
            <dd>
              <bdi dir="ltr">{metadata.schema}</bdi>
            </dd>
          </div>
          <div>
            <dt>{copy.dossier.elementsLabel}</dt>
            <dd>{counted(metadata.elements, ELEMENT_FORMS)}</dd>
          </div>
          <div>
            <dt>{L.generated}</dt>
            <dd>{generatedAt}</dd>
          </div>
          <div className="rp-record__wide">
            <dt>{L.fingerprint}</dt>
            <dd>
              <bdi dir="ltr" className="rp-hash">
                {run.file.sha256}
              </bdi>
            </dd>
          </div>
          <div className="rp-record__wide">
            <dt>{copy.dossier.referenceLabel}</dt>
            <dd>{reference}</dd>
          </div>
        </dl>

        <section className="rp-summary" aria-labelledby="rp-summary-title">
          <h2 id="rp-summary-title">{copy.report.summary}</h2>
          <p className="rp-summary__scope">
            {copy.results.scope}: <strong>{scopeText}</strong>
          </p>
          <ul className="rp-counts" aria-label={L.counts}>
            <li>
              <StatusMark status="pass" size="large" label={`${summary.passed} ${copy.status.pass}`} />
            </li>
            <li>
              <StatusMark status="fail" size="large" label={`${summary.failed} ${copy.status.fail}`} />
            </li>
            <li>
              <StatusMark status="unknown" size="large" label={`${summary.unknown} ${copy.status.unknown}`} />
            </li>
          </ul>
          {summary.unknown > 0 && <p className="rp-note">{copy.results.groups.unknownNote}</p>}
          {findings.length === 0 && <p className="rp-note">{copy.results.empty}</p>}
        </section>

        {clauseGroups.map((group) => (
          <ReportGroup key={group.key} run={run} group={group} />
        ))}

        {dataGroup && <ReportGroup run={run} group={dataGroup} />}

        <footer className="rp-foot">
          <p className="rp-foot__disclaimer">{copy.report.disclaimer}</p>
          <p className="rp-foot__basis">{copy.footer.basis}</p>
        </footer>
      </article>
    </main>
  );
}
