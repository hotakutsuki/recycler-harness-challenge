# Design Doc — Weighing-Sheet Digitizer for Recycling Yards

> **Status:** Draft v0.3 (2026-09-19). Items marked **[ASSUMPTION]** are placeholders until real documents from a partner recycling yard arrive.
> Product name: *RecycleOps*.

---

## 1. Problem thesis

**Who.** Small and mid-sized recycling yards in Ecuador (paper, cardboard, plastics, ferrous and non-ferrous scrap). They buy material from collectors and trucks, sort it, store it, and resell it. Some also charge for use of their truck scale.

**How they work today.** Everything is on paper and in spreadsheets:
- A truck is weighed on the truck scale (gross / tare / net).
- The load is then sorted, and a weigher re-weighs each material on a smaller scale, writing a **detail sheet** by hand: material, weight, and *deductions* (e.g. a radiator is weighed whole, then a deduction is noted for its plastic parts).
- The owner considers this sheet one of the most important documents in the yard: it is what the supplier gets paid on and what inventory is built from.
- Someone later re-types these sheets into several Excel files to get cash reports and current inventory.

**What it costs.**
- Hours of manual data entry per week, done late and in batches.
- Typing and arithmetic errors that directly change **money paid** and **inventory on hand**, and are rarely caught.
- No trustworthy "current inventory" or "cash this month" without a manual reconciliation.
- **For us as a vendor:** this paper backlog is the main barrier to adopting a proper yard-management system. A yard won't switch if its history stays on paper.

**Why an AI harness fits.** Reading messy handwriting, local material slang, and mixed units is exactly where rule-based OCR breaks and vision LLMs are strong. These sheets also carry a lot of **built-in redundancy** (line arithmetic, sheet totals vs. truck net weight), so the model's reading can be *checked by code* instead of trusted blindly.

**Where it does *not* fit.**
- The model must never decide money. When numbers don't reconcile, a human decides.
- Illegible entries must be flagged, not guessed.
- Historical inventory will never reconcile perfectly (shrinkage, moisture, dirt, missing sheets). The system reports *unexplained differences* instead of fake precision.

## 2. Scope of this challenge (vertical slice)

**In scope, real end to end:**

> Photo of a handwritten **weighing detail sheet** → extraction → normalization (materials, units) → validation → human review of flagged fields → saved records → two reports: **current inventory by material** and **cash for the month**.

**Mocked, for product context only (clearly labeled "demo data" in the UI):**

| Area | Status | Why |
|---|---|---|
| Detail-sheet digitization (capture, review, commit) | **Real** | The harness |
| Material & unit configuration screen | **Real** | Required by normalization |
| Inventory and monthly cash reports | **Real** (computed from committed sheets) | Proves the output is usable |
| Dashboard, suppliers, sales, scale service, cash boxes, discounts | **Mock** | Shows where the harness fits in the future product |
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
- One vision-LLM call per sheet returns a **strict schema** (structured outputs) with:
  - **Header:** the weighing date (written on every sheet by the weigher — it is what all reporting is keyed on), supplier, plate, and truck gross/tare/net when present.
  - **Lines:** material, gross weight, unit, deduction and its reason, net, and price if present.
- Every numeric field carries two values: `raw` (exactly what is written) and `value` (the parsed number). It also carries a per-field `legible` flag. The prompt instructs the model to mark unreadable fields instead of inferring them.
- **[ASSUMPTION]** Sheet layout: a header (date, supplier, plate, truck weights) plus a table of material lines with deduction and reason columns, and optional price. The evaluation sheets are written against this layout; it will be revised if the partner yard's sheets differ.

### 4.2 Normalization (code, not the model)
- **Units:** kg, lb, quintal (1 qq = 100 lb = 45.359 kg), and t, all converted to kg internally. The original unit is kept.
- **Materials:** the raw name is mapped to the catalog in three steps: exact alias, then a fuzzy match, which is only a *suggestion* and is always flagged, then unknown, which is flagged.
- **Configuration screen:** the material catalog with aliases, and per material the **purchase price and the unit it is priced in** — USD 1.00 per pound, USD 0.20 per kilo, and so on. Price unit and weighing unit are independent: a sheet may record pounds for a material priced per kilo, and the conversion is the code's job. A single weight tolerance, default 10 %, editable in settings.
- **Which price wins.** The price written on the sheet always wins; the configured price is used when the sheet leaves it blank. When both exist and differ by more than a configurable margin, the line is flagged — that is usually either a misread digit or a negotiated price worth noticing, and both deserve a human.
- **Starting catalog:** chatarra liviana, chatarra pesada, chatarra automotriz, papel, cartón, cobre, hierro, plástico, vidrio.

### 4.3 Validation (code)

| # | Check | Severity |
|---|---|---|
| V1 | Line: `gross − deduction = net` | Blocking |
| V2 | Truck: `gross − tare = net` | Blocking |
| V3 | Σ line nets vs. truck net, within configured tolerance (default **10 %**) | Blocking above tolerance |
| V4 | Line amount = net × price (sheet price, else configured price, converted to the price unit); sheet total = Σ amounts | Blocking |
| V5 | Material resolved to catalog | Blocking if unknown |
| V6 | Unit recognized and plausible for the material | Warning |
| V7 | Plausibility: weight ranges per material, date not in the future or too old | Warning |
| V8 | Possible duplicate (same date + supplier + plate + total) | Warning |
| V9 | Any field marked illegible | Blocking |

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
app/                      # routes: /capturar, /revisar, /revisar/[id], /reportes, /configuracion
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
| **Production-like check** | `docker compose up`, the same image that would be deployed, with `./data` bind-mounted from the host | Same files, on the host disk |
| **Production (later)** | The same container on a VPS or Railway / Fly / Render. Not Vercel: serverless has per-request time limits and no persistent disk, and the model calls are long and write files. | Swap Prisma to Postgres; swap the storage implementation to S3 / R2 |

Storage sits behind a two-method interface (`save`, `url`) with a local-disk implementation, so moving to object storage is one file. Photos are resized client-side (~1600 px wide) before upload: it does not affect what the model can read, and connections at a yard are slow.

The challenge submission does not need to be deployed — a recorded demo is explicitly acceptable.

### 4.7 Data model (minimal, shared with the future product)
`Sheet` (photo, status, raw extraction, audit log) → `WeighingEvent` (weighing date, supplier, plate, truck weights) → `Line` (material, raw and normalized weights, deduction and reason, price, amount) plus `Material` (name, aliases, purchase price, price unit), `Correction` (who, when, from → to) and `Config` (tolerance, currency, photo retention).

## 5. Quality: how we know it works

**Eval set.**
- 16 sheets handwritten by us in the style of the yard, then photographed under realistic conditions (angles, shadows, yellow light, creased paper).
- **Eight clean, eight with a seeded problem** — a wrong amount, a detail total outside tolerance, a price that diverges from the catalog, an unknown material, an illegible field, a truck subtraction that does not add up, a deduction that does not add up, and a duplicate. The half-and-half split is deliberate: with only broken sheets you measure detection and never see the false alarms on good sheets, which is what would make the system unbearable for the person reviewing.
- Each sheet has a hand-written ground-truth JSON.
- **Not in this repository.** The photos and ground truth live outside it, and `evals/run.ts` reads them from `EVAL_DATASET_DIR`. The eval runner and the metrics report are committed, so the method and the numbers are inspectable — but a reviewer cannot re-run them. That is a deliberate trade, and the cost is stated rather than hidden.
- Real sheets from the partner yard will be added when available and reported separately.

**Metrics.**
- **Silent error rate (headline):** fields committed with a wrong value *and no flag*. This is what costs the yard money.
- Field accuracy for weights and prices (exact match after normalization).
- Material mapping accuracy.
- Seeded-error recall: how many planted problems were flagged.
- False-flag rate: review burden on clean sheets.
- Cost and latency per sheet.

**Loop.** An eval script runs the full pipeline on the set and prints a report, so every prompt, model, or validation change is measured, not guessed.

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
- What the real detail sheet looks like: fields, and whether prices are written on it. *(Waiting on partner yard.)*
- The yard's material list and local names.
- **Settled for now:** a single configurable tolerance (10 % default) rather than one per material; photos retained for 90 days after commit, then deleted while the extraction JSON is kept; the evaluation set is written by hand by us rather than waiting on the partner yard.
- Whether tolerance should later vary per material (wet cardboard behaves nothing like metal) stays open until real sheets say otherwise.

## 8. Reflections *(to be completed at submission)*
- Time spent:
- What I'd do next: notebooks of sorting results, printed invoices, Excel import, WhatsApp capture, live scale integration.
- What I'm least sure about:
