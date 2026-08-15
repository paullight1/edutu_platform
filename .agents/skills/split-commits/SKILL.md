---
name: split-commits
description: Split mixed Git changes into small, coherent, reviewable commits using status and diff inspection plus interactive staging. Use when the user wants to break up a large commit, organize uncommitted work, improve commit history, or stage only selected files, hunks, or lines. Preserve unrelated changes and never rewrite shared or pushed history without explicit confirmation.
---

# Split Commits

Turn a mixed working tree or overly broad local commit into a sequence of meaningful commits. A good commit represents one logical change and can be understood, reviewed, tested, and reverted independently.

## Safety rules

- Inspect before changing anything: run `git status --short` and review `git diff` (and `git diff --cached` when relevant).
- Treat existing user changes as precious. Do not discard, reset, clean, checkout, or amend them unless the user explicitly asks.
- Keep unrelated files and generated/environment files out of feature commits unless the user says they belong.
- Do not rewrite commits that have been pushed or shared without explicit confirmation.
- Before each commit, show or inspect the staged diff and verify it is internally coherent.
- Prefer logical boundaries over an arbitrary number of commits. Commit count is not the goal.

## Workflow

### 1. Establish the starting point

Run:

```bash
git status --short
git diff --stat
git diff
git diff --cached
```

If the working tree contains unrelated changes, identify them and leave them untouched. If the request is ambiguous, make a reasonable grouping based on files, symbols, tests, migrations, and documentation; ask only if grouping would materially change the result.

For a commit that already contains everything, first check whether it is local and safe to rewrite:

```bash
git log -1 --oneline --decorate
git status --branch --short
```

Use `git reset HEAD~1` only for an unpushed commit and only after confirming that preserving the working-tree contents is safe. Never use a destructive reset such as `git reset --hard`.

### 2. Design the commit series

Group changes by intent, not by file size. Typical boundaries include:

- feature or behavior change
- bug fix
- tests for that change
- refactor required to support it
- database/schema or migration change
- documentation or configuration change

Keep a test with the behavior it verifies when possible. If a change cannot stand alone without another change, commit the prerequisite first and make the dependency clear in the message.

### 3. Stage one logical change

Use the least broad staging command that fits:

```bash
git add path/to/file                  # whole file is one logical unit
git add -p                            # choose hunks interactively
git add -p path/to/file               # choose hunks in one file
```

Interactive staging keys:

- `y`: stage the displayed hunk
- `n`: leave it unstaged
- `s`: split the hunk into smaller hunks
- `e`: edit the hunk and stage only selected lines
- `q`: stop staging
- `?`: show all available commands

When a hunk combines unrelated nearby lines, use `s` first. If it still cannot be separated, use `e` carefully and preserve valid patch context. For new files that contain multiple concerns, consider temporarily staging selected sections with patch mode or splitting the file only if that is safe and requested.

### 4. Verify before committing

Run:

```bash
git diff --cached --stat
git diff --cached
git diff                         # confirm remaining work is still present
```

Check that the staged patch:

- has one clear purpose;
- does not contain secrets, generated files, editor metadata, or unrelated edits;
- includes required tests or migration companions where appropriate;
- does not leave broken syntax or an impossible intermediate state.

Run the smallest relevant formatter, typecheck, or test when practical. If the commit intentionally cannot pass independently, explain the dependency before committing.

### 5. Commit and continue

Create a focused message in the repository’s existing style:

```bash
git commit -m "Add scholarship filtering"
```

After each commit, inspect the remaining work:

```bash
git status --short
git diff --stat
```

Repeat staging, verification, and committing until the intended logical changes are complete. Do not automatically commit unrelated leftovers.

## Splitting the latest local commit

For an unpushed commit that mixed several changes:

```bash
git reset HEAD~1
git status --short
git add -p
git diff --cached
git commit -m "First logical change"
git add -p
git diff --cached
git commit -m "Second logical change"
```

`git reset HEAD~1` is a mixed reset: it removes the commit while keeping the file changes in the working tree. Confirm the commit is local first. If it has been pushed, prefer creating follow-up corrective commits, or ask for explicit permission before considering history rewriting and force-push implications.

## Completion report

Report the resulting commit hashes and messages, any files intentionally left unstaged, and the checks run. If the user asked for instructions rather than execution, explain the commands and let them perform the commits.
