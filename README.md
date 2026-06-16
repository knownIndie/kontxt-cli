# kontxt-cli

`kontxt` packages a codebase into AI-ready markdown context files.

The supported path is the extended pipeline.
The old `-o` legacy flow still exists, but it is deprecated.

For now:
- the published npm package name is `kontxt-cli`
- the installed CLI command is `kontxt`

npm package:
- [kontxt-cli](https://www.npmjs.com/package/kontxt-cli)

## Install

### npm

```bash
npm install -g kontxt-cli
```

This installs the `kontxt` command globally from the `kontxt-cli` package.

### pnpm

```bash
pnpm add -g kontxt-cli
```

This installs the `kontxt` command globally from the `kontxt-cli` package.

### Verify

```bash
kontxt --help
```

### Run Without Global Install

With npm:

```bash
npx kontxt-cli --help
```

With pnpm:

```bash
pnpm dlx kontxt-cli --help
```

This runs the published `kontxt-cli` package directly without a global install.

## Requirements

- Node.js 18 or newer

## Usage

Run `kontxt` inside the repository you want to package.

The command name is `kontxt`, even though the npm package name is still `kontxt-cli`.

### Extended Summary

```bash
kontxt -e
```

This runs the extended pipeline and writes a single summary file under:

```text
.kontxt/<DD-M-YYYY>-<mode>-summary.md
```

You can also provide a custom file name:

```bash
kontxt -e -o custom.md
```

That writes:

```text
.kontxt/custom.md
```

### Extended Split Mode

```bash
kontxt -e --32k
kontxt -e --64k
kontxt -e --128k
```

This writes split summaries under:
- `.kontxt/32k-token/`
- `.kontxt/64k-token/`
- `.kontxt/128k-token/`

Generated files are deterministic:
- `<DD-M-YYYY>-<mode>-part-001.md`
- `<DD-M-YYYY>-<mode>-part-002.md`
- `<DD-M-YYYY>-<mode>-part-003.md`

Split-mode rules:
- must be used with `-e`
- use only one split flag at a time
- each part stays within the selected token budget based on the final rendered markdown
- each part includes the full repository tree
- each run removes old markdown part files in that split directory before writing the new set
- `-o` cannot be combined with split mode

Default output names include the active mode, for example:
- `6-4-2026-full-summary.md`
- `6-4-2026-changed-summary.md`
- `6-4-2026-staged-skeleton-summary.md`
- `6-4-2026-since-main-summary.md`

### Changed Files Only

```bash
kontxt -e --changed
```

This packages only changed, staged, and untracked files reported by Git.

Use this when you want context for local work that has not been committed or pushed yet.

### Staged Files Only

```bash
kontxt -e --staged
```

This packages only files currently staged in Git.

Use this when you have curated the exact changes you want reviewed.

### Stash Files

```bash
kontxt -e --stash
kontxt -e --stash 'stash@{1}'
```

This packages file contents directly from a Git stash ref.

### Branch Diff Mode

```bash
kontxt -e --since main
```

This packages files changed on the current branch since the merge-base with the provided Git ref.

Use this when you want context for branch work that is committed locally but not merged yet.

### Skeleton Mode

```bash
kontxt -e --skeleton
```

This keeps lightweight JS/TS structure where supported: imports, declarations, class/function/type signatures, and test names. Unsupported files fall back to full content.

### Tree Only

```bash
kontxt -t
```

This prints the repository tree in the terminal and does not write summary files.

### Deprecated Legacy Mode

```bash
kontxt -o
kontxt -o custom.md
```

This still works, but it is deprecated and should not be the path you rely on.

## Typical Workflow

1. Open the target repository in your terminal.
2. Run `kontxt -e` for one full summary, or `kontxt -e --32k` / `--64k` / `--128k` for split output.
3. Open the generated files in `.kontxt/`.
4. Feed the output to your LLM or downstream tooling.

## Ignore Rules

`kontxt` respects `.gitignore` and `.kontxtignore`.

If `.kontxtignore` does not exist, `kontxt` creates it automatically.

Example `.kontxtignore`:

```text
dist
coverage
.env
*.log
```

## CLI Reference

```bash
# help
kontxt --help

# extended single summary
kontxt -e
kontxt -e -o custom.md

# extended split summary
kontxt -e --32k
kontxt -e --64k
kontxt -e --128k

# changed files and skeleton mode
kontxt -e --changed
kontxt -e --staged
kontxt -e --stash
kontxt -e --since main
kontxt -e --skeleton
kontxt -e --changed --skeleton
kontxt -e --staged --skeleton
kontxt -e --stash --skeleton
kontxt -e --since main --skeleton

# tree only
kontxt -t

# deprecated legacy mode
kontxt -o
kontxt -o custom.md
```

## Development

With npm:

```bash
npm install
npm run build
npm test
```

With pnpm:

```bash
pnpm install
pnpm run build
pnpm test
```

Additional scripts:

```bash
npm run test:all
npm run test:legacy:deprecated
```
