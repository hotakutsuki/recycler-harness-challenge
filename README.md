# RecycleOps

Turns a photo of a handwritten weighing document into checked, structured records —
and into the report a recycling yard reconstructs by hand every month: what material
came in, what money went out, and who is still owed.

Small and mid-sized recycling yards in Ecuador run on paper. A supplier arrives with a
handcart and the weigher fills in a numbered card, free-form, one line per material. A
truck arrives and is weighed full, then empty, and a pre-printed receipt records the
difference. Someone later re-types all of it into a stack of spreadsheets. That
re-typing is where money quietly goes missing, and it is why those yards cannot move
onto software at all: their history is in notebooks.

**Who it is for:** the yard owner or the person in the office. Not technical, works in
Spanish, photographs the day's paper with a phone.

## Running it

Node 20+ required.

```bash
npm install
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run demo             # loads the 27 real documents through the whole pipeline
npm run dev:demo         # http://localhost:3000
```

That runs **without an API key**: `EXTRACTOR=stub` replays the reading from the ground
truth instead of calling the model. To read documents with the model, put a funded key
in `.env` and use `npm run dev` instead.

`npm run demo` is not a database fixture — it takes the same code path an upload does,
so the inbox and the report show what the checks actually produced.

### In a container

```bash
docker compose up --build        # http://localhost:3000, stubbed by default
ANTHROPIC_API_KEY=sk-... EXTRACTOR= docker compose up --build
```

The container migrates the database and seeds the catalog on first boot. Photos and the
database live in `./data` on the host, so they survive it.

### The screens

| | |
|---|---|
| `/capture` | phone capture; each document shows its own state as it is read |
| `/review` | the inbox, ordered by what needs a person first |
| `/review/[id]` | the photo beside what was read, the failed checks, and the edit form |
| `/reports` | material in, money out, balances owed, with filters and charts |
| `/settings` | the yard's materials, prices, price bands and check settings |

### Commands

| | |
|---|---|
| `npm run dev` · `dev:demo` · `dev:lan` | the app; `dev:lan` binds 0.0.0.0 for a phone on the same network |
| `npm test` | unit tests over the pure parts — no API calls, no key needed |
| `npm run typecheck` | |
| `npm run eval` | measures the harness against the 27 documents; writes `evals/REPORT.md` |
| `npm run eval:stub` | the same run without the model — checks the runner, not the reading |
| `npm run retention` | deletes photos past the retention window (`--dry` to list them) |

## How it works

The model transcribes. It does not calculate and it does not judge — every number that
matters is recomputed in TypeScript. Asking a model to verify its own sums invites it
to adjust a digit until they add up, and a fabricated number that passes every check is
the most expensive failure this system could produce.

```
photo → extract (vision, strict schema, the model says which document this is)
      → normalize (materials, prices, the counter's rounding rule)
      → validate (arithmetic, settlement, plausibility)
      → second reading of whatever failed, blind to what would pass
      → human review → committed → report
```

Two kinds of paper go through one pipeline: a handwritten **tarjeta** (one line per
material, free-form, no grid) and a pre-printed **comprobante** for truck loads
(weighed full, weighed empty, the difference is what gets paid for, and the unit price
is never written down). They arrive mixed, because a yard photographs the day's paper
in one go and does not sort it first.

Three rules the real paperwork taught us, none of which we would have invented: amounts
are truncated **down** to five cents; a purchase and a payment are different events,
because the yard often pays part now and carries the rest; and a crossed-out total with
the correction written above it is routine, not exceptional.

Full reasoning, the ten checks, and the trade-offs are in [DESIGN.md](./DESIGN.md).

## What is real and what is not

**Real, end to end:** capture from a phone, classification and extraction, material and
price normalization, the ten checks, the second reading, the review screen with its
audit trail, committing to the ledger, the report with filters and charts, the
configuration screen, and photo retention.

| Stubbed or simplified | Why, and what it would be |
|---|---|
| **`EXTRACTOR=stub`** replays the ground truth instead of calling the model | The API key available during development had no credit. The stub only answers for photos byte-identical to the dataset images and refuses anything else; every screen it feeds carries a badge. The real call is `harness/extract.ts`, used whenever the stub is off. |
| **The worker runs in-process**, not on a queue | Enough for one yard and one person at a counter. Rows left mid-extraction by a restart are re-queued at boot. A production version would use a real queue. |
| **Photos are stored on local disk** | Behind a two-method interface (`save`, `url`), so object storage is a one-file change. |
| **SQLite** | One line of Prisma config away from Postgres. |
| **No scheduler** | `npm run retention` is a script for cron. The app does not pretend to run it itself. |
| **No authentication, single yard** | Out of scope for a vertical slice. The data model does not assume one tenant. |
| **`counterparty` is always empty in the shipped dataset** | Names are masked in the published photos, so there is nothing to read. The field and the supplier filter work on unmasked paper. |
| **Mock product screens were dropped** | An earlier plan had a dashboard, suppliers and sales as mock context. They were cut: they would add surface without adding evidence. |
| **No deployment** | There is no hosted demo and no demo video. This repository is the whole delivery. |

## Evaluation

Quality is measured against **27 real documents** from a yard in Quito — a week of its
paperwork, photographed with a phone: tarjetas and comprobantes mixed, at angles, under
shadow and yellow light, some creased. The company logo and every person's name are
masked; weights, prices, totals and margin notes are untouched, because those are what
the harness is judged on.

The headline metric is the **silent error rate**: a field committed with a wrong value
and *no* flag. That is the error that actually costs a yard money. Alongside it:
document-type accuracy, field accuracy, whether a crossed-out value was read as the
correction rather than the struck figure, whether a number was invented where the ink
is unreadable, and the false-flag rate on documents that are perfectly fine.

### Results

Claude Opus 5 reading all 27 documents, measured against the hand-transcribed ground
truth. Full detail, field by field, in [`evals/REPORT.md`](./evals/REPORT.md).

| | |
|---|---|
| **Silent error rate** — a wrong value with no flag at all | **3.7 %** (1 of 27) |
| Wrong, but only a warning — visible, still committable | 3.7 % (1 of 27) |
| Field accuracy | 94.5 % (258 of 273) |
| Document type read correctly | 100 % |
| Crossed-out values read as the correction | 71.4 % (10 of 14) |
| Time per document | 18.5 s · ~5,900 input tokens |

The model misreads things. That is expected and it is the reason the checks exist: of
the 15 fields it got wrong, 14 raised something a person has to look at. The one that
did not is a day read as the 10th where the paper says the 18th — an ambiguous digit
that no arithmetic can catch. The check written for exactly that case (comparing a
receipt's date against the folios either side) needed two neighbouring receipts and had
only one at that point in the run.

**The weakest number is the crossed-out one.** In four of fourteen corrected values the
model returned the abandoned figure rather than the correction. On this paper a struck
total is routine, so that is the next thing to work on.

Three of the checks in this repository exist because of what this run exposed: a year
misread by a decade that every sum still balanced, a total returned with the weight left
out entirely, and a quantity misread by a factor of ten on a line with no unit price to
multiply. Two of the "silent errors" in the first run turned out to be errors in the
ground truth, not the model — enlarging the photo settled it in the model's favour, and
the transcription says so.

## Known limitations

- **Extraction quality is unmeasured.** Everything downstream of the reading is tested;
  the reading itself is not.
- **The ground truth was transcribed by two readers who both saw the arithmetic.** The
  checks are independent evidence, but a shared misreading on a field no check covers —
  a date, a folio — would go unnoticed.
- **Some annotations are inferred, not confirmed.** "Debo", "Abono" and "Transf." are
  read as a balance owed, a deposit and a transfer. The arithmetic supports it and the
  yard owner agrees, but nobody has asked the weigher who wrote them.
- **Units are configuration, not observation.** The paper almost never states one.
- **The settlement tolerance of one dollar** comes from a single observation: a balance
  of 350,15 settled as a round 350.
- **A balance larger than the purchase** is treated as the supplier's running account
  rather than that purchase's remainder, and reported separately. That is inference from
  two documents.
- **27 documents is a small set**, all from one yard and mostly from one week. Another
  yard's handwriting is the obvious next test.
