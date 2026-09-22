# Evaluation report

Generated 2026-09-22 00:45 · 27 documents

> **Stub mode.** The reading was replayed from this same ground truth, so every
> number below is 100 % by construction. This run measures the evaluation
> harness, not the model. Set a funded `ANTHROPIC_API_KEY` and unset
> `EXTRACTOR` for numbers that mean something.

## Headline

| | |
|---|---|
| **Silent error rate** — a wrong value with nothing flagged | **0.0 %** (0 of 27) |
| Field accuracy | 100.0 % (270 of 270) |
| Document type read correctly | 100.0 % |
| Crossed-out values read as the correction | 100.0 % (14 of 14) |
| Documents where a check was missed | 0 |
| Documents flagged for nothing | 0 |
| Average time per document | 0.0 s |
| Tokens | 0 in · 0 out |

A silent error is the one that costs money: the value is wrong and nothing
stops it reaching the ledger. A wrong value that raises a check is a minor
inconvenience — somebody looks at the photo and fixes it.

## Per document

| Document | Type | Fields right | Wrong | Flags expected | Flags raised | Silent |
|---|---|---|---|---|---|---|
| doc-01 (015636) | ok | 7/7 | — | — | — | no |
| doc-02 (015635) | ok | 5/5 | — | — | — | no |
| doc-03 (015638) | ok | 9/9 | — | — | — | no |
| doc-04 (2780) | ok | 5/5 | — | V4 | V4 | no |
| doc-05 (015639) | ok | 9/9 | — | — | — | no |
| doc-06 (2781) | ok | 17/17 | — | — | — | no |
| doc-07 (2776) | ok | 5/5 | — | V4 | V4 | no |
| doc-08 (015628) | ok | 9/9 | — | — | — | no |
| doc-09 (015630) | ok | 7/7 | — | — | — | no |
| doc-10 (015631) | ok | 9/9 | — | — | — | no |
| doc-11 (015632) | ok | 8/8 | — | V6 | V6 | no |
| doc-12 (2777) | ok | 19/19 | — | — | — | no |
| doc-13 (015633) | ok | 7/7 | — | — | — | no |
| doc-14 (2778) | ok | 31/31 | — | — | — | no |
| doc-15 (015634) | ok | 9/9 | — | — | — | no |
| doc-16 (015640) | ok | 7/7 | — | — | — | no |
| doc-17 (2782) | ok | 9/9 | — | — | — | no |
| doc-18 (2783) | ok | 9/9 | — | — | — | no |
| doc-19 (015642) | ok | 7/7 | — | — | — | no |
| doc-20 (015643) | ok | 7/7 | — | — | — | no |
| doc-21 (015646) | ok | 8/8 | — | — | — | no |
| doc-22 (015644) | ok | 9/9 | — | — | — | no |
| doc-23 (2784) | ok | 27/27 | — | — | — | no |
| doc-24 (015645) | ok | 8/8 | — | V6 | V6 | no |
| doc-25 (015641) | ok | 9/9 | — | — | — | no |
| doc-26 (015643) | ok | 7/7 | — | — | — | no |
| doc-27 (015642) | ok | 7/7 | — | — | — | no |

## How to read this

- **wrong** — a value was read as a different value.
- **missed** — the paper has a value and the model returned none, or called it illegible.
- **invented** — the model produced a value the paper does not have. On a field
  the ground truth marks illegible, this is the failure mode the prompt works
  hardest to prevent: a plausible number where the ink is unreadable.
- **Flags expected** are what the checks raise against a perfect transcription;
  **flags raised** are what they raise against the model's. A flag appearing in
  one column only is worth looking at in either direction.
