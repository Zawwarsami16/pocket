# Pocket

Browser-only AI chat. Drop in any API key — Anthropic, OpenRouter, Groq, Together, or a custom OpenAI-compatible endpoint — and the model picker fills itself. Every chat, attachment, and remembered fact lives in your browser's IndexedDB. Nothing on a server.

## Why

- **One key, any model.** Paste, auto-detect, go.
- **Yours alone.** No backend. The only network call is from your browser straight to the AI provider. Clear browser data → app forgets you.
- **Memory that sticks.** The assistant ends turns with `MEMORIZE: …` lines. Pocket harvests them silently into a local fact store, recalls top-matching facts on every new turn.
- **Token-aware.** Sliding window with summary compaction. Optional heuristic prompt compression. Anthropic prompt caching enabled by default.

## Provider matrix (browser-direct)

| Provider | CORS | Notes |
|---|---|---|
| Anthropic | ✅ | Native vision + PDF. `dangerous-direct-browser-access` header is set. |
| OpenRouter | ✅ | One key, 200+ models including OpenAI/Gemini/Llama. |
| Groq | ✅ | Fast Llama / Mixtral. |
| Together AI | ✅ | Open weights catalog. |
| OpenAI direct | ❌ | Browser CORS blocked. Use OpenRouter for GPT-5 / 4o / o1. |
| Custom (OpenAI-compat) | ⚠ | Any base URL — local llama.cpp, vLLM, xAI, ZAI shim. CORS depends on the server. |

## Run locally

```bash
npm install
npm run dev    # vite at http://localhost:5173
npm run build  # static bundle in dist/
```

## Deploy

Pocket is a static SPA. Anywhere static works:

- **Vercel** — `vercel` (zero config; `vercel.json` already in repo)
- **GitHub Pages** — push `dist/` to `gh-pages` branch, or use the included Actions workflow

## Memory layer

The default system prompt instructs the model to end any turn worth remembering with `MEMORIZE: <fact>` lines. Pocket:

1. Strips those lines from the user-visible reply.
2. Stores each fact with simple keyword tags.
3. On the next user message, recalls the top 8 facts whose tags overlap and prepends them to the system prompt.

You can browse, search, and delete facts in **Settings → Memory**. They never leave your device.

## Token strategy

Three layers, top to bottom:

1. **Sliding window** — keep the last N turns full (default 16); compact older turns into a single summary block.
2. **System-prompt cache** (Anthropic) — `cache_control: ephemeral` cuts cost on repeated context by ~90%.
3. **Heuristic compression** (off by default) — strips filler words and applies abbreviations to user prompts. Lossy, opt-in.

Live token estimate is shown under each assistant reply.

## Privacy

- API keys stored in IndexedDB. Use a passphrase lock (coming soon) or your OS keychain via the browser's password manager.
- No telemetry. The only outbound HTTP from Pocket is to the provider you configured.
- `vercel.json` ships strict headers (`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`).

## License

Personal use.
