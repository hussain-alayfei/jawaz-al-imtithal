import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Verify that retired project branding never reappears in checked-in sources,
// BIM samples, generated test fixtures, or documentation.
const retiredLatin = String.fromCharCode(109, 105, 121, 97, 114);
const retiredArabic = String.fromCodePoint(0x645, 0x650, 0x639, 0x64a, 0x627, 0x631);
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const invalid = [];
for (const file of files) {
  if (file.includes(retiredLatin)) invalid.push(file + " (filename)");
  const content = readFileSync(file, "utf8");
  if (content.toLowerCase().includes(retiredLatin) || content.includes(retiredArabic)) {
    invalid.push(file);
  }
}
if (invalid.length) {
  console.error("Retired project branding found in:\n" + invalid.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Brand audit passed: " + files.length + " tracked files checked; current name: موائم.");
}
