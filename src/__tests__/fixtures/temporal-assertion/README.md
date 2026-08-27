# `temporal-assertion/v1` fixtures (LOT 10, Wave 1)

Ledgers and expected snapshots for the bitemporal assertion contract in
`src/contracts/temporal-assertion.ts`. Every file in this directory is pinned by SHA-256 in
`tests/unit/contracts/temporal-assertion.test.ts` (this README included): a fixture change
is a contract change.

## Provenance

`source/sample-space-582.json` is a verbatim, read-only export from the backup pair file
`deposium-b.duckdb` of 2026-08-24, tenant `7f6d5c27-afbe-403f-b76f-055eced7e313`, space
`582`: 8 real `temporal_events` rows (7 for the year 1987, 1 for 1991, all from the
document `29a612be-2e11-4532-944a-8953e1442099`, pages 12, 40 and 74) and 1 real
`uploaded_files_graph_relations` row. House rule: fixtures come from real output, never
from a hand-written generator. `generate.ts` does not invent rows; it derives envelopes
from these rows and, for scenario 07, varies the bound kinds and the operations ON them.

## What the rows lack

Measured on the 1 192 `temporal_events` rows of the space: `created_at`, `source_pages`
and `sequence_id` are NULL on 100 % of them. So:

- **`recorded_at` does not exist in the base.** A row says when a fact is true
  (`event_date`), never since when the ledger knows it. That is the demonstration of
  invariant 9: it cannot be derived from `event_date`, it has to come from an ingestion
  clock. The only real ingestion instant in the sample is the relation row's `created_at`,
  `2026-08-10 11:18:58.129510` — stored WITHOUT an offset, which `validateEnvelope`
  refuses as-is (the negative table uses that raw value). The fixtures set an explicit
  ledger clock: `T0 = 2026-08-10T11:18:58Z` (that instant to the second, read as UTC) for
  every base assertion, `T1 = T0 + 24 h` for corrections, `T2 = T0 + 48 h` for retractions.
- No `sequence_id`: the chain order (`integrity.sequence_no`) is the order the generator
  writes the lines in, not anything the base holds.
- No `source_pages`: the page comes from the chunk-shaped `doc_id` (`<uuid>_page_N`), the
  `temporal_doc_id_page` mechanism of `scope-evidence`.
- No producer version and nothing pinned semantically: `derivation` is omitted and
  `semantics` is `{}` (invariant 7 is kept by not pretending).
- `confidence` is a float32 round-trip artefact (`0.6000000238418579`); it is carried as
  is, and hashed as `\x02` + its shortest decimal form.

## Derivation

| Envelope field    | From the row                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertion_id`    | `event_id`, with a suffix (`\|retract`, `\|open`, `\|unknown`, `\|<kinds>\|<n>`) when one row yields several assertions                                                                                               |
| `claim_stream_id` | `<tenant_id>/<space_id>/n8n:temporal_events:<metadata.extraction_method>` (`regex` or `entity_year_cooccurrence`); the relation row's writer is `n8n:uploaded_files_graph_relations`                                  |
| `statement`       | `extracted_year` rows: `document\|<uuid>` `mentions_year` `<metadata.year>`; `entity_year` rows: `<metadata.entity_id>` `mentioned_with_year` `<metadata.year>`; `object_datatype: xsd:gYear`                         |
| `scope`           | `tenant_id`, `space_id`                                                                                                                                                                                               |
| `valid_time`      | `from` = the year of `event_date`, `to` = the next year (EXCLUSIVE, invariant 11), `precision: 'year'`; `source_expression` = `event_description` (the correction lines use `source_text`); `confidence` = the row's  |
| `evidence_refs`   | `evidence_id` = `chunk_id` = `doc_id`, `source_id` = `document_id` = the document uuid, `page` from the `doc_id` suffix; the relation row gives `properties.evidence_id`, `source_pages[0]` and `claim_id` as locator |
| `recorded_at`     | the ledger clock above (never the row)                                                                                                                                                                                |

## Scenarios

| File                 | Rows                                          | What it shows                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-simple-dated`    | page_74 mentions 1991                         | one dated assertion, both axes, the exclusive end, `as_of` at second and day precision                                                                                                                                                                                                                                             |
| `02-correction`      | page_12 mentions 1987 → page_40 mentions 1987 | `assert` + `supersedes_assertion_id` (the mention re-attributed to page 40); withdrawal decided before validity                                                                                                                                                                                                                    |
| `03-retraction`      | MSFD (1987)                                   | `retract` + `target_assertion_id` (the directive dates from 2008); a retraction is listed, never in scope                                                                                                                                                                                                                          |
| `04-retroactive`     | Ecorys (1987), open end                       | `valid_from` 1987, `recorded_at` 2026: present at `valid=1999`, absent at `as_of=2000` (R1). The brief writes "1998"; the real row's 1987 plays the same role, `valid_from < 1999 < 2000 < recorded_at`                                                                                                                            |
| `05-open-vs-unknown` | Netherlands (1987), twice in one stream       | `to_kind: 'open'` covers 1999, `to_kind: 'unknown'` is undecided even inside 1987 (R2)                                                                                                                                                                                                                                             |
| `06-two-authorities` | Greece (1987) vs the graph-relations writer   | two `claim_stream_id`s, no resolution (invariant 4). The second authority's year, 1991, is row page_74's year transplanted onto Greece: nothing in the base asserts "Greece 1991"; what is real is two producers writing the same space with no reconciliation, and the second producer's clock, evidence id, claim id and page 43 |
| `07-kind-variations` | the 8 rows, cycled                            | `from_kind` × `to_kind` (9 streams) × `assert` / supersede / `retract` (3 lines per stream: seq 2 supersedes seq 1 at T1, seq 3 retracts seq 1 at T2 — later, so the earliest withdrawal names the reason) × `time_axis` (14 queries, including the exact start and the exact exclusive end)                                       |

Retraction lines mirror their target's `valid_time` so a reader sees which validity is
withdrawn; the snapshot never consults it.

## Cases

`cases/<scenario>.json` holds, per scenario, the committed `heads` (last `sequence_no` and
checksum of every stream, kept here OUTSIDE the ledger: a stream cut after its last line is
a valid shorter stream, and only a head held elsewhere shows the cut), the expected
`verifyChain` report of the untouched ledger against those heads, and a list of typed queries `{ time_axis, valid_at?, as_of? }` with the
expected `in_scope`, `excluded`, `undecided` and `hash`, plus the reasoning. For the six
core scenarios and for the per-kind verdicts of scenario 07, `in_scope` / `excluded` /
`undecided` are written by hand in `generate.ts` from invariants 9-11; the generator
refuses to write a case the reference implementation does not reproduce, and only the
`hash` is taken from the reference once the sets agree. 50 cases in total (R5 asks for 20
to 50). A second implementation (the CLI runner) must recompute all of them independently.

Against an empty ledger, every case fails: no expected hash equals the empty snapshot's.
That is the negative control the brief requires — the bench against nothing is 0 PASS.

## Encoding rules

The checksum of a line is SHA-256 over the fields of `CHECKSUM_FIELD_ORDER`: every field
of the envelope except `integrity.checksum` itself, so `evidence_refs` and the derivation
ARE hashed (34 paths). Each field is encoded by
`encodeChecksumValue` — a string RAW, `null` and absent as the NUL byte `\x00`, every other
value (number, boolean, object, array) as the STX byte `\x02` (`CHECKSUM_TYPED`) followed
by its canonical JSON (keys sorted at every level, no whitespace, `undefined` members
dropped), so that the number `1987` and the text `"1987"` never collide — joined by
the ASCII unit separator `\x1f`. The raw strings are why the separator is load-bearing
(`('ab','c')` ≠ `('a','bc')`, R4), and why `validateEnvelope` refuses any control
character in a string field that is hashed raw: with one inside, `('ab\x1fc','x')` and
`('ab','c\x1fx')` would collide. A raw string must also be well-formed Unicode (an unpaired
surrogate is replaced by U+FFFD on the way to UTF-8, and two envelopes would share a
checksum), a non-string value must be JSON-safe (finite, plain, acyclic: `NaN` and
`Infinity` both serialise as `null`), every instant is a calendar instant at millisecond
precision, and the shape is closed: a member the contract does not name is refused, because
the checksum would not cover it. `previous_checksum` is the predecessor's DECLARED
checksum: an edited predecessor is reported once, on its own line (`checksum_mismatch`);
a removed one shows on the successor (`sequence_gap` + `previous_checksum_mismatch`); a
removed tail shows only against the committed `heads` (`stream_head_mismatch`). A withdrawal
must name an assertion that is on the ledger (`unresolved_target`) and in its own stream
(`cross_stream_target`, invariant 4); the snapshot ignores a cross-stream withdrawal, and at
equal `recorded_at` a retraction closes before a supersession. The
snapshot hash is SHA-256 over `in_scope`, then `excluded` as `id=reason`, then `undecided`
as `id=reason`, each list joined by `\x1f`, the three joined by `\x1e`, ids sorted.

## Regenerating

```
npx tsx tests/fixtures/temporal-assertion/generate.ts
sha256sum $(cd tests/fixtures/temporal-assertion && find . -type f | sort | sed 's#^\./##')
```

Run from `tests/fixtures/temporal-assertion` for the second line, then update
`FIXTURE_HASHES` in `tests/unit/contracts/temporal-assertion.test.ts`. If the generator
stops on "reasoned expectation vs reference", one of the two is wrong: decide which from
the invariants before touching either.
