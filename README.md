# kontxt-cli

`kontxt` packages a codebase into AI-ready markdown context files.

The supported path is the extended pipeline.
The old `-o` legacy flow still exists, but it is deprecated.

## Install

### npm

```bash
npm install -g kontxt-cli
```

### pnpm

```bash
pnpm add -g kontxt-cli
```

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

## Requirements

- Node.js 18 or newer

## Usage

Run `kontxt` inside the repository you want to package.

### Extended Summary

```bash
kontxt -e
```

This runs the extended pipeline and writes a single summary file under:

```text
.kontxt/<DD-M-YYYY>-summary.md
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
- `part-001.md`
- `part-002.md`
- `part-003.md`

Split-mode rules:
- must be used with `-e`
- use only one split flag at a time
- each part stays within the selected token budget based on the final rendered markdown
- each part includes the full repository tree
- each run removes old markdown part files in that split directory before writing the new set
- `-o` cannot be combined with split mode

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
