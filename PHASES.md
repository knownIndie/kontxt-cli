# Extended Implementation Phases

This file tracks the phased rollout for `src/core/extended/**`.

## Phase 1: Foundation __done

Target:
- establish safe runtime primitives without destabilizing legacy behavior.

Scope:
- `foundation/encoding.ts`: shared singleton token encoder (`cl100k_base`)
- `foundation/concurrency.ts`: bounded file read concurrency
- `foundation/binary.ts`: fast binary detection (null-byte check)
- `foundation/constants.ts`: unified ignore constants and patterns
- `foundation/cost.ts`: input token cost estimation

Integration:
- keep legacy core intact,
- wire through orchestration layer with minimal CLI impact.

Acceptance:
- no crash on binary files,
- bounded read concurrency,
- per-file errors are surfaced as structured results,
- token and cost summary available.


## Phase 2: Skeleton Mode (Tree-sitter)

Target:
- reduce token load while preserving semantic structure.

Scope:
- parser initialization and grammar caching,
- language query packs (TS/JS/Python first),
- skeleton extraction (`skeletonize(file) => string | null`).

Behavior:
- supported files become skeleton output,
- unsupported or parse-failed files gracefully fall back.

Acceptance:
- declarations/imports retained,
- bodies stripped where expected,
- fallback works without pipeline break.

Status:
- TypeScript AST-backed JS/TS skeleton mode exists behind `--skeleton`,
- Tree-sitter parser support is still not implemented.

## Phase 3: Budget Mode

Target:
- enforce hard token budget without opaque heuristics.

Scope:
- budget selector (small files full, larger files skeletonized),
- strict token cap enforcement,
- budget usage reporting and omitted-file reporting.

Acceptance:
- output never exceeds budget,
- omitted counts are deterministic and visible.

## Phase 4: Security and Redaction

Target:
- default-safe output posture.

Scope:
- known secret regex families,
- entropy-based unknown secret detection,
- redaction pass with no double masking.

Behavior:
- redact by default,
- allow explicit override via `--force`.

Acceptance:
- known secrets are masked,
- unknown secret-like tokens are caught with bounded false positives.

## Phase 5: Git Intelligence

Target:
- prioritize changed code context.

Scope:
- detect git repo and changed files,
- support `diff` mode and `--since <branch>`,
- assemble hybrid context: full changed files, skeleton for surrounding files.

Acceptance:
- changed-file detection is correct for dirty and branch-diff scenarios.

Status:
- first-pass dirty/staged/untracked file selection exists behind `--changed`,
- staged-only file selection exists behind `--staged`,
- stash path selection exists behind `--stash`,
- branch diff file selection exists behind `--since <ref>`.

## Phase 6: DX, Config, Test, Ship  __partial

Target:
- complete operational developer experience.

Scope:
- `.kontxtignore` support and merge strategy,
- active extended test coverage,
- publish-ready docs and metadata.

Acceptance:
- ignore config works predictably,
- active extended tests cover the supported pipeline,
- publish-ready docs and metadata are complete.

## Guiding Constraints Across All Phases

- `extended` is additive and isolated, not rewrite-in-place.
- Legacy path remains available during transition.
- CLI parsing stays separate from business logic.
- Stage outputs remain explainable and deterministic.
