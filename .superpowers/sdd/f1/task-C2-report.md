# Task C2 — gate/pairing telegram-adapter: port + fix SEC-1/SEC-2

Status: DONE (semua test hijau, typecheck 0 pada file yang disentuh task ini).

## Verifikasi akhir

```
$ bun test packages/telegram-adapter packages/hostd/test/access-store.test.ts
146 pass / 0 fail / 288 expect() calls (8 file test)

$ bun test          # whole repo, sanity check
264 pass / 0 fail / 535 expect() calls (18 file test)

$ bun run typecheck
$ tsc --noEmit
packages/hostd/test/delivery.test.ts(128,5): error TS2578: Unused '@ts-expect-error' directive.
```
Satu error typecheck tersisa ada di `packages/hostd/test/delivery.test.ts` — file
di luar scope task ini (task paralel delivery), tidak disentuh sama sekali.
Semua file yang disentuh task ini (`shared/src/access.ts`, `shared/src/index.ts`,
`hostd/src/state/access-store.ts`, `telegram-adapter/src/gate.ts`,
`telegram-adapter/src/index.ts`, `telegram-adapter/package.json`,
`telegram-adapter/test/gate.test.ts`) typecheck bersih.

## Resolusi arsitektur (satu-sumber AccessSchema)

- Zod `AccessSchema`/`GroupPolicySchema`/`PendingEntrySchema` + tipe
  `Access`/`GroupPolicy`/`PendingEntry` + `PENDING_CAP` + `defaultAccess()`
  dipindah **verbatim** dari `packages/hostd/src/state/access-store.ts` ke
  `packages/shared/src/access.ts` (baru). `packages/shared/src/index.ts`
  ditambah 1 baris `export * from "./access"`.
- `access-store.ts` sekarang **hanya** mengimpor skema dari
  `@mirza-harness/shared` (bukan lagi mendefinisikan) dan me-re-export
  `AccessSchema`/`PENDING_CAP`/`defaultAccess`/`Access` supaya
  `test/access-store.test.ts` **tidak perlu diubah sama sekali** — masih
  mengimpor dari `../src/state/access-store` seperti semula, dan tetap
  100% pass (14 test) tanpa perubahan semantik.
- Fungsi DB-only (`loadRow`/`saveRow`/`getAccess`/`setAccess`/
  `approvePairing`/`addPending`/`importLegacyAccessJson`, `PENDING_TTL_MS`,
  `DEFAULT_CHANNEL`) **tetap** di hostd — hanya `access-store.ts` yang
  depend ke `@mirza-harness/shared`; arah dependensi hostd → shared,
  telegram-adapter → shared, tidak ada telegram-adapter → hostd.
- `packages/telegram-adapter/package.json` ditambah
  `"@mirza-harness/shared": "workspace:*"`. **Tidak** menjalankan
  `bun install` — bun resolve workspace secara otomatis saat
  `bun test`/`tsc` (tidak perlu lockfile/node_modules symlink baru untuk
  package ini); tidak BLOCKED.

## gate.ts — desain fungsi murni

`packages/telegram-adapter/src/gate.ts` mem-port `gate()` +
pairing flow (`plugins/telegram/server.ts:209-420`) sebagai fungsi murni:
tidak ada fs/DB/`Math.random`/`Date.now()` implisit — clock (`opts.now`) dan
code-generator (`opts.generateCode`) disuntik, default sama seperti kode
acuan (`randomBytes(3).toString('hex')`, 6 hex char).

```ts
export type ChatType = "private" | "group" | "supergroup" | (string & {});
export interface GateInput {
  chatType: ChatType; chatId: string; senderId: string; text?: string;
  mentionsBot?: boolean; replyToBot?: boolean;
  isInfoCommand?: boolean; isMetaCommand?: boolean; isPermissionReply?: boolean;
}
export type GateResult =
  | { action: "deliver" }
  | { action: "drop"; reason: string }
  | { action: "pairing-reply"; code: string; isResend: boolean };

export function gate(input: GateInput, access: Access, opts?: GateOptions): GateResult
```

Persistensi (menyimpan pending baru / increment `replies` / approve) TIDAK
dilakukan di modul ini — itu tanggung jawab pemanggil lewat
`access-store.ts` (fase berikutnya, saat gate.ts diwire ke hostd). gate.ts
hanya memutuskan aksi; ini konsisten dengan brief yang secara eksplisit
melarang menyentuh file hostd server/delivery/doctor (task paralel).

Semantik yang di-port persis dari kode acuan: dmPolicy `disabled` → drop
global; dmPolicy `allowlist` → hanya allowFrom yang deliver, non-member
drop tanpa pairing; dmPolicy `pairing` → allowFrom deliver, stranger dapat
`pairing-reply` (resend kode existing bila non-expired, reply cap 2x lalu
drop, atau kode baru bila cap pending `PENDING_CAP` — diimpor dari
`@mirza-harness/shared`, sama nilai `3` dengan access-store — belum
tercapai); grup: `requireMention` (mention entity/reply-to-bot/regex
`mentionPatterns`) + `allowFrom` per-grup, sama seperti `isMentioned()`
lama.

### Fix SEC-1 (wajib)
Kode acuan lama punya `dmCommandGate()` **terpisah** yang hanya menolak
dmPolicy `'allowlist'` non-allowFrom — pada dmPolicy `'pairing'`, siapa pun
bisa memicu `/context`/`/version` tanpa pernah pairing (bocor info sebelum
approve). Di gate.ts, `isInfoCommand` **tidak** mendapat jalur longgar
sendiri: ia melewati logika private-chat yang identik dengan pesan biasa
(butuh allowFrom untuk `deliver`; stranger di `pairing` jatuh ke
`pairing-reply` biasa — bukan `deliver`, jadi tidak ada info yang keluar),
dan selalu `drop` di grup/supergrup (command DM-only, meniru komentar
"Commands are DM-only" di kode acuan) — diverifikasi test bahkan saat
sender ada di allowFrom grup + mention.

### Fix SEC-2 (wajib)
`isMetaCommand`/`isPermissionReply` dicek **sebelum** logika private/group
lain: hanya lolos (`deliver`) bila `chatType === 'private' &&
allowFrom.includes(senderId)` — apa pun dmPolicy-nya. Selain itu selalu
`drop` dengan `reason`. Diverifikasi: member yang ada di **allowFrom grup
sendiri** tetap tidak bisa memicu meta-command (grup ≠ private); sender
yang ada di DM allowFrom tapi berada di supergroup tetap drop.

## Test (`test/gate.test.ts`, 27 test baru)
- Matrix dmPolicy (`disabled`/`allowlist`/`pairing`) × chatType
  (`private`/`group`/`supergroup`/unknown).
- Pairing flow: fresh code, resend code existing, reply-cap-2 → drop,
  pending expired diabaikan (dianggap fresh), pending cap `PENDING_CAP`
  (3) menolak stranger baru tapi tidak menghalangi sender yang sudah
  punya entri.
- Group: no-policy → drop, requireMention true/false, 3 jalur mention
  (`mentionsBot`, `replyToBot`, `mentionPatterns` regex), group allowFrom
  filter independen dari mention.
- SEC-1: stranger info-command di `pairing` → `pairing-reply` bukan
  `deliver` (tidak bocor); allowFrom member → `deliver`; stranger di
  `allowlist` → `drop`; info-command di grup selalu `drop` walau
  allowlisted+mention.
- SEC-2: meta-command/permission-reply hanya `deliver` di
  private+allowFrom; drop dengan reason di private non-allowFrom, di grup
  (termasuk member allowFrom grup sendiri), dan di supergroup.

## File yang disentuh
- `packages/shared/src/access.ts` — baru (AccessSchema dipindah verbatim).
- `packages/shared/src/index.ts` — +1 baris re-export.
- `packages/hostd/src/state/access-store.ts` — impor skema dari
  `@mirza-harness/shared` + re-export utk backward-compat; fungsi
  DB/CRUD tidak diubah.
- `packages/telegram-adapter/src/gate.ts` — baru.
- `packages/telegram-adapter/src/index.ts` — +1 baris re-export
  (ditambahkan setelah baris `export * from "./poller"` milik task
  paralel C3 yang sudah ada di file saat task ini berjalan).
- `packages/telegram-adapter/package.json` — +1 dependency
  `@mirza-harness/shared` (tanpa `bun install`).
- `packages/telegram-adapter/test/gate.test.ts` — baru, 27 test.

Tidak menyentuh `packages/hostd/src/*` lain (server/delivery/doctor).
Tidak melakukan `git add`/commit/push (repo ini bahkan bukan git repo saat
diperiksa — `bot-03` workspace, bukan `mirza-harness` — catatan: task
dijalankan langsung di `C:\Users\Mirza\workspace\mirza-harness`).

## Fix pass 1

**Reviewer feedback:** Dua fix kecil, jangan ubah perilaku lain.

1. **gate.ts kommentar (~baris 23-25):** Kommentar SEC-2 mengklaim lolos "apa pun dmPolicy-nya" — TIDAK akurat. Kode sekarang (fail-closed kill-switch, `dmPolicy='disabled'` menang di baris 99) sudah BENAR; perilaku tidak diubah. Koreksi kommentar: dmPolicy `'disabled'` adalah kill-switch total yang menang atas SEC-2 exemption, menyebabkan drop **sebelum** SEC-2 logic ditjalankan.

2. **gate.test.ts test baru (dmPolicy disabled kill-switch):** Tambah 1 test eksplisit: `gate({chatType:'private', senderId:'u1', isPermissionReply:true}, {dmPolicy:'disabled', allowFrom:['u1'], groups:{}, pending:{}})` → action `'drop'` (reason menyebut disabled). Nama test jelaskan semantik: "dmPolicy disabled is a kill-switch over SEC-2: permission-reply in private+allowFrom still drops".

**Hasil:**
- `bun test packages/telegram-adapter/test/gate.test.ts` → **30 pass** (29→30, bukan 27; total dalam file 30 termasuk baseline).
- `bun run typecheck` → 0 error.
