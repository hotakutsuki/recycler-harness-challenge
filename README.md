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
| `npm run eval` | the evaluation suite against the 16 sheets in `evals/dataset` |

Photos and the SQLite database are written to `./data`, which is not in version control.

## Evaluation

Quality is measured against 16 sheets written and photographed by hand, and they are in
this repo — photos and ground truth both — so `npm run eval` reproduces the numbers.

Eight are clean and eight carry a seeded problem: a wrong amount, a detail total outside
tolerance, a price that diverges from the catalog, an unknown material, an illegible
field, a truck subtraction that does not add up, a deduction that does not add up, and a
duplicate. The half-and-half split is deliberate — with only broken sheets you measure
detection and never see the false alarms on good sheets, which is what would make the
system unbearable for the person doing the reviewing.

The headline metric is the **silent error rate**: fields committed with a wrong value and
*no* flag. That is the error that actually costs a yard money, and it is what every
change to the prompt, the model or the checks is judged against.

These are synthetic sheets written by us, modelled on how an Ecuadorian yard actually
writes: free-form on blank paper, no printed form, mixed units, local abbreviations.
No real yard's data is in this repository.

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
