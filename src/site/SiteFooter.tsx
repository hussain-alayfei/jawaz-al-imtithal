import { useState } from "react";
import { copy } from "../content/copy";
import { SAMPLE_FILES } from "../content/samples";
import type { NavTarget } from "./SiteHeader";
import "./site.css";

const REQUIREMENTS_URL = "https://momah.gov.sa/ar/node/14955";

type Item = { label: string; href: string; target?: NavTarget; download?: string; external?: boolean };

/** Apple-style footer: fine print first, then a small link directory, then the legal line. */
export function SiteFooter({ onNavigate }: { onNavigate: (target: NavTarget) => void }) {
  const [openCol, setOpenCol] = useState<number>();
  const year = new Date().getFullYear();

  const columns: { title: string; items: Item[] }[] = [
    {
      title: copy.web.footer.service,
      items: [
        { label: copy.web.nav.cta, href: "#/check", target: "check" },
        { label: copy.web.nav.model, href: "#/model", target: "model" },
        { label: copy.web.nav.rules, href: "#/clauses", target: "clauses" },
      ],
    },
    {
      title: copy.web.footer.reference,
      items: [{ label: copy.site.footer.referenceLink, href: REQUIREMENTS_URL, external: true }],
    },
    {
      title: copy.web.footer.files,
      items: SAMPLE_FILES.map((sample) => ({ label: sample.label, href: sample.url, download: sample.fileName })),
    },
    {
      title: copy.web.footer.twin,
      items: [{ label: copy.web.twin.link, href: "#/twin", target: "twin" }],
    },
  ];

  return (
    <footer className="gf">
      <div className="gf__inner">
        <div className="gf__fine">
          {copy.web.footer.fine.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <nav className="gf__dir" aria-label={copy.web.nav.label}>
          {columns.map((column, index) => {
            const expanded = openCol === index;
            const listId = `gf-col-${index}`;
            return (
              <div className={`gf__col${expanded ? " is-open" : ""}`} key={column.title}>
                <h2 className="gf__title">
                  <button
                    type="button"
                    className="gf__toggle"
                    aria-expanded={expanded}
                    aria-controls={listId}
                    onClick={() => setOpenCol(expanded ? undefined : index)}
                  >
                    {column.title}
                  </button>
                </h2>
                <ul id={listId} className="gf__list">
                  {column.items.map((item) => (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        download={item.download}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noreferrer" : undefined}
                        onClick={
                          item.target
                            ? (event) => {
                                event.preventDefault();
                                onNavigate(item.target!);
                              }
                            : undefined
                        }
                      >
                        {item.label}
                        {item.external && <span className="sr-only">، يفتح في صفحة جديدة</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="gf__legal">
          <p>
            © <span className="num">{year}</span> {copy.brand.name}. {copy.web.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
