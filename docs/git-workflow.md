# Git workflow

This repository is a product fork.

- `origin` points to `tallpizza/ontology`
- `upstream` points to `anomalyco/opencode`
- `dev` is the shared integration branch
- feature work happens on short-lived branches such as `feat/ontology`

## Remote layout

Use this remote model in every clone:

```bash
git remote -v
```

Expected shape:

```bash
origin   git@github.com:tallpizza/ontology.git
upstream git@github.com:anomalyco/opencode.git
```

## Branch policy

`dev` is the branch used to absorb upstream updates and stage integrated product changes.

Do not treat `dev` as a scratch branch for unfinished work. Create a feature branch instead:

```bash
git switch dev
git switch -c feat/my-change
```

Suggested prefixes:

- `feat/*` for product features
- `fix/*` for bug fixes
- `chore/*` for maintenance
- `docs/*` for documentation-only changes

## Syncing with upstream

Fetch first, then choose how to apply upstream changes deliberately.

```bash
git fetch upstream
```

If `dev` should move toward upstream while preserving local integration commits, rebase or merge with intent:

```bash
git switch dev
git rebase upstream/dev
```

If a local clone is only being used to mirror upstream exactly, reset explicitly instead of using a vague `git pull`:

```bash
git switch dev
git fetch upstream
git reset --hard upstream/dev
git push origin dev --force-with-lease
```

Only use the reset flow when you intentionally want `origin/dev` to match upstream exactly.

## Daily workflow

Start new work from the current integration branch:

```bash
git fetch upstream
git switch dev
git rebase upstream/dev
git switch -c feat/my-change
```

Publish a branch:

```bash
git push -u origin feat/my-change
```

## Pull request model

Most product work should open pull requests from a feature branch in `tallpizza/ontology` into `dev` in `tallpizza/ontology`.

Upstream pull requests to `anomalyco/opencode` are a separate decision. Only upstream generic improvements that make sense outside the ontology product.

## Rules of thumb

- Prefer `git fetch` plus an explicit `rebase`, `merge`, or `reset`
- Avoid blind `git pull` on important branches
- Keep ontology-specific work isolated on feature branches until ready
- Sync upstream often enough to avoid long-running divergence
