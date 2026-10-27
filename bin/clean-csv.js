#!/usr/bin/env node
// node bin/clean-csv.js <input.csv> --map email=Email,phone=Phone,name="Full Name",date="Signed up" [--country 1] [--dates MDY|DMY] [--out dir]
// Writes <out>/clean.csv, needs-review.csv and report.md (default out: ./out). The input file is never changed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { cleanRecords, reportMarkdown, toRows } from "../src/clean.js";
import { parseCsv, stringifyCsv, toRecords } from "../src/csv.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { map: { type: "string" }, country: { type: "string", default: "1" }, dates: { type: "string", default: "MDY" }, out: { type: "string", default: "out" } },
});
const input = positionals[0];
if (!input || !values.map) {
  console.error('usage: node bin/clean-csv.js <input.csv> --map email=Email,phone=Phone,name="Full Name",date="Signed up" [--country 1] [--dates MDY|DMY] [--out dir]');
  process.exit(2);
}
const map = Object.fromEntries(values.map.split(",").map((pair) => pair.split("=").map((part) => part.trim())));
const rows = parseCsv(readFileSync(input, "utf8"));
const header = (rows[0] ?? []).map((name) => name.trim());
for (const [kind, column] of Object.entries(map)) {
  if (!header.includes(column)) {
    console.error(`--map ${kind}=${column}: no such column. Columns are: ${header.join(", ")}`);
    process.exit(2);
  }
}
const { clean, review, report } = cleanRecords(toRecords(rows), { map, countryCode: values.country, dateOrder: values.dates.toUpperCase() });
mkdirSync(values.out, { recursive: true });
const files = { "Clean rows": join(values.out, "clean.csv"), "Rows to check": join(values.out, "needs-review.csv"), "This report": join(values.out, "report.md") };
writeFileSync(files["Clean rows"], stringifyCsv(toRows(clean, header)));
writeFileSync(files["Rows to check"], stringifyCsv(toRows(review, header)));
writeFileSync(files["This report"], reportMarkdown(report, files));
console.log(`${basename(input)}: ${report.input} read, ${report.clean} clean (${report.duplicatesMerged} duplicates merged), ${report.review} to check -> ${values.out}/`);
