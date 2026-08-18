# Working notes for Claude Code

## Browser testing

Do not attempt to use the Chrome extension (`mcp__claude-in-chrome__*` tools) for
this project — it has been consistently unreliable/unavailable in this environment.
Do not call `tabs_context_mcp` or any other Chrome extension tool "just to check"
if it's connected.

For verifying changes instead:
- Prefer direct API/data-layer testing: hit the Next.js API routes and Supabase
  tables directly (with a disposable test account/fixtures, cleaned up
  afterward) to exercise the same code paths the UI would call. This is how the
  onboarding sign-flow migration was verified.
- For anything that's genuinely visual/UI-only and can't be verified that way,
  say so explicitly and ask the user to check manually rather than claiming
  success.
