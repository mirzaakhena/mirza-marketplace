### Task 1: Scaffold monorepo

**Files:**
- Create: `C:\Users\Mirza\workspace\mirza-harness\.gitattributes`
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `README.md`
- Create: `packages/{hostd,pty-holder,telegram-adapter,cc-stub,shared}/package.json`
- Create: `packages/{hostd,pty-holder,telegram-adapter,cc-stub,shared}/src/index.ts`

**Interfaces:**
- Produces: workspace layout yang dipakai semua task lain; nama package `@mirza-harness/<pkg>`.

- [ ] **Step 1: git init + file root**

```bash
mkdir -p /c/Users/Mirza/workspace/mirza-harness && cd /c/Users/Mirza/workspace/mirza-harness && git init -b main
```

`.gitattributes` (WAJIB sebelum commit pertama):
```
* text=auto eol=lf
```

`.gitignore`:
```
node_modules/
*.db
*.db-wal
*.db-shm
dist/
```

`package.json` (root):
```json
{
  "name": "mirza-harness",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "typescript": "^5.6.0"
  }
}
```

`tsconfig.json` (root):
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"],
    "paths": { "@mirza-harness/*": ["./packages/*/src"] }
  },
  "include": ["packages/*/src", "packages/*/test"]
}
```

`README.md`:
```markdown
# mirza-harness

Substrat baru fleet bot Claude Code milik Mirza: daemon `hostd` (supervisor + bus + state SQLite + channel adapters), `pty-holder` tipis, dan plugin `cc-stub`.

- Design doc: `mirza-marketplace/docs/2026-07-03-harness-rewrite-design.md`
- Kontrak penerimaan: inventaris 529 item di `mirza-marketplace/docs/2026-07-02-capability-inventory/`
- Status: Fase 0 (skeleton). Sistem lama tetap produksi sampai migrasi selesai.
- Konstrain mutlak: TANPA Claude Agent SDK / `claude -p` — seluruh usage lewat TUI interaktif.

## Perintah
- `bun install`
- `bun test`
- `bun run typecheck`
- `bun run packages/hostd/src/main.ts` — jalankan daemon
- `bun run packages/hostd/src/cli.ts doctor` — tanya kesehatan daemon
```

- [ ] **Step 2: package skeleton × 5**

Untuk tiap `<pkg>` di {hostd, pty-holder, telegram-adapter, cc-stub, shared}, buat `packages/<pkg>/package.json`:
```json
{
  "name": "@mirza-harness/<pkg>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```
Khusus `hostd`, tambahkan dependencies:
```json
  "dependencies": {
    "@mirza-harness/shared": "workspace:*",
    "zod": "^3.23.0"
  }
```
Khusus `shared`, tambahkan `"dependencies": { "zod": "^3.23.0" }`.

`packages/<pkg>/src/index.ts` untuk pty-holder, telegram-adapter, cc-stub (diisi fase 1–2):
```ts
// @mirza-harness/<pkg> — skeleton; diisi pada fase berikutnya (design doc §9).
export const PKG = "<pkg>";
```
(`shared` dan `hostd` diisi Task 2–4; sementara isi placeholder yang sama.)

- [ ] **Step 3: bun install + verifikasi workspace**

Run: `bun install && bun run typecheck`
Expected: install sukses, typecheck exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold monorepo mirza-harness (fase 0)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

