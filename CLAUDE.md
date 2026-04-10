# Developer Lifecycle

Follow this lifecycle for all development work:

1. **Spec Phase**: Write `docs/spec.md`. DO NOT code yet.
2. **Roadmap Phase**: Break spec into `docs/roadmap.md` with 5-7 distinct features.
3. **Execution**: Implement one feature, run tests, then `git commit`.
4. **Verification**: Start the dev server, open `http://localhost:3000` with Playwright, take a screenshot, confirm it loads correctly.
5. **Progress**: Update `docs/progress.md` with what was completed.
6. **Approval**: Ask for permission ONLY after the `git commit` is successful.

Always commit changes as you go. Every meaningful change should be committed immediately.

# Git Setup

Before the first commit, configure git identity:
```
git config user.name "fonkeMonkey"
git config user.email "fonkemonkey@users.noreply.github.com"
```

# Dev Server

When the user wants to preview the project, serve it at **http://localhost:3000**:
```
python3 -m http.server 3000
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
