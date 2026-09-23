# Evaluation report

Generated 2026-09-23 14:23 · 5 documents

## Headline

| | |
|---|---|
| **Silent error rate** — a wrong value and no flag at all | **0.0 %** (0 of 5) |
| Wrong, but only a warning — visible, still committable | 20.0 % (1 of 5) |
| Field accuracy | 91.7 % (33 of 36) |
| Document type read correctly | 100.0 % |
| Crossed-out values read as the correction | 100.0 % (1 of 1) |
| Documents where a check was missed | 0 |
| Documents flagged for nothing | 2 |
| Average time per document | 17.9 s |
| Tokens | 29330 in · 6721 out |

A silent error is the one that costs money: the value is wrong and nothing
stops it reaching the ledger. A wrong value that raises a check is a minor
inconvenience — somebody looks at the photo and fixes it.

## Per document

| Document | Type | Fields right | Wrong | Flags expected | Flags raised | Silent |
|---|---|---|---|---|---|---|
| doc-01 (015636) | ok | 7/7 | — | — | — | no |
| doc-02 (015635) | ok | 3/5 | material (wrong), truck.net (missed) | — | V10 | no |
| doc-03 (015638) | ok | 9/9 | — | — | — | no |
| doc-04 (2780) | ok | 5/5 | — | V4 | V4 | no |
| doc-05 (015639) | ok | 9/10 | payment.0 (invented) | — | V6 | no |

## How to read this

- **wrong** — a value was read as a different value.
- **missed** — the paper has a value and the model returned none, or called it illegible.
- **invented** — the model produced a value the paper does not have. On a field
  the ground truth marks illegible, this is the failure mode the prompt works
  hardest to prevent: a plausible number where the ink is unreadable.
- **Flags expected** are what the checks raise against a perfect transcription;
  **flags raised** are what they raise against the model's. A flag appearing in
  one column only is worth looking at in either direction.
