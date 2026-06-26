/**
 * Centralized validation for session names entered via /new and /rename.
 * Single source of truth so the two commands can't drift.
 * - Collapses CR/LF to single spaces and trims (PTY-injection safety).
 * - Rejects an empty name.
 * - Rejects any name containing whitespace (use hyphens instead).
 * - Caps the result at 64 chars.
 */
export type SessionNameCommand = '/new' | '/rename'

export type SessionNameValidation =
  | { ok: true; name: string }
  | { ok: false; message: string }

export function validateSessionName(
  rawName: string,
  command: SessionNameCommand,
): SessionNameValidation {
  const sanitised = rawName.replace(/[\r\n]+/g, ' ').trim()
  if (sanitised.length === 0) {
    const noun = command === '/new' ? 'session' : 'new'
    return { ok: false, message: `⚠️ ${command} needs a ${noun} name. Example: ${command} discuss-mcp` }
  }
  if (/\s/.test(sanitised)) {
    return { ok: false, message: `⚠️ Nama session tidak boleh mengandung spasi. Pakai tanda hubung, mis. ${command} discuss-mcp.` }
  }
  return { ok: true, name: sanitised.slice(0, 64) }
}
