# Wrapper Session-Name Self-Healing — Design

**Date:** 2026-07-20
**Author:** bot-03 (disetujui Mirza via Telegram, 2026-07-20)
**Scope:** `plugins/pty-controller/wrapper/` (mirza-cc)
**Status:** approved design, pre-implementation

## 1. Problem

Nama session disimpan di beberapa salinan: state wrapper
(`wrapper.state.json` + `wrapper.current_session_name`), registry telegram
(`session-names.json`), dan sumber hidup CC sendiri (payload statusline →
`last-status.json`). Salinan wrapper bisa divergen dan **tidak pernah
menyembuhkan diri** — sekali salah, salah terus sampai ada event
rename/clear berikutnya.

### Insiden yang memicu (bot-03, 2026-07-18 → 07-20, terverifikasi dari log)

1. 07-17 15:23 WIB — session `052d3e4c` di-rename `rlfv-dashboard-design`.
2. 07-18 17:43 WIB — `/clear` → session baru `1e4bf9e9`, di-rename `idle`.
   State wrapper + registry benar (`idle`).
3. 07-18 22:10 WIB — claude exit; 22:12 wrapper restart, resume `1e4bf9e9`.
   Blok resume (`wrapper.ts:895-906`) me-resolve nama via
   `readLastStatusSessionName(sid) ?? readTelegramRegistryName(sid)` dan
   mendapat **`rlfv-dashboard-design`** — pasangan salah (sid baru + nama
   lama) tertulis ke state wrapper, `seq=1`.
4. Divergensi bertahan 2 hari. `/context` (baca registry) menunjukkan
   `idle`; `agent_status` + SessionStart hook (baca state wrapper)
   menunjukkan `rlfv-dashboard-design`. Akibat nyata: bot-03 menolak
   handoff dari bot-02 padahal sebenarnya idle.

### Mekanisme keracunan (hipotesis paling konsisten dengan bukti)

Snapshot statusline bisa ter-capture **tepat setelah `/clear`** membawa
pasangan (sid BARU + nama LAMA): CC masih membawa nama lama sampai
`/rename` berikutnya diproses, dan local command (`/rename`) tidak memicu
statusline refresh. Snapshot beracun ini **lolos** guard sid-match
`nameFromLastStatus` di blok resume, dan menang atas registry yang benar
karena operator `??` memprioritaskan last-status tanpa cek freshness.

Catatan kejujuran: jalur persis pada insiden di atas tidak bisa
direkonstruksi 100% (file snapshot sudah tertimpa); hipotesis ini yang
paling cocok dengan seluruh timestamp. Desain di bawah sengaja TIDAK
bergantung pada kebenaran hipotesis ini — self-healing menyembuhkan
divergensi dari jalur mana pun.

## 2. Goals / Non-goals

**Goals**

- Divergensi nama session di state wrapper sembuh sendiri ≤1 statusline
  fire (~1 turn) tanpa intervensi manual.
- Seeding nama saat boot-resume memilih sumber yang paling fresh, bukan
  prioritas statis.
- Keputusan resolusi nama ter-log sehingga insiden berikutnya bisa
  di-forensik dari `wrapper.log` saja.

**Non-goals**

- Tidak mengubah konsumen (agent-bus `peer-status`, SessionStart hook
  telegram) — mereka tetap membaca state wrapper; state-nya saja yang
  dibuat andal.
- Tidak mengubah alur `/clear`//`/rename`/batch yang sudah ada.
- Tidak menyentuh mekanisme registry telegram selain sync yang sudah
  jadi pola existing (`writeTelegramRegistryName`).

## 3. Design

Tiga perubahan, semuanya di `plugins/pty-controller/wrapper/src/`.

### 3.1 Revalidasi kontinu di poll loop (inti self-healing)

Di `sessionPollInterval` (500ms, sudah ada): tambah langkah revalidasi
yang membaca `last-status.json` dan **mengadopsi** nama dari snapshot ke
state wrapper HANYA bila semua syarat terpenuhi:

- (a) `payload.session_id` == `sessionState.session_id` (guard existing
  `nameFromLastStatus`);
- (b) `captured_at_ms` snapshot **>** `updated_at_ms` state wrapper —
  snapshot harus lebih baru daripada state; ini menolak snapshot beracun
  yang lebih tua;
- (c) tidak sedang transisi: `awaitingClearReady == null` DAN clear
  barrier tidak aktif — mencegah adopsi di window `/clear` di mana
  snapshot (sid baru + nama lama) justru diproduksi;
- (d) nama snapshot ≠ nama state (ada divergensi nyata).

Saat adopsi: `updateSessionState({ session_name })` + sync registry via
`writeTelegramRegistryName` (pola yang sudah dipakai handler /rename,
`wrapper.ts:1090-1094`) + log:
`session name revalidated from statusline: "<old>" → "<new>"`.

TANPA emisi system-outbox `session-change` — perubahan nama aslinya sudah
terjadi di CC; wrapper hanya menyinkronkan salinannya, bukan
mengorkestrasi transisi. Notifikasi ganda ke telegram justru noise.

Biaya steady-state: satu `statSync` per tick; parse hanya saat mtime
`last-status.json` berubah. Konsisten dengan keputusan existing memakai
poll (bukan `fs.watch`) karena reliabilitas Windows.

### 3.2 Arbitrase freshness saat boot-resume

Ganti resolusi di blok resume (`wrapper.ts:899`):

```
// SEBELUM
const resolvedName = readLastStatusSessionName(sid) ?? readTelegramRegistryName(sid)

// SESUDAH (konseptual)
kandidat A: last-status  → { name, captured_at_ms }   (null bila sid mismatch/korup)
kandidat B: registry     → { name, updatedAt }        (null bila tak ada entry)
pilih kandidat dengan timestamp LEBIH BARU; seri/tie → registry menang
(registry di-update lewat jalur event yang eksplisit, snapshot hanyalah render);
log kedua kandidat + keputusan, mis.:
  resume name resolution: last-status="rlfv-dashboard-design"@1784306592000,
  registry="idle"@1784306593100 → picked registry "idle"
```

`readTelegramRegistryName` perlu varian yang mengembalikan `updatedAt`
juga (field sudah ada di `session-names.json`).

Pada insiden kemarin, perubahan ini saja sudah memilih `idle` yang benar;
bersama 3.1 dia menutup window "turn pertama setelah boot".

### 3.3 Logika keputusan pure + unit test

Fungsi keputusan ditaruh di `session-state.ts` (module yang memang
dipisah agar unit-testable, tanpa side effect spawn CC):

- `shouldAdoptStatuslineName(state, snapshotRaw, { inClearTransition }) → string | null`
  (keputusan adopsi 3.1; null = jangan adopsi; caller yang menyuplai flag
  transisi karena `awaitingClearReady`/barrier hidup di wrapper.ts)
- `resolveResumeName(lastStatusRaw, registryEntry, sid) → { name, source }`
  (arbitrase 3.2; `source` untuk logging)

Test cases minimal (`session-state.test.ts`):

1. adopsi normal: snapshot lebih baru + sid match + nama beda → adopsi;
2. snapshot beracun post-/clear: `captured_at_ms` ≤ `updated_at_ms` → tolak;
3. sid mismatch (snapshot session lama) → tolak;
4. file korup / payload null / nama kosong → tolak, tanpa throw;
5. nama sama → no-op;
6. arbitrase boot: last-status lebih baru → pilih last-status; registry
   lebih baru → pilih registry; tie → registry; salah satu absen →
   pakai yang ada; dua-duanya absen → null (lifecycle `unknown`, perilaku
   existing).

## 4. Error handling

Semua baca file best-effort: missing/korup/unreadable → `null` → skip
tick, tidak pernah melempar keluar dari interval callback (pola existing
heartbeat, `wrapper.ts:772-786`). Kegagalan sync registry saat adopsi
di-log tapi tidak menggagalkan adopsi state (state wrapper tetap benar;
registry akan tersusul di adopsi/event berikutnya).

## 5. Rollout

1. Implementasi via worktree dari workspace clone (bot-conduct Rule 1/6).
2. TDD: test dulu di `session-state.test.ts`, lalu implementasi.
3. Bump versi wrapper (`wrapper/package.json`) + plugin pty-controller
   (`.claude-plugin/plugin.json`), update README pty-controller
   (kontrak state file + perilaku self-healing), commit dengan trailer
   `Agent: bot-03`, push segera (shared repo).
4. Verifikasi E2E di bot-03 sebagai guinea pig: suntik state beracun →
   restart mirza-cc → amati log revalidasi + konvergensi tiga salinan.
5. Bot lain menyusul saat restart mirza-cc masing-masing (tidak perlu
   serentak; wrapper lama tetap berfungsi, hanya tanpa self-healing).

## 6. Risiko & mitigasi

- **Snapshot beracun diadopsi** → ditolak oleh guard (b) freshness +
  (c) window transisi; kalaupun lolos (statusline fire pertama session
  baru sebelum /rename landed), statusline fire berikutnya mengoreksi —
  divergensi menyusut dari "berhari-hari" ke "satu turn".
- **Flapping nama** (adopsi bolak-balik) → syarat (b) monotonic
  (snapshot harus lebih baru dari state) mencegah loop; adopsi juga
  menaikkan `updated_at_ms` state sehingga snapshot yang sama tak
  diproses dua kali.
- **Beban I/O poll** → cek mtime dulu, parse hanya saat berubah.

## 7. Keputusan desain (dari brainstorm dengan Mirza)

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Strategi fix | A — self-healing kontinu (bukan boot-only) | Divergensi dari jalur mana pun sembuh sendiri; + arbitrase boot kecil (deviasi dari A murni, disetujui saat presentasi desain) untuk menutup window turn-pertama-setelah-boot |

## 8. Amendemen pasca final review (2026-07-20)

Final review whole-branch menemukan dua bug integrasi Critical di §3.1,
satu akar masalah: `captured_at_ms` snapshot adalah waktu CAPTURE, bukan
waktu KONTEN. Wrapper bisa legitimately tahu nama BARU lebih dulu daripada
statusline CC merefleksikannya — CC baru memproses slash command yang
di-inject wrapper setelah AI turn yang sedang berjalan selesai, dan
local command (mis. rename lewat sniffer, chain post-/clear, /switch)
tidak memicu refresh statusline. Akibatnya guard (b) freshness saja bisa
salah adopsi: snapshot yang fire di turn yang sama masih membawa nama
LAMA tapi `captured_at_ms`-nya "lebih baru" dari state (yang baru saja
ditulis wrapper) → revert nama in-flight, di state MAUPUN registry
(Critical 1). Terpisah, guard (c) di call site ternyata dead code:
`injectionGate.clearBarrierActive(...)` selalu false persis saat kondisi
`awaitingClearReady === null` yang jadi syarat blok itu dievaluasi —
window settle post-/clear sebenarnya diimplementasikan lewat `holdFor`,
bukan barrier time, sehingga window itu tidak pernah benar-benar
ter-guard (Critical 2).

**Fix — guard (e) expected-name confirmation.** Setiap penulisan nama
yang diinisiasi wrapper sendiri (sniffer `/rename`, chain fresh-session
post-/clear, handler `/switch`) sekarang mencatat
`PendingNameExpectation { name, since_ms }` segera setelah
`updateSessionState`. Selama expectation itu pending, `shouldAdoptStatuslineName`
menolak adopsi snapshot yang namanya BERBEDA dari nama yang diharapkan —
biar pun snapshot itu lolos guard (b) freshness. Expectation dianggap
selesai (`expectationResolved`) ketika: snapshot mengonfirmasi (sid +
nama cocok), ATAU timeout 10 menit terlampaui — sehingga divergensi asli
(bukan false positive dari lag statusline) tetap sembuh sendiri, bukan
macet permanen menolak adopsi.

**Fix — guard (c) diganti ke `injectionGate.isBlocked`.** Call site
revalidasi sekarang memakai
`awaitingClearReady !== null || injectionGate.isBlocked(now)` — sinyal
yang benar-benar hidup di window settle (`isBlocked` mencakup baik clear
barrier maupun `holdFor`), menggantikan `clearBarrierActive` yang dead
code di posisi itu.

**Limitation diketahui — boot arbitration pasca mid-turn rename.**
`PendingNameExpectation` hidup di RAM wrapper, tidak survive restart.
Skenario: rename mid-turn (expectation belum resolved) diikuti restart
wrapper segera sesudahnya → arbitrase boot (§3.2) membandingkan
`last-status` vs registry TANPA sinyal expectation, sehingga bisa memilih
`last-status` yang stale-content-tapi-newer-captured, bukan registry yang
sudah benar. Ini bukan bug baru yang bisa diperbaiki dari state RAM
(expectation tidak bisa dipersist murah tanpa risiko stale-nya sendiri);
didokumentasikan sebagai known limitation, dan disembuhkan otomatis oleh
revalidasi kontinu (§3.1) begitu statusline fire lagi di turn berikutnya.
