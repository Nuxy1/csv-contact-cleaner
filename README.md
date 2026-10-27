# CSV Contact Cleaner

Before you import a contact list into a CRM, an email tool or a new database, run it through this. It fixes what can be fixed safely, merges duplicates, and puts everything doubtful in a separate file for a person to check. Nothing is guessed, and every change is counted in a report.

```bash
node bin/clean-csv.js contacts.csv --map "email=Email,phone=Phone,name=Full Name,date=Signed up" --out out
# contacts.csv: 11 read, 6 clean (1 duplicates merged), 4 to check -> out/
```

The input file is never changed. You get three files:

| File | What's in it |
|---|---|
| `clean.csv` | Rows ready to import. Fields are normalised in place, `first_name` and `last_name` are added, and duplicates are merged (with `merged_lines` showing which rows were combined). |
| `needs-review.csv` | Rows a person must look at, each with a `reasons` column, exactly as they were typed. |
| `report.md` | What happened, in counts a client can read. |

## Before and after (from `fixtures/contacts-messy.csv`)

| Before | After |
|---|---|
| `JORDAN EXAMPLE`, `Jordan.Example@Example.com `, `(555) 010-4477`, `10/27/2026` | `Jordan Example`, `jordan.example@example.com`, `+15550104477`, `2026-10-27` |
| A second Jordan row from 2026-09-02 with a note | Merged into the row above: the newest signup wins and the blank Notes cell is filled from the older row |
| `Chen, Wei` (last name first) | `Wei Chen`, first `Wei`, last `Chen` |
| `priya.patel@gmial.com` | `priya.patel@gmail.com` (only unambiguous provider typos) |
| `27.10.2026`, `Oct 3, 2026`, `9/15/26` | `2026-10-27`, `2026-10-03`, `2026-09-15` |
| `+44 20 7946 0958`, `0049 30 1234567` | `+442079460958`, `+49301234567` |
| `not-an-email` | Sent for review: "invalid email" |
| `02/30/2026` | Sent for review: "impossible date" |
| A row with no email or phone | Sent for review: "no email or phone to contact" |
| A stray comma shifting the columns | Sent for review: "1 value(s) past the last column" |

## Options

- `--map kind=Column,...`: which columns hold `email`, `phone`, `name` and `date`. Map only the ones you have; other columns pass through untouched.
- `--country 1`: the country code for national phone numbers (`44` for the UK; a leading trunk `0` is dropped).
- `--dates MDY|DMY`: how to read ambiguous dates like `03/04/2026`. A day over 12, or dots (`27.10.2026`), decides on its own.
- `--out dir`: where the three files go (default `out/`).

Duplicates are rows with the same email, or the same phone when there's no email. The newest by the mapped date wins, and its blank cells are filled from the others.

## Tested

```bash
npm test   # the CSV parser (quotes, newlines in fields, CRLF, BOM), each normaliser, the sample end to end, the CLI
```

Zero dependencies; it needs Node.js 20 or later. The CSV parser follows RFC 4180, so the commas, quotes and line breaks that spreadsheets put inside fields are handled.
