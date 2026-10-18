# Receipt extraction diagnostic
October 18, 2026

All ten images in tests/receipts are labeled synthetic. No supplied original receipts were available. Ground-truth critical fields were recorded in tests/receipts/manifest.json before live calls. generate_receipts.py creates the images; scripts/evaluation/run.ts calls the real configured Gemini extraction path. No mocked responses are counted as live accuracy.

The set covers clean print, handwriting/Blue Harbor, 90-degree rotation, cropped header/date/total, faded text, inconsistent arithmetic, ambiguous dollar symbol, EUR, a reformatted JPEG copy and an exact PNG copy. Copies test both exact hashing and probable semantic duplicate findings. Duplicate detection is a review signal, not a fraud conclusion.

## Recorded results
| Run | Cases attempted | Provider completed | Critical checks passed | Failed | Provider errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial live extraction | 10 | 10 | 9 | 1 | 0 |
| Fresh extraction after correction | 10 | 6 | 6 | 0 | 4 |
| Local replay of all initial responses through corrected normalization | 10 | No new calls | 10 | 0 | Not applicable |

The initial crop failure invented a final total of 22 from visible subtotal 20 plus tax 2, then reported arithmetic reconciled even though the final total was cropped out. Currency was correctly missing. The corrected normalizer retains that provider proposal as raw evidence but does not accept a derived final as an observed total; the downstream check stays unresolved. The fresh cropped case passed the expected missing-total/arithmetic-unknown checks.

The configured provider exhausted its daily quota after six completed rerun cases. Cases 7–10 therefore remain unverified by fresh post-fix calls. There were 20 attempts and 16 successful provider responses across both runs, representing ten unique synthetic cases. Preserved JSON:
- initial-results.json: original failures and provider evidence.
- results.json: fresh post-fix run including the four provider errors.
- tests/receipt-corpus.test.ts: deterministic replay regression, explicitly not fresh OCR.

## Meaning and limits
Critical checks compare merchant, date, final amount, currency/inference and arithmetic state to the manifest. This is not character-level transcription accuracy. Downstream results separately record whether missing evidence remains unresolved, incorrect arithmetic fails, and duplicate copies are flagged.

Handwriting fields preserve printed total, handwritten addition and final total separately. An inferred currency can still require confirmation even if transcription is otherwise correct. Faded/cropped evidence is expected to remain incomplete; a safe unresolved finding is not equivalent to complete extraction.

Ten synthetic fixtures cannot establish general real-world robustness. Real receipts, additional languages/currencies, stronger fading, arbitrary rotations, multipage inputs and independently labeled examples remain necessary. No accuracy percentage from this diagnostic should be marketed as a general OCR benchmark.

## Reproduce
- Generate images using Python with Pillow: scripts/evaluation/generate_receipts.py.
- Live calls (consumes configured provider quota): node --env-file=.env.local --import tsx scripts/evaluation/run.ts.
- Local replay and all policy/database tests: npm test.

Live results overwrite results.json; preserve prior evidence before a new run. Do not rerun live calls until quota is available. Only synthetic fixtures were sent to the provider; production receipts/data were not modified.
