# Developer Lifecycle

Follow this lifecycle for all development work:

1. **Spec Phase**: Write `docs/spec.md`. DO NOT code yet.
2. **Roadmap Phase**: Break spec into `docs/roadmap.md` with 5-7 distinct features.
3. **Execution**: Implement one feature, run tests, then `git commit`.
4. **Verification**: Run `node test-extension.js` — this tests the unpacked extension in both Chrome and Firefox via Playwright, navigates to rohlik.cz category pages, and saves screenshots to `screenshots/`. Confirm badges appear in both browsers before proceeding.
5. **Progress**: Update `docs/progress.md` with what was completed.
6. **Approval**: Ask for permission ONLY after the `git commit` is successful.

Always commit changes as you go. Every meaningful change should be committed immediately.

Always commit changes as you go. Every meaningful change should be committed immediately.

# Git Setup

At the start of every session, ensure git is initialized and identity is set:
```
git init
git config user.name "fonkeMonkey"
git config user.email "fonkemonkey@users.noreply.github.com"
```

On first session, create a `.gitignore` appropriate for the project type (node_modules, .env, build/, dist/, *.log, .DS_Store).

Before the first push, create a `README.md` with a short description of the project, how to run it, and what it does.

If no remote exists yet, create a GitHub repo under the fonkeMonkey account and push:
```
gh repo create fonkeMonkey/<project-name> --public --source=. --push
```

Push to GitHub after every successfully completed feature.

# Dependencies

Prefer no external dependencies where possible. If a package is needed, add a comment in the commit message explaining why. Never install a package just for convenience.

# Dev Server

When the user wants to preview the project, kill any existing process on port 3000 first, then serve:
```
pkill -f "http.server 3000" 2>/dev/null; python3 -m http.server 3000
```
Run from `/home/claude/workspace`. Do this automatically without being asked.

# Error Handling

- If a test fails: fix it, do not move to the next feature.
- If the build is broken: revert the last change and try a different approach.
- If stuck on the same problem after 3 attempts: stop and ask the user.
- When debugging any issue, invoke the `superpowers:systematic-debugging` skill.

# Verification

Before marking any feature as complete or making a commit, invoke the `superpowers:verification-before-completion` skill.

# Resuming Work

At the start of each session, read `docs/progress.md` and `docs/roadmap.md` to understand where to continue. Do not ask the user — figure it out from the docs and git log.
