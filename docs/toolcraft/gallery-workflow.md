# Development of an accepted gallery release

This optional workflow applies only to a published application containing a valid
`toolcraft-release.json`. A fresh starter without that record still requires its
normal initial functional delivery. Never create a release record in product code.

The gallery owner has accepted these existing products as finished. The committed,
generator-signed record establishes **accepted existing product**, not a claim that
new delivery or performance tests were executed. It survives Git clone, directory
copy, package installation, machine changes and subsequent product edits. Do not
remove it or manufacture `.toolcraft/verification/checkpoint.json`.

## Ordinary edits

1. Read the affected product implementation and its pinned runtime contract.
2. Change only the requested behavior. Keep the relevant unit/component test small:
   `pnpm exec vitest run path/to/product.test.ts -t 'exact test name'`.
3. Find acceptance IDs with `pnpm test:feature -- --list`; this loads source once,
   but does not start a browser, build, or collect the Playwright catalog. It lists
   both available IDs and inherited missing/ambiguous mappings separately. For an
   unmapped feature, add its focused test before claiming that edit is verified;
   owner acceptance never turns missing test coverage into a passing test.
4. Once stable, run `pnpm test:feature -- <acceptance-id>`. It runs the existing real
   functional scenario in its exact file; unrelated spec files are not collected.
   On failure, diagnose and rerun only the failed ID. Add a new focused scenario
   when the existing grouped legacy scenario is too broad for the edit.
5. Record the changed behavior, checks actually run, outcomes and known risks in
   `docs/toolcraft/agent-worklog.md` (or the existing legacy worklog).

Bare `pnpm verify:delivery` validates the portable release/workflow and exits with
`focused-development-only`, without a build, inventory, browser, or test run.
Legacy `verify:final` aliases, where present, have the same behavior. Neither
command certifies the latest edit. A changed product file does not revoke the
accepted initial version or create another full-delivery obligation.

Do not automatically run full test, AI/integrity, typecheck, build, export/reload
matrices, browser suites or performance. A conditional extra needs a direct reason
related to the changed behavior. `--all` is explicit functional acceptance only,
for changes that genuinely cannot be bounded to individual IDs.

## Compatibility and new acceptance

Runtime, controls, renderer, assets and dependency versions remain pinned. This
migration does not claim they implement every new runtime API or semantic proof
recipe. Existing browser assertions are retained, not rewritten or weakened.
Focused results mean those selected scenarios passed, not full certification.

Old `browser: true` / `browserTestName` rows resolve their exact files through the
product-owned `scripts/gallery-feature-catalog.json`. Add/update that mapping when
adding or renaming an old-style scenario; do not collect the whole browser catalog
on ordinary edits. New-compatible rows may instead declare
`browser: { file: 'e2e/product-domain.spec.ts', testName: 'browser: ...', budget:
'standard' }` if the pinned acceptance types support it. Standard is 30 seconds;
`extended-io` is 120 seconds for media/export/persistence. Some legacy tests have
their own internal timeout; the runner also has a bounded process deadline.
Missing, unknown, duplicate, skipped, expected-failure, empty and failed selections
cannot be reported as success. No focused run writes a delivery/performance receipt.

## Performance and framework work

Performance is separate, explicitly requested work. Localize the reported visible
operation and run only its existing targeted performance scenario; do not infer
an aggregate review from a complaint. Full `verify:perf`/legacy browser performance
commands require an explicit full-review request. Older apps retain their existing
performance tooling: this overlay does not convert its receipt formats.

Framework fixes belong in the source starter/runtime/UI owners, then regeneration.
The gallery workflow is maintained in source `gallery-installers/workflow/`
and distributed by `scripts/migrate-gallery-workflow.mjs`. Do not hand-edit signed
workflow files or re-sign unrelated inherited integrity mismatches. Product
acceptance mappings remain editable. This workflow supersedes obsolete first-
delivery/full-final-gate instructions in the app's historical documentation.
