import { useMemo } from "react";
import { ListChecks, Printer } from "lucide-react";
import { BrandMark, Button, Seal, StatusGlyph, StatusMark, Wordmark, statusLabel } from "../brand/ui";
import { copy } from "../content/copy";
import { activityExamples, type Finding } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { ReportProps } from "./types";
import { Bidi } from "./results/Bidi";
import { Measure } from "./results/Measure";
import {
  CLAUSE_FORMS,
  ELEMENT_FORMS,
  citationOf,
  clauseOf,
  counted,
  coverageOf,
  tallyOf,
  elementOf,
  groupFindings,
  splitValue,
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
} as const;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function referenceOf(run: ComplianceRun): string {
  if (run.source === "standard-ifc") return copy.footer.basis;
  return activityExamples.find((item) => item.id === run.activityId)?.rulePack ?? copy.footer.basis;
}

function actionOf(finding: Finding): string | undefined {
  if (finding.status === "pass") return undefined;
  const text = finding.recommendation?.trim();
  if (text) return text;
  return finding.ruleId === "MOMAH-REST-4.5.2-CLADDING" ? copy.results.detail.action452 : undefined;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ReportFinding({ run, finding }: { run: ComplianceRun; finding: Finding }) {
  const clause = clauseOf(finding);
  const element = elementOf(run, finding);
  const action = actionOf(finding);
  return (
    <article className="rp-finding">
      <header className="rp-finding__head">
        {clause.number && <span className="rp-finding__no">{clause.number}</span>}
        <h3>{clause.subject}</h3>
        <StatusMark status={finding.status} />
      </header>

      <Measure finding={finding} prefix="rp" />

      {finding.clauseText && (
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
                {element.name && <bdi>{element.name}</bdi>}
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

export default function Report({ run, onBack, onHome, notify }: ReportProps) {
  const { findings, metadata } = run;
  const summary = tallyOf(run);
  const generatedAt = useMemo(() => formatDate(run.processedAt), [run.processedAt]);
  const groups = useMemo(() => groupFindings(findings), [findings]);
  const coverage = coverageOf(run);
  const reference = referenceOf(run);
  const sealText = `${coverage.verified} من ${coverage.total}`;
  const scopeText = `${coverage.verified} من ${counted(coverage.total, CLAUSE_FORMS)}`;

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
    ${action ? `<tr><th>${escapeHtml(copy.results.detail.action)}</th><td>${escapeHtml(action)}</td></tr>` : ""}
  </tbody></table>
  ${finding.clauseText ? `<blockquote>«${escapeHtml(finding.clauseText)}»<cite>${escapeHtml(citationOf(finding))}</cite></blockquote>` : ""}
</article>`;
          })
          .join("");
        const note =
          group.key === "unknown"
            ? copy.results.groups.unknownNote
            : group.key === "data"
              ? copy.results.groups.dataNote
              : "";
        return `<section><h2>${escapeHtml(copy.results.groups[group.key])} <span class="count">${group.items.length}</span></h2>${
          note ? `<p class="note">${escapeHtml(note)}</p>` : ""
        }${rows}</section>`;
      })
      .join("");
    const documentHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${escapeHtml(copy.report.title)}: ${escapeHtml(run.file.name)}</title>
<style>
body{font-family:"IBM Plex Sans Arabic",Tahoma,Arial,sans-serif;color:#17221d;margin:40px auto;max-width:860px;padding:0 24px;line-height:1.75}
h1,h2,h3{font-family:"Noto Naskh Arabic","Times New Roman",serif;color:#0f3b2e}
h1{margin:0 0 4px;font-size:30px}.brand{font-family:"Noto Naskh Arabic",serif;font-weight:700;font-size:22px;color:#0f3b2e}
.rule{height:5px;border-top:1px solid #b98b2e;border-bottom:1px solid #b98b2e;margin:18px 0}
dl.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 24px;margin:0}dl.meta dt{font-size:12px;color:#4a5560}dl.meta dd{margin:0 0 6px}
.counts span{margin-inline-end:20px}.no{font-variant-numeric:tabular-nums}
section{margin-top:28px;page-break-before:always}h2{font-size:20px;border-bottom:1px solid #b98b2e;padding-bottom:6px}.count{color:#8a6620}
article{padding:12px 0;border-bottom:1px solid #d9d3c6;page-break-inside:avoid}h3{font-size:17px;margin:0 0 6px}
.st{font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;font-size:13px;margin-inline-start:8px}.st-fail{color:#7a1f2b}.st-pass{color:#1e7a50}.st-unknown{color:#4a5560}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:4px 8px;text-align:right;vertical-align:top;border-bottom:1px solid #e8e4da}th{width:140px;color:#4a5560;font-weight:500}
blockquote{margin:8px 0 0;font-family:"Noto Naskh Arabic",serif;color:#0f3b2e}cite{display:block;font-style:normal;font-family:Tahoma,sans-serif;font-size:12px;color:#4a5560}
.note{font-size:13px;color:#55605a}.foot{margin-top:32px;font-size:13px;color:#55605a}
</style></head><body>
<p class="brand">${escapeHtml(copy.brand.name)}</p>
<h1>${escapeHtml(copy.report.title)}</h1>
<div class="rule"></div>
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
<div class="rule"></div>
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
    <div className="rp">
      <header className="rp-bar">
        <Wordmark className="rp-bar__brand" onClick={onHome} />
        <div className="rp-bar__actions">
          <button type="button" className="link" onClick={downloadReport}>
            {L.download}
          </button>
          <Button variant="secondary" size="small" icon={<ListChecks size={18} strokeWidth={1.6} />} onClick={onBack}>
            {copy.report.back}
          </Button>
          <Button
            variant="primary"
            size="small"
            icon={<Printer size={18} strokeWidth={1.6} />}
            onClick={() => window.print()}
          >
            {copy.report.print}
          </Button>
        </div>
      </header>

      <main className="rp-sheet">
        <header className="rp-head">
          <div className="rp-head__text">
            <p className="rp-head__brand">
              <BrandMark className="rp-head__mark" />
              <span>{copy.brand.name}</span>
            </p>
            <h1>{copy.report.title}</h1>
            <p className="rp-head__file">
              <bdi dir="ltr">{run.file.name}</bdi>
            </p>
          </div>
          <Seal
            className="rp-seal"
            size={136}
            main={sealText}
            label={`${copy.seal.top}، ${copy.results.scope} ${scopeText}`}
          />
        </header>

        <span className="gold-rule" aria-hidden="true" />

        <dl className="rp-record">
          <div>
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
          <ul className="rp-counts">
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

        {groups.map((group) => (
          <section key={group.key} className={`rp-group rp-group--${group.key}`} aria-labelledby={`rp-g-${group.key}`}>
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
            {group.key === "unknown" && <p className="rp-note">{copy.results.groups.unknownNote}</p>}
            {group.key === "data" && <p className="rp-note">{copy.results.groups.dataNote}</p>}
            {group.items.map((finding) => (
              <ReportFinding key={finding.ruleId} run={run} finding={finding} />
            ))}
          </section>
        ))}

        <footer className="rp-foot">
          <span className="gold-rule" aria-hidden="true" />
          <p className="rp-foot__disclaimer">{copy.report.disclaimer}</p>
          <p className="rp-foot__basis">{copy.footer.basis}</p>
        </footer>
      </main>
    </div>
  );
}
