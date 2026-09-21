# RecycleOps

Turns a photo of a handwritten weighing sheet into checked, structured records — and
into the two reports a recycling yard actually needs: inventory by material, and cash
for the month.

Small and mid-sized recycling yards in Ecuador run on paper. A truck is weighed, the
load is sorted, and a weigher writes each material, its weight and any deductions on a
sheet by hand. Someone later re-types all of it into a stack of spreadsheets. That
re-typing is where money quietly goes missing, and it is the reason those yards cannot
move onto software at all: their history is in notebooks.

**Who it is for:** the yard owner or office clerk. Not technical, works in Spanish,
photographs sheets with a phone.

> **Status: in development.** The harness core is being built bottom-up — schema and
> pure functions first, then the model call, then the UI. See `DESIGN.md` for the full
> design, and the section below for what actually runs today.

## What is real, what is not

| | |
|---|---|
| **Real** | Sheet digitization end to end: capture → extraction → normalization → validation → human review → committed records → inventory and cash reports. Material and price configuration. |
| **Mock** | Dashboard, suppliers, sales, scale service, cash boxes, discounts. Marked "demo" in the interface — they exist to show where the harness sits in the wider product. |
| **Out of scope** | Live scale integration (RS-232 / Ethernet), other document types, auth, multi-tenancy. |

## Running it

Requires Node 20+ and an Anthropic API key.

```bash
npm install
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run dev              # http://localhost:3000, reads documents with the model
```

### Without an API key

Every screen works without one. `EXTRACTOR=stub` replays the reading from the
ground truth instead of calling the model:

```bash
npm run demo             # loads the 27 documents through the whole pipeline
npm run dev:demo         # the app, with the stub
```

`npm run demo` is not a database fixture — it runs the same pipeline an upload
does, so what you see in the review screen and the report is what the checks
actually produced. The stub only answers for photos that are byte-identical to
the dataset images and refuses anything else, and every screen it feeds says so.

| Screen | |
|---|---|
| `/capturar` | phone capture; each sheet shows its own state as it is read |
| `/revisar` | the inbox, ordered by what needs a person first |
| `/revisar/[id]` | the photo beside what was read, with the failed checks |
| `/reportes` | material in, money out, balances still owed |
| `/configuracion` | the yard's materials, prices and check settings |

No Docker needed. There is no hosted demo and no demo video: this repository is the
whole delivery.

| Command | |
|---|---|
| `npm run dev` | the app |
| `npm test` | unit tests for the pure parts (no API calls, no key needed) |
| `npm run typecheck` | |
| `npm run eval` | the evaluation suite against the 16 sheets in `evals/dataset` |

Photos and the SQLite database are written to `./data`, which is not in version control.

## Evaluation

Quality is measured against **27 real documents** from a recycling yard in Quito — a
week of its paperwork, photographed with a phone: tarjetas and comprobantes mixed, at
angles, under shadow and yellow light, some creased.

The company logo and every person's name are masked in the copies published here.
Weights, prices, totals and the margin notes are untouched, because those are what the
harness is judged on.

The headline metric is the **silent error rate**: a field committed with a wrong value
and *no* flag. That is the error that actually costs a yard money, and it is what every
change to the prompt, the model or the checks is judged against. Alongside it: document
type accuracy, field accuracy, whether a corrected total is read as the correction rather
than the struck-out figure, and the false-flag rate on documents that are perfectly fine.

## How it works, briefly

The model transcribes. It does not calculate and it does not judge — every number that
matters is recomputed in TypeScript. Asking a model to verify its own sums invites it to
adjust a digit until the total works out, and a fabricated number that passes every check
is the most expensive failure this system could produce.

```
photo → extract (vision, strict schema, model says which document this is)
      → normalize (materials, prices, the counter's rounding rule)
      → validate (arithmetic + plausibility) → human review → committed → report
```

Two kinds of paper go through one pipeline: a handwritten **tarjeta** (one line per
material, free-form) and a pre-printed **comprobante** for truck loads (weighed full,
weighed empty, the difference is what gets paid for). They arrive mixed, because a yard
photographs the day's paper in one go and does not sort it first.

`harness/` is plain TypeScript with no Next.js imports, so the app and the eval runner
execute identical code. Full architecture, the nine validation checks, and the reasoning
behind the trade-offs are in [DESIGN.md](./DESIGN.md).
