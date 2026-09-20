# Evaluation dataset

16 weighing sheets, hand-written and photographed. Eight are clean; eight carry one
seeded problem each. They are synthetic — written by us, modelled on how an Ecuadorian
yard writes: free-form on blank paper, mixed units (kg, lb, quintal), local
abbreviations ("chat liv", "fierro", "cobre 1ra"). No real yard's data is here.

```
hoja-001.json … hoja-016.json   ground truth, one per sheet
fotos/hoja-001.jpg …            the photographs
```

## What a record holds

| Field | |
|---|---|
| `folio` | links the record to its photo |
| `scenario` | what this sheet is meant to test, in one line |
| `expected_flags` | what validation must raise: `{ code: "V4", linea: 2 }`. Empty means the sheet must come out clean |
| `extraction` | the transcription the model should produce, in the shape of `harness/schema.ts` |

`extraction` is the **transcription**, not an interpretation: `raw` is the ink as
written ("0,12", "1.250"), `value` is that text parsed, and `legible: false` with a null
value marks a field that genuinely cannot be read. Scoring compares `value` and
`legible` on every field, and `raw` only where the field is legible — a model that reads
the right number is not penalised for normalising a separator.

The flag codes are the checks in `harness/validate.ts` (V1–V9), plus `PRECIO` for a
price that diverges from the configured one.

## Two failures worth distinguishing

A **missed flag** means a bad sheet passed as clean. A **false flag** means a clean sheet
was sent to a human for nothing. Both are counted, because a system that flags everything
scores perfectly on the first and is useless in practice.

Worse than either is a **silent error**: a field committed with the wrong value and no
flag at all. That is the headline metric.
