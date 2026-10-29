// RFC 4180 CSV: quoted fields, "" inside quotes, commas and newlines inside quotes, CRLF or LF, a UTF-8 BOM.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field (an unclosed quote)");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

// Rows as objects keyed by the header row; a short row is padded, an over-long one is reported.
export function toRecords(rows) {
  const [header = [], ...body] = rows;
  const names = header.map((name) => name.trim());
  return body.map((values, index) => {
    const record = {};
    names.forEach((name, column) => (record[name] = (values[column] ?? "").trim()));
    if (values.length > names.length) record.__extra = values.slice(names.length);
    record.__line = index + 2;
    return record;
  });
}

// A cell Excel or Sheets would run as a formula (= + - @ tab or CR first) gets a leading ' so it opens as text
// (CSV injection: "=HYPERLINK(...)" typed into a signup form). Plain numbers like -12.50 or +15550104477 stay as they are.
export const formulaSafe = (text) => (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text) ? `'${text}` : text);

export function stringifyCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = formulaSafe(String(value ?? ""));
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\r\n") + "\r\n";
}
