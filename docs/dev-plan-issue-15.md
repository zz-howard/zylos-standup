# Dev Plan: Rewrite AI layer — adopt recruit's runtime adapter + sandbox pattern (#15)

## Summary

Replace standup's direct OpenAI/Anthropic SDK calls with recruit's AI Gateway pattern: runtime adapters (Claude CLI, Codex API with ProxyAgent), sandbox isolation (SRT/bwrap), and a dispatcher that decouples scenarios from runtimes.

## Reference Implementation

`zylos-recruit/src/lib/`:
- `ai-gateway.js` — dispatcher: resolve config → select adapter → check capabilities → delegate
- `runtimes/claude.js` — Claude CLI subprocess (`claude -p`), uses Max OAuth, inherits system proxy
- `runtimes/codex-api.js` — OpenAI SDK over HTTP with `undici.ProxyAgent` for proxy support
- `runtimes/sandbox.js` + `sandbox-runner.js` — SRT sandbox (bwrap on Linux, seatbelt on macOS)

## Scope

**In scope:**
- `src/ai/ai-gateway.js` — new dispatcher (replaces `client.js` as the AI entry point)
- `src/ai/runtimes/claude.js` — Claude CLI adapter (ported from recruit)
- `src/ai/runtimes/codex-api.js` — Codex API adapter with ProxyAgent (ported from recruit, simplified: no web_search/web_fetch tool loops)
- `src/ai/runtimes/sandbox.js` + `sandbox-runner.js` — SRT sandbox wrapper (ported from recruit, paths adjusted for standup)
- `src/ai/conversation.js` — update to use gateway instead of `callAi`
- `src/ai/summary.js` — update to use gateway instead of `callAi`
- Config schema update: `ai.default.runtime` supports `auto|claude|codex-api`
- `package.json` — add `@anthropic-ai/sandbox-runtime`, `undici`, `shell-quote`; keep `openai` (used by codex-api adapter); remove `@anthropic-ai/sdk` (no longer needed)
- Tests updated to work with gateway DI

**Out of scope:**
- Gemini adapter (not needed for standup's text-only use case)
- Codex CLI adapter (codex-api covers the HTTP path)
- Streaming support (standup uses non-streaming calls only)
- web_search / web_fetch tool loops (standup only needs plain text generation)

## Development Checklist

- [ ] 1. Create `src/ai/ai-gateway.js` — adapter registry, `resolve()`, `call()`, `detectRuntimes()`
- [ ] 2. Create `src/ai/runtimes/claude.js` — Claude CLI adapter with `call()`, `isAvailable()`, session resume support
- [ ] 3. Create `src/ai/runtimes/codex-api.js` — Codex API (OpenAI SDK) with `buildProxiedFetch()`, OAuth token refresh, `conversation` parameter support for multi-turn
- [ ] 4. Port `src/ai/runtimes/sandbox.js` + `sandbox-runner.js` — adjust deny/allow paths from `zylos-recruit` to `zylos-standup` data paths
- [ ] 5. Update `src/ai/conversation.js` — replace `import { callAi } from './client.js'` with gateway call; keep DI `aiClient` param for tests
- [ ] 6. Update `src/ai/summary.js` — same: switch to gateway call
- [ ] 7. Delete `src/ai/client.js` (replaced by ai-gateway.js)
- [ ] 8. Update `src/lib/config.js` — `DEFAULT_CONFIG.ai.default.runtime: 'auto'` (auto-detect: claude if CLI available, else codex-api if auth.json exists, else error)
- [ ] 9. Update `package.json` dependencies — add `undici`, `shell-quote`, `@anthropic-ai/sandbox-runtime`; remove `@anthropic-ai/sdk`
- [ ] 10. Update `src/lib/summary-api.js` — pass `aiClient` override from route options through to gateway when provided (for test DI)
- [ ] 11. Update tests — mock gateway instead of raw callAi; verify DI still works

## Interface Contract

The gateway exposes:

```js
// Non-streaming call — the only interface standup needs
call(scenario, prompt, { conversation, required }) → { text, runtime, model, sandboxed }

// Where conversation = { systemPrompt, messages: [{ role, content }] }
// For CLI adapters: systemPrompt + messages are flattened into a prompt string
// For HTTP adapters: passed as structured conversation
```

Callers (conversation.js, summary.js) build `{ systemPrompt, messages }` and pass to `gateway.call()`.

## Test Checklist

- [ ] Gateway `resolve()` auto fallback: claude available → claude; claude unavailable + codex auth → codex-api; neither → actionable error
- [ ] Claude adapter `isAvailable()` checks `which claude`
- [ ] Codex-API adapter `isAvailable()` checks `~/.codex/auth.json`
- [ ] Sandbox: `buildSandboxRuntimeConfig()` denies `$HOME` and `~/zylos` by default
- [ ] Sandbox: standup scenarios only allow necessary auth/support/tmp paths, NOT standup data/config/db
- [ ] Sandbox: `allowUnsandboxed` defaults to false; sandbox init failure → fail-closed (exit 126)
- [ ] `conversation.js` works with mock gateway (DI)
- [ ] `summary.js` works with mock gateway (DI)
- [ ] Summary API test still passes with DI aiClient
- [ ] All existing tests pass (21/21)
- [ ] Manual: `npm start` + health check + login + generate summary

## Assumptions

- Claude CLI is installed on both KVM and Spark (`which claude` succeeds)
- `~/.codex/auth.json` may or may not exist (codex-api is optional fallback)
- `@anthropic-ai/sandbox-runtime` works on x86_64 (KVM) — recruit validates this. Aarch64 (Spark) is expected but must be verified if Spark is a deployment target
- Standup's AI scenarios only need `text` capability (no file reading, no web search)
- Codex-api adapter uses `openai` SDK with undici `ProxyAgent` — `openai` must remain as a dependency

## Acceptance Checklist

- [ ] `npm test` passes (all existing + new tests)
- [ ] `node --check` passes on all new files
- [ ] `detectRuntimes()` on KVM shows claude available
- [ ] Live AI conversation works (POST /api/tasks/:id/conversation returns AI reply, not error)
- [ ] Live summary generation works (POST /api/summaries/generate returns status=ready)
- [ ] No `@anthropic-ai/sdk` or direct `openai` import outside runtimes/
- [ ] Sandbox tests pass: deny $HOME/~/zylos, allow only auth/support/tmp, allowUnsandboxed=false fail-closed
- [ ] Sandbox status reported in AI call metadata
- [ ] Config `ai.default.runtime: 'auto'` selects claude on KVM
- [ ] If Spark is a target: `detectRuntimes()` + sandbox smoke test on aarch64
