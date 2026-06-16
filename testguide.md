# Test Guide (`kontxt-cli`)

This file explains the current test suite, what each test file validates, and how to run tests reliably.

The supported implementation path is the extended pipeline. Legacy tests remain in the repository as historical/reference coverage, but they are skipped because legacy behavior is deprecated and should not drive new work.

## Active Test Files

- `tests/extended.foundation.test.ts`
- `tests/cli.extended.test.ts`
- `tests/helpers/temp.ts` (shared helper, not a test suite)

## Legacy Reference Test Files

- `tests/core.legacy.test.ts` (skipped)
- `tests/cli.legacy.test.ts` (skipped)
- `tests/faultfinding.rigorous.test.ts` (skipped)

## How To Run

Run all tests:

```bash
bun test
```

Run the supported extended suite:

```bash
bun test tests/extended.foundation.test.ts tests/cli.extended.test.ts
```

Run a single suite:

```bash
bun test tests/extended.foundation.test.ts
bun test tests/cli.extended.test.ts
```

Recommended sanity checks after test updates:

```bash
bun run build
bun run lint
```

## Suite Breakdown

## `tests/extended.foundation.test.ts`

Purpose: validate the extended pipeline's core foundation behavior.

Coverage:
- Binary detection using the null-byte sampling heuristic.
- Deterministic token counting.
- Summary filename resolution and validation.
- Deterministic tree formatting.
- Escaping file content that could break XML-like framing.
- Writing summary files under `.kontxt/`.
- Split summary generation within final rendered token budgets.
- Stale split markdown cleanup.
- Unified ignore behavior, including `.kontxtignore`.
- Traversal protection.
- Per-file read error isolation.
- Extended pipeline report metadata.

## `tests/cli.extended.test.ts`

Purpose: smoke-test built CLI behavior for the supported extended path.

Coverage:
- `kontxt -t` prints tree-only output and does not write `.kontxt`.
- `kontxt -e -o` creates the default dated summary file.
- `kontxt -e -o <name>` appends `.md` when missing.
- Invalid output path segments fail with a validation error.
- `kontxt -e --32k`, `--64k`, and `--128k` route to split directories.
- Split flags require `-e`.
- Split flags cannot be combined with `-o`.

Implementation details:
- Builds `dist/index.js` in `beforeAll`.
- Uses temp workspace directories for each test.
- Uses a bootstrap runner with frozen `Date` for deterministic default filename assertions.

## `tests/core.legacy.test.ts` (skipped)

Purpose: validate deterministic legacy behavior of core functions.

Coverage:
- Tree formatting helpers:
  - `buildTree`
  - `renderTree`
  - `formatTree`
- Context serialization:
  - `formatContext` output shape (`<tree>`, `<file path="...">`)
- Summary writing:
  - default dated filename when output name is omitted
  - custom filename under `.kontxt/`
  - invalid filename rejection (`""`, `.`, `..`, `nested/custom.md`)
- Discovery/read behaviors:
  - ignore rules in `getFiles`
  - unknown extension + extensionless files are included where expected
  - `readOneFile` metadata/content assertions
  - `readAllFiles` happy path
  - explicit read failure scenarios (directory input, unreadable file)

Time handling:
- Date is frozen for deterministic default filename assertion.

## `tests/cli.legacy.test.ts` (skipped)

Purpose: smoke-test built CLI behavior at process level.

Coverage:
- `kontxt` (no args) prints utility info and exits success.
- `kontxt -o` creates default dated summary file.
- `kontxt -o custom.md` creates custom summary file.
- `kontxt -o nested/custom.md` exits non-zero with validation error.

Implementation details:
- Builds `dist/index.js` in `beforeAll`.
- Uses temp workspace directories for each test.
- Uses a bootstrap runner with frozen `Date` for deterministic `-o` default filename.

## `tests/faultfinding.rigorous.test.ts` (skipped)

Purpose: stronger fault-finding/security-hardening expectations beyond current legacy baseline.

Checks included:
- path traversal protection in `readOneFile`
- per-file read failure isolation in `readAllFiles`
- binary-file skipping
- escaping content that can break `<file>` framing
- ignore-policy consistency between discovery and tree generation
- deterministic tree rendering regardless of input order
- output filename control-character rejection

Important:
- This suite identifies historical legacy gaps.
- Do not use it as the acceptance target for new extended work unless a legacy gap is intentionally being ported into extended coverage.

## Helper: `tests/helpers/temp.ts`

Shared utilities:
- create isolated temp directories
- clean up temp directories
- create fixture files with parent directories

This keeps tests isolated from repo state and avoids writing to source paths.

## Current Testing Model

- Supported path confidence: `extended.foundation` + `cli.extended`.
- Legacy suites are retained as reference material only.
- New work should add or update extended tests, not legacy tests.
