# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Repository status: early / pre-code

As of this writing, **this repository contains no application code yet**. The
entire tree is:

```
price-tracker/
├── README.md      # one line: "# price-tracker"
└── CLAUDE.md      # this file
```

There is no build system, no dependency manifest (`package.json`,
`pyproject.toml`, `go.mod`, etc.), no source directory, no tests, and no CI
configuration. Do not describe or assume a structure that does not exist on
disk. When you add the first real code, **update this file in the same change**
so it always reflects reality.

The sections below record the conventions that *are* already established (git
workflow) and provide sensible defaults to adopt when the project gains code.
Treat the "Intended project" section as a proposal, not as documentation of
something that exists.

## What this project is meant to be

The repository name is `price-tracker`. The intended purpose — tracking prices
of products/assets over time — is inferred from the name only; there is no spec
or issue history to confirm scope. Before building substantial features,
confirm the intended direction with the repository owner rather than guessing.

## Git workflow (established)

- **Default branch:** `main`.
- **Feature branches:** do all work on a dedicated branch, never commit
  directly to `main`. The current working branch is
  `claude/claude-md-docs-mjpizo`.
- **Commits:** small, focused, with clear descriptive messages.
- **Push:** `git push -u origin <branch-name>`. On network failure, retry with
  exponential backoff (2s, 4s, 8s, 16s).
- **Pull requests:** only open a PR when explicitly asked. If a PR template
  exists under `.github/`, follow its structure.
- **Merged branch = finished.** If this branch's PR has already been merged,
  restart the branch from the latest `main` for follow-up work rather than
  stacking new commits on merged history.

## Working conventions for AI assistants

1. **Stay accurate.** This file must match the actual state of the tree. If you
   read it and it disagrees with what's on disk, fix the file.
2. **No invented structure.** Don't document directories, commands, or
   frameworks that aren't present.
3. **Introduce tooling deliberately.** When you add the first language/runtime,
   also add: a dependency manifest, a lockfile, a `.gitignore`, and a short
   "Development" section below documenting how to install, run, test, and lint.
4. **Keep README and CLAUDE.md in sync** on any structural change.

## Intended project setup (proposal — adopt when adding code)

Fill these in as soon as they become real. Delete this notice once the section
describes actual, runnable commands.

- **Install dependencies:** _TBD_
- **Run the app:** _TBD_
- **Run tests:** _TBD_
- **Lint / format:** _TBD_
- **Build:** _TBD_

### Suggested initial structure

A typical layout for a price-tracker, to be confirmed before adoption:

```
src/          # application source
tests/        # automated tests
config/       # configuration (tracked targets, thresholds)
```

Choose the stack that fits the owner's needs (e.g. a Python service with
scheduled scraping + a datastore, or a Node/TypeScript service) and record the
decision here.
