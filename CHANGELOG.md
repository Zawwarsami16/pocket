# Changelog

All notable changes to Pocket get logged here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versioning aims for [Semantic Versioning](https://semver.org/spec/v2.0.0.html) although the project is still pre-1.0 and the surface can shift.

## [Unreleased]

### Added
- MIT license file at the repo root.
- Badge row in the README (license, stack, live demo).
- This changelog.

## [0.1.0] — 2026-04-23

First public version. The surface that shipped:

### Added
- One-key, any-provider chat with auto-detection by key prefix.
- Provider matrix: Anthropic native, OpenRouter, Groq, Together AI, zhub `zk_` keys, OpenAI-compatible custom base URLs.
- IndexedDB-backed thread, attachment, and memory store via Dexie.
- `MEMORIZE: …` line harvest with top-match recall on every turn.
- Sliding-window history with summary compaction.
- Optional heuristic prompt compression toggle.
- Anthropic prompt caching enabled by default.
- Vision and PDF input on providers that support it.
- Settings panel with separate tabs for keys, model behavior, and memory.
- Live demo at [pocket-tau-sepia.vercel.app](https://pocket-tau-sepia.vercel.app).

[Unreleased]: https://github.com/Zawwarsami16/pocket/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Zawwarsami16/pocket/releases/tag/v0.1.0
