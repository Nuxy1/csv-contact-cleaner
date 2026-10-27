import * as normalize from "./normalize.js";

// Cleans contact-style records.
//   map: which source column holds each kind of field, e.g. { email: "E-mail", phone: "Mobile", name: "Full Name", date: "Signed up" }
//   countryCode: for national phone numbers ("1"); dateOrder: "MDY" or "DMY" for ambiguous dates like 03/04/2026
// Returns { clean, review, report }:
//   clean   records ready to import: fields normalised in place (+ first_name / last_name when a name is mapped),
//           duplicates (same email, else same phone) merged into one, the newest by `date` winning and blanks filled
//           from the others
//   review  records a person must look at, each with `reasons` (nothing guessed: an invalid email stays as typed)
//   report  counts of what happened, for the client
export function cleanRecords(records, { map = {}, countryCode = "1", dateOrder = "MDY" } = {}) {
  const notes = {};
  const count = (note) => note && (notes[note] = (notes[note] ?? 0) + 1);
  const review = [];
  const candidates = [];

  for (const source of records) {
    const record = { ...source };
    const reasons = [];
    const done = [];
    if (record.__extra) reasons.push(`${record.__extra.length} value(s) past the last column (a stray comma?)`);
    for (const [kind, column] of Object.entries(map)) {
      if (!(column in record)) continue;
      const result = kind === "phone" ? normalize.phone(record[column], countryCode)
        : kind === "date" ? normalize.date(record[column], dateOrder)
        : normalize[kind]?.(record[column]);
      if (!result) continue;
      if (!result.ok) {
        reasons.push(`${column}: ${result.note} ("${record[column]}")`);
        continue;
      }
      record[column] = result.value;
      done.push(result.note);
      if (kind === "name") {
        record.first_name = result.first;
        record.last_name = result.last;
      }
    }
    const reachable = (map.email && record[map.email]) || (map.phone && record[map.phone]);
    if (!reachable && (map.email || map.phone)) reasons.push("no email or phone to contact");
    if (reasons.length) {
      review.push({ ...source, reasons: reasons.join("; ") });
    } else {
      done.forEach(count); // (only what reaches the clean file is counted as changed)
      candidates.push(record);
    }
  }

  // duplicates: the same email, or (no email) the same phone
  const groups = new Map();
  for (const record of candidates) {
    const key = (map.email && record[map.email]) ? `e:${record[map.email]}` : `p:${record[map.phone]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const clean = [];
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      clean.push(group[0]);
      continue;
    }
    // newest first (ISO dates sort as text; a missing date sorts last), then later lines first
    group.sort((a, b) => String(b[map.date] ?? "").localeCompare(String(a[map.date] ?? "")) || b.__line - a.__line);
    const winner = { ...group[0] };
    for (const other of group.slice(1)) {
      for (const [column, value] of Object.entries(other)) {
        if ((winner[column] === "" || winner[column] === undefined) && value !== "") winner[column] = value;
      }
    }
    winner.merged_lines = group.map((record) => record.__line).sort((a, b) => a - b).join(" ");
    merged += group.length - 1;
    clean.push(winner);
  }
  clean.sort((a, b) => a.__line - b.__line);

  return {
    clean,
    review,
    report: { input: records.length, clean: clean.length, review: review.length, duplicatesMerged: merged, changes: notes },
  };
}

// Records back to rows: the original columns in their order, then any added ones.
export function toRows(records, header) {
  const extra = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!key.startsWith("__") && !header.includes(key) && !extra.includes(key)) extra.push(key);
    }
  }
  const columns = [...header, ...extra];
  return [columns, ...records.map((record) => columns.map((column) => record[column] ?? ""))];
}

export function reportMarkdown(report, files) {
  const lines = [
    "# Clean-up report",
    "",
    "| | Rows |",
    "|---|---|",
    `| Read | ${report.input} |`,
    `| Clean, ready to import | ${report.clean} |`,
    `| Duplicates merged into another row | ${report.duplicatesMerged} |`,
    `| Need a person to check | ${report.review} |`,
    "",
    "## Changes made",
    "",
    ...(Object.keys(report.changes).length ? Object.entries(report.changes).map(([note, n]) => `- ${note}: ${n}`) : ["- none"]),
    "",
    "## Files",
    "",
    ...Object.entries(files).map(([what, path]) => `- ${what}: \`${path}\``),
    "",
  ];
  return lines.join("\n");
}
