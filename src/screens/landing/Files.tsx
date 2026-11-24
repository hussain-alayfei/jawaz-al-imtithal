import { copy } from "../../content/copy";
import { SAMPLE_FILES, type SampleId } from "../../content/samples";
import { Latin } from "./Latin";
import { follow } from "./follow";
import { reveal, twoDigits } from "./motion";
import { SectionHead } from "./SectionHead";

/** "0.84 ميجابايت": the size in binary megabytes, two decimals below 10. */
export function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes < 10 ? 2 : 1)} ${copy.web.files.megabytes}`;
}

/** «ملفات للتجربة»: every ready sample as one row between thin rules: its number, its name and what it
    shows, the file's name and size, and two actions: download the file itself (a real link with the
    download attribute), or open the check with it chosen (the same route as the footer's sample links:
    the review step, nothing runs until «بدء الفحص»). */
export function Files({ onSample }: { onSample: (id: SampleId) => void }) {
  const { files, labels } = copy.web;
  return (
    <section id="home-files" tabIndex={-1} className="hm-section hm-files" aria-labelledby="hm-files-title">
      <div className="hm-wide">
        <SectionHead n={5} label={labels.files} id="hm-files-title" title={files.title} lead={<Latin text={files.sub} />} />

        <ol className="hm-files__list" role="list" aria-label={files.listLabel}>
          {SAMPLE_FILES.map((sample, index) => (
            <li key={sample.id} className="hm-file" {...reveal("up", index * 0.75)}>
              <span className="hm-file__no num" aria-hidden="true">
                {twoDigits(index + 1)}
              </span>
              <div className="hm-file__main">
                <h3 className="hm-file__title">
                  <Latin text={sample.label} />
                </h3>
                <p className="hm-file__about">
                  <Latin text={sample.about} />
                </p>
              </div>
              <p className="hm-file__meta">
                <bdi dir="ltr" className="hm-file__name">
                  {sample.fileName}
                </bdi>
                <span className="hm-file__size num">
                  <span className="sr-only">{files.size}: </span>
                  {formatSize(sample.bytes)}
                </span>
              </p>
              <div className="hm-file__actions">
                <a className="btn btn--secondary hm-file__download" href={sample.url} download={sample.fileName}>
                  {files.download}
                  <span className="sr-only">: {sample.label}</span>
                </a>
                <a
                  className="link link--more link-draw hm-file__check"
                  href={`#/check?sample=${sample.id}`}
                  onClick={follow(() => onSample(sample.id))}
                >
                  <span>{files.check}</span>
                  <span className="sr-only">: {sample.label}</span>
                </a>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
