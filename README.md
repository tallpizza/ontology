# ontology

`ontology` is a product fork of `anomalyco/opencode` focused on ontology-based chat, graph-native navigation, and structured knowledge workflows.

This repository is not a contribution fork that only carries small patches upstream. It is the main application repo for building a new product on top of the OpenCode base.

## Purpose

- Turn OpenCode into an ontology-aware application.
- Add graph-backed exploration, chat, and workspace flows.
- Keep useful upstream improvements while allowing product-specific divergence.

## Project status

- Fork source: `anomalyco/opencode`
- Product repo: `tallpizza/ontology`
- Main remote model: `origin = tallpizza/ontology`, `upstream = anomalyco/opencode`
- Default branch: `dev`
- Active work branch: `feat/ontology`

## Docs

- Fork and branch workflow: [`docs/git-workflow.md`](docs/git-workflow.md)
- Product architecture: [`docs/architecture.md`](docs/architecture.md)
- Upstream contribution guide inherited from OpenCode: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Development

Install dependencies and run the project from the repo root:

```bash
bun install
bun dev
```

For the inherited OpenCode development surface, the existing package structure still applies:

- `packages/opencode`: server, CLI, and core runtime
- `packages/app`: shared app UI
- `packages/desktop`: desktop wrapper
- `packages/sdk/js`: JavaScript SDK

## Product direction

The long-term goal is to evolve this codebase from a general AI coding agent into an ontology-first environment where conversation, graph traversal, and workspace context reinforce each other.

That means some parts of the fork will stay close to upstream, while ontology-specific features may intentionally diverge.
