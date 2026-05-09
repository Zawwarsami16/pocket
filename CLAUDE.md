# Pocket — orientation for Claude

Browser-only AI chat. Drop in any provider's API key, models auto-detect from key prefix, every chat / file / remembered fact lives in IndexedDB. No backend, no account.

**Repo:** github.com/Zawwarsami16/pocket
**Owner:** Zawwar Sami (zawwarsami16@gmail.com) — Hinglish casual, direct, no preamble.

## Stack

- Vite 6 + React 19 + TypeScript 5 + Tailwind 3
- Dexie 4 (IndexedDB wrapper) for sessions/messages/attachments/facts/settings
- Web Crypto API (PBKDF2 + AES-GCM) for at-rest key encryption
- marked + DOMPurify + highlight.js for markdown rendering
- Service worker + manifest for PWA install
- Pure static SPA — deploys to Vercel (`vercel.json` configured) or any static host

## Architecture

```
src/
├── main.tsx              entry point
├── index.css             theme tokens (CSS vars), animations, markdown styles
├── ai/
│   ├── chat.ts           main orchestration: presence → entity → recall → window → provider.chat
│   ├── presence.ts       editable system identity ("SOUL"), default + getter/setter
│   ├── entity.ts         live awareness snapshot (time, posture, totals, current session)
│   ├── memory.ts         awarenessBlock combines fact recall + cross-session snippets
│   ├── recall.ts         keyword-overlap scan across all stored messages, recency boost
│   ├── reflect.ts        once-per-day local journal (no API call)
│   ├── window.ts         sliding window + summary compaction
│   ├── compress.ts       heuristic prompt compression (light/aggressive)
│   ├── tokens.ts         heuristic token estimator (no tiktoken yet)
│   └── stream.ts         SSE parser (yields empty lines as event boundaries — critical fix from early bug)
├── providers/
│   ├── types.ts          Provider, ChatRequest, ChatChunk, ModelInfo
│   ├── registry.ts       PROVIDERS array + detectProvider(key) + getProvider(id)
│   ├── anthropic.ts      native /v1/messages, browser-direct via dangerous-direct-browser-access header, ping/thinking_delta as watchdog heartbeats
│   ├── openai_compat.ts  shared OAI Chat Completions client; isReasoningModel() drops temperature + uses max_completion_tokens for gpt-5/o1-9
│   ├── openrouter.ts     wraps openai_compat with HTTP-Referer + X-Title headers
│   ├── groq.ts / together.ts / openai.ts / custom.ts
├── db/
│   ├── schema.ts         Dexie tables: sessions, messages, attachments, facts, settings
│   ├── sessions.ts       CRUD + pin/rename/delete cascading
│   ├── messages.ts       CRUD + deleteFrom (used for regenerate)
│   ├── attachments.ts    blob storage + base64 + sha256 hash
│   ├── facts.ts          MEMORIZE: line harvest, tag-overlap recall, hits counter
│   ├── keystore.ts       raw key/setting CRUD
│   └── vault.ts          encrypted wrapper (PBKDF2 + AES-GCM, 30min idle auto-lock)
├── lib/crypto.ts         Web Crypto helpers (encryptString/decryptString)
└── ui/
    ├── App.tsx           root: routing, keyboard shortcuts (⌘K, ⌘⇧N), vault unlock prompt, daily reflection toast
    ├── Sidebar.tsx       date-grouped sessions (Today/Yesterday/This week/...), inline filter, drawer on mobile
    ├── Thread.tsx        message bubbles, hover actions (copy/edit/regen/delete), TypingIndicator
    ├── Composer.tsx      glass-strong, focus hints, gold-gradient send, attachment chips
    ├── AwarenessHud.tsx  live status strip + expand: top facts, cross-session snippets being injected this turn
    ├── Settings.tsx      modal: keys / presence / memory / threads / tokens / appearance / data tabs
    ├── CommandPalette.tsx  ⌘K / "/" — search chats/messages/facts + actions
    ├── Welcome.tsx       hero empty state when no session
    ├── Toasts.tsx        stacked bottom-right; sticky errors, auto-dismiss success/info
    ├── Markdown.tsx      marked + DOMPurify + highlight.js
    ├── icons.tsx         inline SVGs (Plus, Settings, Pin, Send, etc.)
    └── theme.ts          dark/light/system, CSS class swap on <html>
```

## Provider matrix (CORS reality)

| Provider | Browser-direct | Notes |
|---|---|---|
| Anthropic | ✅ | `anthropic-dangerous-direct-browser-access: true` header. Native vision + PDF. |
| OpenRouter | ✅ | Aggregator — one key gets 200+ models incl OpenAI/Gemini/Llama. |
| Groq | ✅ | Fast Llama / Mixtral. |
| Together AI | ✅ | Open weights catalog. |
| OpenAI direct | ❌ | CORS blocked. Tip surfaced: use OpenRouter. |
| Custom (OpenAI-compat) | ⚠ | xAI / local llama.cpp / vLLM / ZAI shim. CORS depends on server. |

## Memory model (the distinguishing feature)

Three layers stacked into every system prompt:

1. **Presence** — editable identity (Settings → Presence). Hinglish-friendly default. Replaces the old DEFAULT_SYSTEM constant. Per-session override via `session.systemPrompt`.
2. **EntityCore awareness** — live snapshot every turn (time + day + tz, posture, totals, current session, language, online state). Pure local, zero API cost.
3. **Recalled memory** — `memory.ts` calls `recallFacts()` (FactStore tag overlap, top 8) + `recallAcrossSessions()` (keyword-overlap scan of all messages, top 5 snippets, capped 2 per session, current session excluded).

Assistant ends turns with `MEMORIZE: <fact>` lines → `harvestMemorize()` strips them from the visible reply and saves to FactStore. Each recall increments `hits`.

## Token strategy

- **Sliding window** (`window.ts`): keep last N=16 turns; compact older into one summary block.
- **Anthropic prompt caching**: `cache_control: ephemeral` on the system prompt by default (toggle in Settings → Tokens).
- **Heuristic compression** (`compress.ts`): off / light / aggressive. Strips fillers + applies abbreviations to user prompts. Lossy, opt-in.
- **Token meter**: heuristic only (chars/4). Tiktoken-wasm is on the roadmap.

## Build / deploy

- `npm install` then `npm run dev` (Vite dev server on :5173).
- `npm run build` → static `dist/`.
- Deploy: Vercel auto-detects, `vercel.json` ships strict headers.
- **Termux note:** local `npm run dev` and `npm run build` fail because Termux can't dlopen the rollup native binary. **Don't try to fix that locally** — push to GitHub and let Vercel build. TypeScript runs fine via `npx tsc --noEmit` for typecheck.
- PWA installs work on https only (Vercel deploy fine, localhost won't trigger SW).

## Critical bug fixes already made — don't re-introduce

1. **SSE parser must yield empty lines.** `src/ai/stream.ts` `sseLines` previously had `if (line) yield line`, which dropped the blank lines that delimit SSE events. Resulted in dots-forever streaming UX. Fixed; do not "optimize" by skipping empty lines again.
2. **Reasoning models reject `temperature` / `max_tokens`.** `openai_compat.ts` detects gpt-5/o1-9 via `REASONING_RE`, drops temperature, uses `max_completion_tokens`. If adding new providers, respect this guard.
3. **Anthropic ping events** must reset the watchdog. `chat.ts` arms a 90s no-chunk abort. Anthropic provider yields empty `delta` chunks on `event: ping`, `thinking_delta`, and `input_json_delta` so the watchdog stays alive during long Opus responses.
4. **Race when changing model + sending immediately.** `applySettings` in App.tsx awaits `setSessionModel` to avoid sending to the old provider.

## Conventions

- Colors: CSS custom properties only (`var(--bg-*)`, `var(--fg-*)`, `var(--gold)`). No hardcoded `bg-ink-*` Tailwind tokens — light mode breaks if you do.
- Animations: use the easing vars (`var(--ease-out-expo)`, `var(--ease-out-quart)`) for consistency.
- Surfaces: `glass`, `glass-strong`, `surface-1/2/3`, `elev-1..4`, `ring-soft` utility classes in `index.css`.
- Components avoid hardcoded sizes — Tailwind tokens or vars.
- No emojis in code unless the user explicitly asked for them in a feature.

## Active phases

- Phase 1 (2026-05-08): scaffold, providers, storage, basic chat, MEMORIZE harvest.
- Phase 2 (2026-05-09): cross-session recall, presence, entity awareness, awareness HUD, command palette, mobile responsive, message actions, vault encryption, PWA, daily reflection, theme system, premium polish pass.

## Roadmap (not yet shipped)

- Tiktoken-wasm exact token + cost meter
- Ollama auto-detect (`localhost:11434` ping in Settings)
- Image generation via OpenRouter (DALL-E, FLUX, SDXL)
- Prompt library (saved system prompt presets)
- Side-by-side model compare (same prompt, two models in parallel)
- Voice input (browser SpeechRecognition)
- Export/import sessions as JSON

## Posting / sharing

User plans LinkedIn release. Tool-builder voice (per his global Operating Profile), no monetization angle. Don't draft "ChatGPT clone" framing — pitch as "browser-only chat with cross-session memory."
