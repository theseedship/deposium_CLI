> Revision: 2026-08-27

# Temporal-Assertion Command

The `temporal-assertion` command is an offline oracle for `temporal-assertion/v1` fixtures.

It carries a second, independent implementation of the bitemporal assertion contract that
lives in the MCPs repository (`src/contracts/temporal-assertion.ts`), written from the rules
that contract documents rather than copied from its code. Run over a fixtures directory, it
recomputes every envelope checksum, every chain verdict per `claim_stream_id` and every
AT / AS OF snapshot with the CLI's own code, then compares the result with what the fixtures
say it should be. Two implementations landing on the same hashes is the whole point: one
implementation agreeing with itself proves nothing.

The command reads no configuration and contacts no server. No API key, no base URL, no MCP
client: the preflight that resolves the server URL skips it entirely, so it runs on a machine
with no Deposium instance and with an absent or unusable configuration file.

## Usage

```bash
deposium temporal-assertion verify --fixtures <dir>
```

## Options

- `--fixtures <dir>`: Fixtures directory to verify (required).
- `--json`: Print the full report as JSON instead of human-readable lines.

## What a fixtures directory contains

| Path                     | Contents                                                            |
| :----------------------- | :------------------------------------------------------------------ |
| `scenarios/<name>.jsonl` | One ledger per file, one `temporal-assertion/v1` envelope per line. |
| `cases/<name>.json`      | The expectations for one scenario (see below).                      |
| `README.md`              | How the envelopes were derived, and from which real rows.           |
| `source/`                | The read-only export the fixtures were built from.                  |

A case file holds three things:

- `heads`: per `claim_stream_id`, the `sequence_no` and the declared checksum of the last
  line of that stream, committed outside the ledger. A stream cut after its last line is a
  valid shorter stream, so a head held elsewhere is the only witness of a removed tail.
- `chain`: the expected report of the chain audit run against those heads.
- `cases`: a list of typed queries (`time_axis`, `valid_at`, `as_of`) with the expected
  `in_scope`, `excluded`, `undecided` and snapshot `hash`.

Non-canonical spellings are accepted (`queries` for `cases`, `expect` for `expected`,
`ledger` for `scenario`, and so on). Every key read under a non-canonical name is listed
under `assumptions` in the output, so the other side of the fixtures can be told exactly what
was assumed. A field that is present but of the wrong type is not treated as absent: it is
recorded as a problem and fails the case.

## Reading the output

- `PASS <scenario>/<case name>`: the CLI recomputed the snapshot the case file expects,
  including its hash.
- `CHAIN PASS <scenario>`: the chain audit found exactly the findings the case file expects,
  its committed heads included.
- `FAIL ...`: a mismatch, with the diff on the same line. A `FAIL` named
  `<scenario>/<file>.json` is a problem in the case file itself, such as a malformed expected
  field or a query instant that is not a real calendar instant.
- `UNCHECKED <scenario>`: no case file refers to that ledger. Its chain is audited all the
  same, so a tampered checksum still surfaces, and the run fails: a scenario nobody states an
  expectation about is a hole in the bench, not a pass.

## Exit codes

| Code | Meaning                                                                                    |
| :--- | :----------------------------------------------------------------------------------------- |
| `0`  | Every case and every chain passed, and no scenario was left unchecked.                     |
| `1`  | Any `FAIL`, any scenario no case file refers to, or an empty or absent fixtures directory. |

An empty or absent directory is deliberately not a success. A bench that runs against nothing
prints an explicit empty state, reports `0 PASS` and exits 1.

## Examples

```bash
# The fixtures vendored with the CLI, byte for byte from the MCPs repository
deposium temporal-assertion verify --fixtures src/__tests__/fixtures/temporal-assertion

# The canonical fixtures of a checked-out MCPs working tree
deposium temporal-assertion verify --fixtures ../deposium_MCPs/tests/fixtures/temporal-assertion

# The full report, for a script or a diff
deposium temporal-assertion verify --fixtures ./fixtures --json
```
