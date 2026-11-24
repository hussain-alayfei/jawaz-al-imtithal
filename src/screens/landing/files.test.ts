import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_FILES } from "../../content/samples";
import { formatSize } from "./Files";

/* The home page's «ملفات للتجربة» shows each sample's size from samples.ts; it must match the shipped file. */
describe("sample files", () => {
  it.each(SAMPLE_FILES.map((sample) => [sample.id, sample] as const))("%s: size and file name match public/", (_id, sample) => {
    const file = path.join(process.cwd(), "public", sample.url);
    expect(statSync(file).size).toBe(sample.bytes);
    expect(path.basename(sample.url)).toBe(sample.fileName);
  });

  it("formats sizes in megabytes", () => {
    expect(formatSize(882390)).toBe("0.84 ميجابايت");
    expect(formatSize(2380763)).toBe("2.27 ميجابايت");
  });
});
