# Design Doc — Weighing-Sheet Digitizer for Recycling Yards

> **Status:** Draft v0.4 (2026-09-21). Items marked **[ASSUMPTION]** are placeholders until real documents from a partner recycling yard arrive.
> Product name: *RecycleOps*.

---

## 1. Problem thesis

**Who.** Small and mid-sized recycling yards in Ecuador (paper, cardboard, plastics, ferrous and non-ferrous scrap). They buy material from collectors and trucks, sort it, store it, and resell it. Some also charge for use of their truck scale.

**How they work today.** Everything is on paper and in spreadsheets, and there are two kinds of paper. We have 27 real documents from one yard in Quito, all from a single week:

- **Tarjeta** — a numbered green card for walk-in suppliers arriving with a handcart or a few sacks. The weigher writes one line per material, free-form on blank space: quantity, unit price, amount. Then a total, and often what was paid and what is still owed. No grid, no columns, three pen colours on the same card.
- **Comprobante de ingreso** — a pre-printed receipt for truck loads. The truck is weighed full (*E*, entero), then empty (*S*, solo camión); the difference is the net (*N*). Deductions come off that ("− 80, 2 tanques filtros"), and one total is paid for the whole load. **The unit price is never written down.**
- Both end the same way for the business: material came in and money went out — often only part of the money, because the rest is carried as a debt to the supplier.
- Someone later re-types all of it into several Excel files to get cash reports and current inventory.

**What it costs.**
- Hours of manual data entry per week, done late and in batches.
- Typing and arithmetic errors that directly change **money paid** and **inventory on hand**, and are rarely caught.
- No trustworthy "current inventory" or "cash this month" without a manual reconciliation.
- **For us as a vendor:** this paper backlog is the main barrier to adopting a proper yard-management system. A yard won't switch if its history stays on paper.

**Why an AI harness fits.** Handwriting, local material slang and free-form layout are exactly where rule-based OCR breaks and vision models are strong — these documents have no grid to anchor on, and a crossed-out total sitting under its correction is routine. They also carry a lot of **built-in redundancy**: every tarjeta line is quantity × price = amount, the total is the sum of the lines, and on a comprobante E − S = N. So the model's reading can be *checked by code* rather than trusted, which is what makes this safe enough to put near money.

**Where it does *not* fit.**
- The model must never decide money. When numbers don't reconcile, a human decides.
- Illegible entries must be flagged, not guessed.
- Historical inventory will never reconcile perfectly (shrinkage, moisture, dirt, missing sheets). The system reports *unexplained differences* instead of fake precision.

## 2. Scope of this challenge (vertical slice)

**In scope, real end to end:**

> Photo of a **tarjeta or a comprobante** → the model classifies which it is and extracts it → normalization (materials, prices) → validation → human review of what was flagged → committed records → a report of what came in and what was paid out.

Both document types go through one pipeline. Handling them mixed, as they actually arrive, is the point: a yard photographs the day's paper in one go and does not sort it first.

**Mocked, for product context only (clearly labeled "demo data" in the UI):**

| Area | Status | Why |
|---|---|---|
| Digitizing both document types (capture, classify, extract, review, commit) | **Real** | The harness |
| Material & unit configuration screen | **Real** | Required by normalization |
| Report of material in and money out, from committed documents | **Real** | Proves the output is usable |
| Dashboard, suppliers, sales, scale service, cash boxes | **Mock** | Shows where the harness fits in the future product |
| Live scale integration (RS-232 / Ethernet) | **Out of scope** | Belongs to the main product, not this challenge |
| Other document types (notebooks, printed invoices, Excel import) | **Out of scope, listed as next steps** | Depth over breadth |
| Auth, multi-tenant, deployment | **Out of scope** | Not the interesting part |

## 3. The end user & the interface

**Primary user:** the yard owner or office clerk. They are non-technical, work in Spanish, use the yard's own material names, are used to paper and phones, and have low tolerance for setup.

**Secondary user (fallback):** us, doing the migration as part of onboarding if the yard can't. This is the same interface; nothing changes.

**Experience:**
1. **Capture (phone).** Open a web page, tap "Subir hoja", take photos. There is no install and no login friction for the demo. It can be batch or one sheet at a time, and the user sees a "processing" state per sheet.
2. **Review (desktop or tablet).** An inbox of sheets with a status each: ✅ ready, ⚠️ needs review, ❌ unreadable. Opening a sheet shows **the photo side by side with the extracted table**.
   - Each field links to its region of the photo.
   - Uncertain fields are highlighted.
   - Failed checks are explained in yard language, e.g. *"Los pesos del detalle suman 480 kg, pero el camión neto es 520 kg (diferencia 7,7 %, tolerancia 10 %)."*
   - The user can correct a value, accept it, or mark it "ilegible".
3. **Commit.** A sheet can only be committed when there are no blocking issues, or when every remaining issue has been explicitly accepted by the user. Every correction is logged as an audit trail.
4. **Reports.** Inventory by material and the month's cash, each with a visible "based on N sheets, M with accepted differences" note.

**Why this interface.**
- Phones are already in every yard, which makes them a natural capture device.
- Review needs a bigger screen and side-by-side context, and a chat can't do that well.

**Bilingual UI (es / en) with a language switch in the header.** Spanish is the source language — it is what the actual user speaks, and the yard's vocabulary is not translatable anyway (*chatarra liviana*, *quintal*). English exists because the people evaluating this submission do not read Spanish, and an interface they cannot read cannot be judged. Implementation is a flat dictionary of UI strings plus a `lang` cookie; no i18n framework. Two things stay in Spanish under both settings: the material catalog (it is the yard's data, not UI copy) and the `raw` transcription of what is written on the sheet. Validation messages are templated, so they translate.

**Considered:** a WhatsApp bot. It is excellent for capture in Ecuador, but poor for reviewing a 15-line table. It is a strong candidate as an *additional capture channel* later.

## 4. Architecture & the harness

```
photo ──► preprocess ──► extract (vision LLM, structured output)
                                │
                                ▼
                     normalize (deterministic: units, material aliases)
                                │
                                ▼
                     validate (deterministic checks) ──► pass ──► ready
                                │
                               fail
                                ▼
                     independent re-read of failing fields
                                │
                    agree? ──► still failing ──► needs review (human)
                                │
                           disagree ──► needs review (both readings shown)
                                                        │
                                                        ▼
                                               human commit ──► DB ──► reports
```

### 4.1 Extraction
- One vision call per document returns a **strict schema** (structured outputs). The model's first job is to say *which document it is looking at* — the schema is a discriminated union, and misclassifying is its own failure mode in the evals, separate from misreading a number.
  - **Tarjeta:** card number, date, one line per material (quantity, material as written, unit price, amount), the total, and the settlement.
  - **Comprobante:** receipt number, date, the material of the load, the weighing block (E, S, N, deductions and their reasons, final weight), the total, and the settlement.
  - **Settlement, on both:** what the load came to, what was actually paid and how ("efect", "Abono", "Transf."), and what is still owed ("Debo 596,25"). Recording only the purchase total would leave the cash report wrong twice: on the day of the purchase and on the day the debt is cleared.
- **Crossed-out values are routine, not exceptional.** The weigher writes a figure, spots the error and writes the correct one above it. Every number field therefore carries `replaces`: the current reading is what counts, and the struck one is kept as evidence — a model that reads the wrong one of the two is a bug the evals must catch.
- Every numeric field carries two values: `raw` (exactly what is written) and `value` (the parsed number). It also carries a per-field `legible` flag. The prompt instructs the model to mark unreadable fields instead of inferring them.
- **No fixed layout.** Yards do not use a printed form: the weigher writes free-form on blank paper — a line for the date, supplier and plate, the truck weights, then one line per material with whatever spacing and abbreviations come naturally, sometimes with a price, sometimes not. So extraction cannot lean on column positions, which rules out template-based OCR and is a large part of why a vision model earns its place here. The evaluation sheets are written that way on purpose.

### 4.2 Normalization (code, not the model)
- **Units:** kg, lb, quintal (1 qq = 100 lb = 45.359 kg), and t, all converted to kg internally. The original unit is kept.
- **Materials:** the raw name is mapped to the catalog in three steps: exact alias, then a fuzzy match, which is only a *suggestion* and is always flagged, then unknown, which is flagged.
- **Prices are a band, not a value.** They are negotiated per load — in the sample the same chatarra settled at 0,23, 0,25 and 0,26. So the catalog carries the usual price *and the range the yard actually trades in*, and only a price outside that range is flagged. A fixed price would flag half the honest lines.
- **Configuration screen:** the material catalog with its aliases, the unit and price band per material, the cash-rounding step, the band for truck-load prices, and photo retention.
- **Starting catalog, taken from the real paperwork:** PET, perfil, chatarra gruesa, chatarra, cobre, bronce, radiador, aro, fundido, soplado, cartón, papel mixto, vidrio, plástico.

### 4.3 Validation (code)

| # | Check | Applies to | Severity |
|---|---|---|---|
| V1 | Line: `amount = trunc₅(quantity × price)` | tarjeta | Blocking |
| V2 | Truck: `entero − solo camión = neto` | comprobante | Blocking |
| V3 | Truck: `neto − deductions = weight paid for` | comprobante | Blocking |
| V4 | `total = Σ line amounts` | tarjeta | Blocking |
| V5 | Material resolved to the catalog | both | Blocking if unknown, warning if fuzzy |
| V6 | Settlement balances: `total − paid = owed` | both | Blocking |
| V7 | Plausibility: date readable and not in the future, weights positive | both | Blocking / warning |
| V8 | Duplicate folio — the number is pre-printed and never repeats | both | Warning |
| V9 | Any field marked illegible, or a missing total | both | Blocking |
| PRECIO | Price outside the band this material trades in; on a comprobante, the price *implied* by total ÷ weight | both | Warning |

Two of these exist only because the real paperwork taught us they had to. **V6** caught that the yard rarely pays the whole amount at once — "850,15 − 500 efect = 350", "Debo 596,25" — so a purchase and a payment are different events. And the settlement check needed a wider tolerance than the line checks, because cash changes hands in whole dollars: that same 350,15 balance was settled as a round 350.

### 4.4 Handling failure: don't let the model "fix" the math
A naive retry ("the sums don't match, try again") invites the model to **invent numbers that pass the check**, which is the worst possible failure mode. Instead:
- The re-read is **independent**. It is a second extraction of only the failing fields, without telling the model which answer would pass.
- If both readings agree and the check still fails, the sheet itself probably has an error, which happens often on paper. A human reviews it.
- If the readings disagree, both are shown to the reviewer.
- Nothing is auto-corrected to make totals match.

### 4.5 System architecture

**One Next.js application (App Router, TypeScript) — no separate backend.** The UI, the API and the harness live in the same repo and share one set of types. The harness core is plain TypeScript with no framework dependency, so the web app *and* the eval script call exactly the same code.

```
┌──────────────────── Browser ────────────────────┐
│  Capture (mobile)   Review (desktop)   Reports  │
│  React Server Components + client forms         │
└───────────┬──────────────────────┬──────────────┘
            │ upload (multipart)   │ poll status / commit
            ▼                      ▼
┌──────────────── Next.js server (node runtime) ──────────────┐
│  Route handlers / server actions                            │
│    POST /api/sheets          → store photo, create job      │
│    GET  /api/sheets/:id      → status + extraction          │
│    POST /api/sheets/:id/commit → validated write            │
│                                                             │
│  ┌──────────── harness/ (framework-free TS) ─────────────┐  │
│  │ schema.ts    Zod: the single source of truth          │  │
│  │ extract.ts   @anthropic-ai/sdk vision call            │  │
│  │ normalize.ts units + material aliases (pure)          │  │
│  │ validate.ts  V1–V9 checks (pure)                      │  │
│  │ pipeline.ts  orchestration + independent re-read      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  in-process worker (concurrency-limited)                    │
└───────────┬─────────────────────────────┬───────────────────┘
            │ Prisma                      │ HTTPS
            ▼                             ▼
      SQLite (./data/app.db)        Claude API (vision)
      photos on ./data/uploads
```

**Schema flow.** A Zod schema is defined once and used three ways: converted to JSON Schema for the model's structured output, used to parse and validate the response, and used as the TypeScript type across the UI. A schema change cannot drift between layers.

**Job lifecycle.** Extraction takes tens of seconds, so upload and processing are decoupled:

`queued → extracting → (needs_review | ready | failed) → committed`

The upload handler writes the photo, creates the row, and returns immediately. An in-process worker picks up queued rows with a small concurrency limit. The client polls the status endpoint and shows per-sheet progress. **Stub, stated honestly:** this is an in-process worker, not a real queue. It is enough for one yard and one operator, and a restart re-queues rows left in `extracting`. A production version would use a real queue.

**Portability.** Because `harness/` imports nothing from Next.js, replacing the frontend later costs nothing: the same code runs as-is behind either Next.js route handlers or a small standalone Node service with an HTTP API. Only a decision to rewrite the backend in another language would mean porting — and what would need porting is the prompt, the schema and the validation rules, a few hundred lines of plain logic. The expensive part of this project is discovering what to validate, not expressing it.

**Runtime assumption.** Deployed as a long-running Node server (`next start`), not serverless or edge, because of the long model calls and local file writes. Photos are stored on the local filesystem with the path in the database; object storage would be the production choice.

**Failure handling at the infrastructure layer.** API errors are retried by the SDK with backoff. Timeouts, an exhausted `max_tokens`, or a response that fails Zod validation mark the sheet `failed` with a message in Spanish and a "reintentar" button. No half-extracted sheet is ever written to the ledger.

**Repo layout.**

```
app/                      # routes: /capture, /review, /review/[id], /reports, /settings
  api/sheets/...          # upload, status, commit
harness/                  # the harness core — no Next.js imports
  schema.ts  extract.ts  normalize.ts  validate.ts  pipeline.ts
  prompts/
lib/                      # db (prisma), storage, worker
prisma/schema.prisma
evals/
  dataset/                # photos + ground-truth JSON
  run.ts                  # runs harness/pipeline.ts, prints metrics
  report/
components/               # ui, including <DemoBadge> for mocked screens
```

**Where the money lives.** Reports read only `committed` sheets. Everything else stays in the inbox, so a bad extraction can never silently move inventory or cash.

### 4.6 Running and deploying

| Context | How | Data |
|---|---|---|
| **Reviewers / local dev** | `npm install && npm run dev` with Node 20+ and an `ANTHROPIC_API_KEY`. No Docker required — this is the documented default, because the brief asks for an easy run. | `./data/app.db`, photos in `./data/uploads` |
| **Production (not built)** | A container on a VPS or Railway / Fly / Render. Not Vercel: serverless has per-request time limits and no persistent disk, while the model calls are long and write files. Deliberately out of scope for this slice — there is no Dockerfile in the repo, and claiming one there is not would be the kind of thing this whole design is about not doing. | Swap Prisma to Postgres; swap the storage implementation to S3 / R2 |

Storage sits behind a two-method interface (`save`, `url`) with a local-disk implementation, so moving to object storage is one file. Photos are resized client-side (~1600 px wide) before upload: it does not affect what the model can read, and connections at a yard are slow.

The challenge submission does not need to be deployed — a recorded demo is explicitly acceptable.

### 4.7 Data model (minimal, shared with the future product)
`Sheet` (photo, status, the raw extraction stored verbatim, flags, audit log) → `WeighingEvent` (document kind, folio, date, counterparty, and the truck weights when it is a comprobante) → `Line` (material as written, resolved material, quantity, unit, price, amount) plus `Material` (name, aliases, unit, price and price band), `Correction` (who, when, from → to), and `Config` (cash rounding, bulk price band, currency, photo retention).

The raw extraction is kept immutably next to the corrected values. That pairing is what tells us later how the harness is doing on real paper, and it is also what makes the audit trail worth anything: a yard can see exactly what the machine read and exactly what a person changed.

## 5. Quality: how we know it works

**Eval set — 27 real documents.** Photographed at the yard with a phone: tarjetas and comprobantes mixed, at angles, under shadow and yellow light, on a cluttered table, some creased. A week of one yard's paper. Roughly a third contain something worth flagging — a corrected total, a debt that does not balance, a scribble — which is the natural rate, not a curated one.

We considered writing a synthetic set instead and ran one early on. Real paper is better in a way that is hard to fake: the crossed-out totals, the three pen colours, the "Debo" in the margin, the rounding-down habit. Every one of those changed the design, and none of them would have occurred to us.

**Privacy.** The company logo and every person's name are masked in the published copies; the anonymisation script and the regions it masks are in the workshop folder, so the redaction is auditable. Weights, prices, totals and annotations are untouched — those are what the harness is judged on. The unmasked originals never leave the workshop folder.

**Ground truth** is transcribed by hand from the photos, reviewed by someone who knows the yard, and disagreements are resolved by looking at the paper. That review matters: a ground truth with a wrong digit in it makes every metric downstream a lie.

**Metrics.**
- **Silent error rate (headline):** fields committed with a wrong value *and no flag*. This is what costs the yard money.
- **Document type accuracy:** a comprobante read as a tarjeta is wrong before any number is read.
- Field accuracy for quantities, prices and totals.
- Material mapping accuracy.
- **Correction handling:** on documents with a struck-through value, how often the current reading is taken rather than the superseded one.
- Flag recall on documents that genuinely have a problem, and false-flag rate on the ones that do not.
- Cost and latency per document.

**Loop.** `npm run eval` runs the full pipeline over the set and writes `evals/REPORT.md`, so every prompt, model or check change is measured rather than argued about.

**What the loop actually produced.** Running it was not a formality; it changed the system four times. The model read a year as 2016 for 2026 — arithmetic cannot see that, so a stale-date check went in. It returned a total and left the weight out — so a total with nothing measured behind it is now blocking. It read "0,5" as "05" on a line with no unit price, where nothing multiplies — so those lines are now checked against the price they imply. And comparing a receipt's date against the folios either side catches a day misread, since the numbering is pre-printed and used in order.

It also corrected the measurement itself twice: material spelling was being counted as error when both spellings resolved to the same material, and on two receipts the ground truth was wrong and the model was right, which enlarging the photo settled.

**Where it stands:** 94.5 % of fields read correctly, one silent error in 27 documents, and 71.4 % of crossed-out values read as the correction rather than the struck figure — the weakest number, and the next thing to work on.

## 6. Tooling & tradeoffs

| Choice | Why | Weighed against |
|---|---|---|
| Vision LLM (Claude Opus 5) with structured outputs | Best at handwriting plus context (slang, deductions); schema-valid output | Classic OCR (Tesseract): weak on handwriting. Document AI services (Azure/Google): good OCR but no domain reasoning; could be benchmarked later |
| Claude Sonnet 5 as a candidate for cost | Cheaper per sheet | Only adopted if the eval shows no loss in silent error rate |
| Deterministic Python for normalization and validation | Auditable, testable, never "creative" | Asking the LLM to validate its own output |
| Next.js (App Router) + TypeScript, one app for UI, API and harness | One language and one schema definition (Zod) from the model call to the UI; no separate backend to run | Python + FastAPI: a stronger data/ML ecosystem, but it would mean two languages and the same schema defined twice, for a pipeline that is mostly I/O |
| `@anthropic-ai/sdk` (TypeScript), server-side only | Full parity with the Python SDK for vision and structured outputs; keeps the API key off the browser | Calling the API from the client (leaks the key) |
| Zod + `zod-to-json-schema` | One schema: JSON Schema for the model, runtime validation, and TS types | Hand-written JSON Schema kept in sync by hand |
| Prisma + SQLite (file) | Zero setup, real migrations, one line to move to Postgres for the main product | Postgres from day one: more infrastructure than a slice needs |
| Mobile-first web app | No install; the same app covers phone capture and desktop review | Native app (too much for a slice); WhatsApp (good capture, poor review) |
| Harness core as pure, framework-free functions | The eval script and the web app run identical code, so eval results are meaningful | Testing through HTTP endpoints |

**Deliberately not done:** agents or tool loops (the workflow is fixed), fine-tuning, and automatic correction of totals.

## 7. Open questions
- **Units.** The paper does not say, and the yard has never needed it written down. Configured per material for now; worth confirming before anyone trusts a weight report.
- **What the annotations mean.** "Debo" reads as a balance carried to the supplier and the arithmetic supports it, but it is inference from 27 documents, not something the owner has confirmed. Same for "Abono" and "Transf.".
- **The settlement tolerance of one dollar** comes from a single observation. It should be confirmed rather than hardened into a rule.
- **Do the two document types ever refer to the same purchase?** They appear to be separate flows — carts on the small scale, trucks on the big one — which is what the design assumes.
- **Settled:** photos kept 90 days after commit, then deleted while the extraction is kept — implemented as `npm run retention`, a script for cron, because the app has no scheduler and should not pretend to; prices validated as a band rather than a value; amounts truncated down to five cents.

## 8. Reflections *(to be completed at submission)*
- Time spent:
- What I'd do next: notebooks of sorting results, printed invoices, Excel import, WhatsApp capture, live scale integration.
- What I'm least sure about:
