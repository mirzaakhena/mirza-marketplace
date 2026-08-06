import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Yang diukur: dari saat sesi benar-benar MULAI MENULIS berkas handoff
// (tool_use Write/Edit dengan path .handoff) sampai giliran terakhir sesi itu.
// Itulah "biaya penyerahan" -- ruang yang harus tersisa supaya sebuah sesi masih
// sanggup menyerahkan pekerjaannya dengan rapi.
const ROOT = "C:/Users/Mirza/.claude/projects";
const dirs = readdirSync(ROOT).filter((d) => /workspace-(bot-0\d|mirza-0\d-bot)/.test(d));

const rows = [];

for (const d of dirs) {
  let files;
  try {
    files = readdirSync(join(ROOT, d)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    continue;
  }
  for (const f of files) {
    const path = join(ROOT, d, f);
    if (statSync(path).size < 50_000) continue;
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);

    let ctxAtWrite = null;
    let lastCtx = null;
    let curCtx = null;

    for (const l of lines) {
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      const u = o?.message?.usage;
      if (u) {
        const c = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        if (c > 0) {
          curCtx = c;
          lastCtx = c;
        }
      }
      const content = o?.message?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type !== "tool_use") continue;
          const name = String(part.name ?? "");
          if (!/^(Write|Edit)$/.test(name)) continue;
          const p = String(part.input?.file_path ?? "");
          if (!/\.handoff/.test(p)) continue;
          // yang pertama kali menulis handoff di sesi ini
          if (ctxAtWrite === null && curCtx !== null) ctxAtWrite = curCtx;
        }
      }
    }

    if (ctxAtWrite !== null && lastCtx !== null && lastCtx >= ctxAtWrite) {
      rows.push({
        bot: d.replace(/^C--Users-Mirza-workspace-/, ""),
        session: f.slice(0, 8),
        saatTulis: ctxAtWrite,
        akhir: lastCtx,
        biaya: lastCtx - ctxAtWrite,
      });
    }
  }
}

rows.sort((a, b) => a.biaya - b.biaya);
console.log("bot | sesi | ctx saat MULAI NULIS handoff | ctx akhir | BIAYA PENYERAHAN");
for (const r of rows) {
  console.log(
    `${r.bot} | ${r.session} | ${Math.round(r.saatTulis / 1000)}k | ${Math.round(r.akhir / 1000)}k | ${Math.round(r.biaya / 1000)}k`
  );
}

if (rows.length > 0) {
  const b = rows.map((r) => r.biaya).sort((x, y) => x - y);
  const q = (p) => b[Math.min(b.length - 1, Math.floor(p * (b.length - 1)))];
  console.log(
    `\nn=${b.length}  min=${Math.round(b[0] / 1000)}k  median=${Math.round(q(0.5) / 1000)}k  p90=${Math.round(q(0.9) / 1000)}k  max=${Math.round(b[b.length - 1] / 1000)}k`
  );
  const t = rows.map((r) => r.saatTulis).sort((x, y) => x - y);
  console.log(
    `ctx saat mulai menulis handoff: min=${Math.round(t[0] / 1000)}k  median=${Math.round(t[Math.floor((t.length - 1) / 2)] / 1000)}k  max=${Math.round(t[t.length - 1] / 1000)}k`
  );
}
