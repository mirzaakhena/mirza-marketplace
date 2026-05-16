# Telegram `/context` Renderer Enhancement

**Date:** 2026-05-17
**Component:** `plugins/telegram/server.ts` — `renderContextReply()`

## Goal

Tampilkan informasi sesi yang lebih lengkap di reply Telegram `/context`. Saat ini hanya menampilkan Context %, Usage % (5h rate limit), dan Reset time. Banyak field berguna sudah tersedia di payload `last-status.json` tapi belum dimanfaatkan.

## Scope

- **In:** Ganti string output `renderContextReply()` + perluas type `StatusLinePayload` agar mencakup field baru.
- **Out:** Tidak mengubah `context-bridge.sh`, tidak mengubah cara penangkapan data, tidak mengubah command handler (`bot.command('context', …)`).

## Output Layout (final, approved)

Plain text — **bukan** MarkdownV2. Tidak ada asterisk/formatting:

```
Context
●○○○○○○○○○ 5%
46.7k / 1M tokens

Rate Limit 5h
●●●●○○○○○○ 40%
reset 1h 57m

Rate Limit 7d
●○○○○○○○○○ 9%
reset 6d 10h

Opus 4.7 (1M context)
Session: 8a16303d
CWD: …/sandbox/folder_two
Cost: $0.80
Thinking: on
Fast: off

Last update: 17:42 WIB
(3m lalu)
```

## Field Sources (semua dari `payload`)

| Display | Source path | Format |
|---|---|---|
| Context % bubble | `context_window.used_percentage` | `progressBar(pct)` + `Math.round(pct)%` |
| Context tokens | `context_window.total_input_tokens` + `.context_window_size` | `46.7k / 1M tokens` (humanized) |
| Rate Limit 5h % | `rate_limits.five_hour.used_percentage` | bubble + `%` |
| Rate Limit 5h reset | `rate_limits.five_hour.resets_at` | `reset 1h 57m` |
| Rate Limit 7d % | `rate_limits.seven_day.used_percentage` | bubble + `%` |
| Rate Limit 7d reset | `rate_limits.seven_day.resets_at` | `reset 6d 10h` |
| Model | `model.display_name` | as-is |
| Session | `session_id` | first 8 chars |
| CWD | `cwd` | last 2 path segments, prefixed `…/` |
| Cost | `cost.total_cost_usd` | `$0.80` (2 decimals) |
| Thinking | `thinking.enabled` | `on` / `off` |
| Fast | `fast_mode` | `on` / `off` |
| Last update | `captured_at_ms` | existing `formatJakartaHM` + `formatRelativeMs` on two lines |

## Helper Behavior

- **`formatTokens(n)`** — new helper. `1234` → `1.2k`, `46747` → `46.7k`, `1000000` → `1M`, `1500000` → `1.5M`.
- **`formatResetRemain(epochSec)`** — generalizes existing 5h logic to also support `d` (days) for 7-day window. `< 0` → `reset baru saja`. Otherwise emit largest two units (`6d 10h`, `1h 57m`, `5m`).
- **`shortCwd(path)`** — returns `…/<parent>/<leaf>` if path has ≥ 2 segments, else returns as-is.
- **`shortSession(id)`** — `id.slice(0, 8)`.

## Missing Field Handling

**Rule:** skip the entire section/line when its source is missing — **except** Context, which is the core indicator and always shown with `(tidak tersedia)` placeholder if absent.

Concretely:
- `Rate Limit 7d` block missing entirely → omit those 3 lines + blank separator (akun non-Pro/Max).
- `cost` / `thinking` / `fast_mode` missing → omit that single line.
- `model.display_name` missing → omit the model line (but keep the rest of the metadata block).
- `session_id` missing → omit `Session:` line.
- `cwd` missing → omit `CWD:` line.

## Non-Goals

- Tidak menambah Markdown formatting (sudah ditolak user).
- Tidak menambah `transcript_path`, `output_style`, `workspace.added_dirs`, `exceeds_200k_tokens`, `version` di display.
- Tidak menyentuh logic install bridge / settings.json patcher.

## Risks

- **Format breakage di Telegram client lama:** plain text, low risk.
- **Type widening pada `StatusLinePayload`** mungkin perlu update test fixture jika ada test yang bandingkan struct.
