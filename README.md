# SwiftCsv — a fast drop-in for csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/yayass-crypto/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/yayass-crypto/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Entry for [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
— "Read broken CSV files faster, 21 November 2026" ($100 pot, 10 places × $10 USDC).

`solve.js` answers exactly as make.fun's own csv-reader 1.0.0 on every case
(`{columns, rows, errors}` for each `{text, header}`), under the same
broken-row policy: BOM dropped, LF/CRLF record ends, stray CRs dropped with a
`stray_cr` error, quoted fields with `""` doubling and CRLF/lone-CR read as LF,
`quote_junk` after a closing quote, `unterminated_quote` re-read as unquoted,
short/long rows padded/cut to the first record's width with `fields`/`extra`.

It is only faster: plain quoteless lines are split in native code, unquoted
fields are found with `indexOf`, quoted fields with one regex scan per special
character, and no result object is allocated per field.

## Run

```sh
node main.ts  # reads cases.json, writes answers.json
```

`main.ts` is the harness driver (Node 22, `MAKEFUN_INPUT_DIR` /
`MAKEFUN_OUTPUT_DIR` stand in for `/input` / `/output` outside a container).
`solve.js` is a dependency-free ES module exporting `run(input)`.

## Local results (practice set, 6 cases, ~11 MB of CSV)

- Correctness: **6/6 cases identical** to csv-reader 1.0.0 (also 6/6 on two
  fresh sets drawn from the kit's own generator with different seeds, and
  0 mismatches on 6,506 fuzz cases against the reference).
- Speed (CPU time, median of 9 interleaved runs on this machine):
  SwiftCsv **~220 ms** per 6-case set vs csv-reader 1.0.0 **~730 ms**
  — about **3.3× faster** than the house baseline.

## License

MIT — see [LICENSE](LICENSE).
