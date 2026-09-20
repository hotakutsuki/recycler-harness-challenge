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
cp .env.example .env     # add your ANTHROPIC_API_KEY
npm run dev              # http://localhost:3000
```

No Docker needed. A `docker compose up` path exists for a production-like check, with
`./data` mounted from the host — the same image that would be deployed.

| Command | |
|---|---|
| `npm run dev` | the app |
| `npm test` | unit tests for the pure parts (no API calls, no key needed) |
| `npm run typecheck` | |
| `npm run eval` | the evaluation suite — needs the dataset, see below |

Photos and the SQLite database are written to `./data`, which is not in version control.

## The evaluation dataset is not in this repository

Quality is measured against 16 sheets written and photographed by hand: eight clean and
eight with a seeded problem (a wrong amount, a total outside tolerance, an unknown
material, an illegible field, a duplicate, and so on). The headline metric is the
**silent error rate** — fields committed with a wrong value and *no* flag, which is the
kind of error that actually costs a yard money.

The runner (`evals/run.ts`) and the results (`evals/REPORT.md`) are committed. The photos
and their ground truth are not: they live outside the repo, and the runner reads them
from `EVAL_DATASET_DIR`. So the method and the numbers are inspectable, but a reviewer
cannot re-run them. That is a deliberate trade, and it is stated here rather than hidden.

## How it works, briefly

The model transcribes. It does not calculate and it does not judge — every number that
matters is recomputed in TypeScript. Asking a model to verify its own sums invites it to
adjust a digit until the total works out, and a fabricated number that passes every check
is the most expensive failure this system could produce.

```
photo → extract (vision, strict schema) → normalize (units, material aliases)
      → validate (arithmetic + plausibility) → human review → committed → reports
```

`harness/` is plain TypeScript with no Next.js imports, so the app and the eval runner
execute identical code. Full architecture, the nine validation checks, and the reasoning
behind the trade-offs are in [DESIGN.md](./DESIGN.md).
