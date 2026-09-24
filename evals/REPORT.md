# Evaluation report

Generated 2026-09-24 00:07 · 3 documents

## Headline

| | |
|---|---|
| **Silent error rate** — a wrong value and no flag at all | **0.0 %** (0 of 3) |
| Wrong, but only a warning — visible, still committable | 66.7 % (2 of 3) |
| Field accuracy | 84.0 % (21 of 25) |
| Document type read correctly | 100.0 % |
| Crossed-out values read as the correction | — (0 of 0) |
| Documents where a check was missed | 0 |
| Documents flagged for nothing | 1 |
| Average time per document | 21.1 s |
| Tokens | 17784 in · 4567 out |

A silent error is the one that costs money: the value is wrong and nothing
stops it reaching the ledger. A wrong value that raises a check is a minor
inconvenience — somebody looks at the photo and fixes it.

## Per document

| Document | Type | Fields right | Wrong | Flags expected | Flags raised | Silent |
|---|---|---|---|---|---|---|
| doc-13 (015633) | ok | 7/7 | — | — | — | no |
| doc-17 (2782) | ok | 7/9 | date: «2026-09-18» → «2020-09-18»; line.0.quantity: «0,5» → «6,5» | — | PRECIO, V7 | no |
| doc-18 (2783) | ok | 7/9 | line.0.quantity: «0,5» → «05»; line.1.quantity: «0,5» → «05» | PRECIO | PRECIO | no |

## How to read this

- **wrong** — a value was read as a different value.
- **missed** — the paper has a value and the model returned none, or called it illegible.
- **invented** — the model produced a value the paper does not have. On a field
  the ground truth marks illegible, this is the failure mode the prompt works
  hardest to prevent: a plausible number where the ink is unreadable.
- **Flags expected** are what the checks raise against a perfect transcription;
  **flags raised** are what they raise against the model's. A flag appearing in
  one column only is worth looking at in either direction.
