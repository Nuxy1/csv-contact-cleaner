import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanRecords, toRows } from "../src/clean.js";
import { parseCsv, stringifyCsv, toRecords } from "../src/csv.js";
import { date, email, name, phone } from "../src/normalize.js";

const MAP = { email: "Email", phone: "Phone", name: "Full Name", date: "Signed up" };
const fixture = readFileSync(new URL("../fixtures/contacts-messy.csv", import.meta.url), "utf8");

test("csv: quotes, doubled quotes, newlines in quotes, CRLF, BOM, blank lines", () => {
  const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"line\nbreak",2\n';
  assert.deepEqual(parseCsv(text), [["a", "b"], ["x, y", 'say "hi"'], ["line\nbreak", "2"]]);
  assert.throws(() => parseCsv('a\n"open'), /unclosed quote/);
  const rows = [["a", "b,c", 'd"e', "f\ng"]];
  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
});

test("normalisers", () => {
  assert.deepEqual(email(" Jordan.Example@Example.com "), { value: "jordan.example@example.com", ok: true, note: "email tidied" });
  assert.equal(email("priya@gmial.com").value, "priya@gmail.com");
  assert.equal(email("not-an-email").ok, false);
  assert.equal(phone("(555) 010-4477").value, "+15550104477");
  assert.equal(phone("0049 30 1234567").value, "+49301234567");
  assert.equal(phone("020 7946 0958", "44").value, "+442079460958");
  assert.equal(phone("12345").ok, false);
  assert.deepEqual([name("JAN VAN DER BERG").first, name("JAN VAN DER BERG").last], ["Jan", "van der Berg"]);
  assert.deepEqual([name("Chen, Wei").first, name("Chen, Wei").last], ["Wei", "Chen"]);
  assert.equal(name("Sam Rivers, Jr.").value, "Sam Rivers, Jr.");
  assert.equal(name("McKenzie O'Hara").value, "McKenzie O'Hara");
  assert.equal(date("10/27/2026").value, "2026-10-27");
  assert.equal(date("27.10.2026").value, "2026-10-27");
  assert.equal(date("03/04/2026", "DMY").value, "2026-04-03");
  assert.equal(date("Oct 3, 2026").value, "2026-10-03");
  assert.equal(date("9/15/26").value, "2026-09-15");
  assert.equal(date("02/30/2026").ok, false);
  assert.equal(date("soon").ok, false);
});

test("the messy sample: what is cleaned, merged and set aside", () => {
  const { clean, review, report } = cleanRecords(toRecords(parseCsv(fixture)), { map: MAP });
  assert.deepEqual(report, {
    input: 11, clean: 6, review: 4, duplicatesMerged: 1,
    changes: { "email tidied": 2, "phone to E.164": 6, "name re-cased": 4, "date to ISO": 5, "name was last, first": 1 },
  });
  const jordan = clean.find((r) => r.Email === "jordan.example@example.com");
  assert.equal(jordan["Signed up"], "2026-10-27"); // (the newer of the two signups won)
  assert.equal(jordan.Plan, "Pro");
  assert.equal(jordan.Notes, "first signup, upgraded later"); // (a blank filled from the older row)
  assert.equal(jordan.merged_lines, "2 3");
  assert.deepEqual(review.map((r) => r.reasons), [
    'Email: invalid email ("not-an-email")',
    "no email or phone to contact",
    'Signed up: impossible date ("02/30/2026")',
    "1 value(s) past the last column (a stray comma?)",
  ]);
  // nothing is guessed: a row sent for review keeps exactly what was typed
  assert.equal(review[0].Phone, "555 010 7731");
});

test("rows out keep the original column order, then added columns", () => {
  const { clean } = cleanRecords(toRecords(parseCsv(fixture)), { map: MAP });
  const [header] = toRows(clean, ["Full Name", "Email", "Phone", "Signed up", "Plan", "Notes"]);
  assert.deepEqual(header, ["Full Name", "Email", "Phone", "Signed up", "Plan", "Notes", "first_name", "last_name", "merged_lines"]);
});

test("cli: writes clean.csv, needs-review.csv and report.md; refuses an unknown column", () => {
  const out = mkdtempSync(join(tmpdir(), "csv-cleaner-"));
  const bin = fileURLToPath(new URL("../bin/clean-csv.js", import.meta.url));
  const input = fileURLToPath(new URL("../fixtures/contacts-messy.csv", import.meta.url));
  const said = execFileSync(process.execPath, [bin, input, "--map", "email=Email,phone=Phone,name=Full Name,date=Signed up", "--out", out], { encoding: "utf8" });
  assert.match(said, /11 read, 6 clean \(1 duplicates merged\), 4 to check/);
  assert.equal(parseCsv(readFileSync(join(out, "clean.csv"), "utf8")).length, 7);
  assert.equal(parseCsv(readFileSync(join(out, "needs-review.csv"), "utf8")).length, 5);
  assert.match(readFileSync(join(out, "report.md"), "utf8"), /Duplicates merged into another row \| 1 \|/);
  assert.throws(() => execFileSync(process.execPath, [bin, input, "--map", "email=E-mail", "--out", out], { stdio: "pipe" }), /no such column/);
});
