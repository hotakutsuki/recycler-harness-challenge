# Evaluation report

Generated 2026-09-24 00:17 · 27 documents

## Headline

| | |
|---|---|
| **Silent error rate** — a wrong value and no flag at all | **3.7 %** (1 of 27) |
| Wrong, but only a warning — visible, still committable | 3.7 % (1 of 27) |
| Field accuracy | 94.5 % (258 of 273) |
| Document type read correctly | 100.0 % |
| Crossed-out values read as the correction | 71.4 % (10 of 14) |
| Documents where a check was missed | 1 |
| Documents flagged for nothing | 8 |
| Average time per document | 18.5 s |
| Tokens | 160056 in · 37729 out |

A silent error is the one that costs money: the value is wrong and nothing
stops it reaching the ledger. A wrong value that raises a check is a minor
inconvenience — somebody looks at the photo and fixes it.

## Per document

| Document | Type | Fields right | Wrong | Flags expected | Flags raised | Silent |
|---|---|---|---|---|---|---|
| doc-01 (015636) | ok | 7/7 | — | — | — | no |
| doc-02 (015635) | ok | 4/5 | truck.net: «160» → «—» | — | V10 | no |
| doc-03 (015638) | ok | 9/9 | — | — | — | no |
| doc-04 (2780) | ok | 5/5 | — | V4 | V4 | no |
| doc-05 (015639) | ok | 10/10 | — | V6 | V6 | no |
| doc-06 (2781) | ok | 17/17 | — | — | — | no |
| doc-07 (2776) | ok | 5/5 | — | V4 | V4 | no |
| doc-08 (015628) | ok | 7/9 | date: «2026-09-17» → «2026-09-14»; deduction.0: «25» → «2025» | — | V3 | no |
| doc-09 (015630) | ok | 6/8 | total: «510,33» → «(illegible)»; payment.0: «—» → «510,30» | — | V9 | no |
| doc-10 (015631) | ok | 9/9 | — | — | — | no |
| doc-11 (015632) | ok | 6/8 | total: «214,20» → «(illegible)»; owed: «596,25» → «596,95» | V6 | V9 | no |
| doc-12 (2777) | ok | 19/19 | — | — | — | no |
| doc-13 (015633) | ok | 7/7 | — | — | — | no |
| doc-14 (2778) | ok | 30/31 | line.2.material: «chatarra fina» → «Cubeta Huevo» | — | V5 | no |
| doc-15 (015634) | ok | 8/10 | total: «1152,90» → «(illegible)»; owed: «—» → «1152,90» | — | V9 | no |
| doc-16 (015640) | ok | 7/7 | — | — | — | no |
| doc-17 (2782) | ok | 9/9 | — | — | — | no |
| doc-18 (2783) | ok | 7/9 | line.0.quantity: «0,5» → «05»; line.1.quantity: «0,5» → «05» | PRECIO | PRECIO | no |
| doc-19 (015642) | ok | 7/7 | — | V11 | V11 | no |
| doc-20 (015643) | ok | 7/7 | — | — | — | no |
| doc-21 (015646) | ok | 7/8 | date: «2026-09-18» → «2026-09-10» | — | — | **yes** |
| doc-22 (015644) | ok | 9/9 | — | — | — | no |
| doc-23 (2784) | ok | 26/27 | total: «1113,80» → «1173,80» | — | V4 | no |
| doc-24 (015645) | ok | 8/8 | — | V6 | V6 | no |
| doc-25 (015641) | ok | 8/9 | total: «450» → «(illegible)» | — | V9 | no |
| doc-26 (015643) | ok | 7/7 | — | V8 | V8 | no |
| doc-27 (015642) | ok | 7/7 | — | V8, V11 | V8, V11 | no |

## How to read this

- **wrong** — a value was read as a different value.
- **missed** — the paper has a value and the model returned none, or called it illegible.
- **invented** — the model produced a value the paper does not have. On a field
  the ground truth marks illegible, this is the failure mode the prompt works
  hardest to prevent: a plausible number where the ink is unreadable.
- **Flags expected** are what the checks raise against a perfect transcription;
  **flags raised** are what they raise against the model's. A flag appearing in
  one column only is worth looking at in either direction.
