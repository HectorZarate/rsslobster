# Contributing to RSS Lobster

Thanks for your interest in contributing. This document covers the workflow and standards for the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/rsslobster.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b your-branch-name`
5. Make your changes
6. Run the full check suite: `pnpm check`
7. Commit and push
8. Open a pull request

## Development Environment

- **Node.js** >= 22.0.0
- **pnpm** >= 10
- A pre-commit hook runs `pnpm check` (lint + typecheck + tests) automatically

## Code Standards

### TypeScript

- Strict mode is enabled — no `any` types, no unchecked index access
- ESM only (`import`/`export`, no `require`)
- Target ES2024 — use modern APIs (`structuredClone`, `Object.groupBy`, etc.)

### Style

- Use `oxlint` for linting — run `pnpm lint` to check
- No external CSS frameworks or fonts in generated output
- System font stacks only
- Keep runtime dependencies minimal — justify any new dependency in your PR

### Testing

- Write tests for all new functionality
- Tests live next to source files: `foo.ts` → `foo.test.ts`
- Use [Vitest](https://vitest.dev) — `pnpm test` to run
- Coverage thresholds are enforced at 80% for branches, functions, lines, and statements
- Test accessibility standards (WCAG AA) where applicable

### Commits

- Write clear, descriptive commit messages
- Keep commits focused — one logical change per commit
- The pre-commit hook must pass before committing

## Pull Requests

### Before Submitting

- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] New code has test coverage
- [ ] No new runtime dependencies without discussion

### PR Guidelines

- Keep PRs focused on a single concern
- Describe **what** changed and **why** in the PR description
- Link related issues with `Fixes #123` or `Closes #123`
- Be responsive to review feedback

## Reporting Bugs

Open an issue using the **Bug Report** template. Include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version and OS

## Requesting Features

Open an issue using the **Feature Request** template. Describe the use case and why it matters.

## Architecture Notes

Before making significant changes, familiarize yourself with the project's design principles:

- **Files as API** — git is the database, HTML is the output
- **Composition over abstraction** — functions that take data and return data
- **Zero JavaScript in output** — generated sites work without JS
- **Minimal dependencies** — pure TypeScript where possible
- **Test-first** — write the test before the implementation

See [PLAN.md](PLAN.md) for the full technical architecture.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions?

Open a discussion or issue — we're happy to help.
