// ---------------------------------------------------------------------------
// CampusSign check-in codes (server-verified)
//
// The lecturer's browser signs "<session id>:<30-second slot>" with that
// session's private secret (HMAC-SHA256, first 12 hex chars). The QR carries
// only {session id, slot, signature}. The student's device cannot verify it:
// the server does, using the secret that never leaves the database.
// ---------------------------------------------------------------------------
export const SLOT_MS = 30_000; // QR changes every 30 seconds
export const currentSlot = (now: number = Date.now()) => Math.floor(now / SLOT_MS);

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64Url(text: string): string {
  let bin = '';
  enc.encode(text).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  return dec.decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

async function sign(sessionId: string, secret: string, slot: number): Promise<string> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('Secure context required (use https).');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${sessionId}:${slot}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export interface CheckinCode { i: string; s: number; k: string }

/** Build the link that goes inside the lecturer's QR code. */
export async function buildCheckin(
  session: { id: string; secret: string },
  slot: number = currentSlot()
): Promise<{ url: string; token: string }> {
  const k = await sign(session.id, session.secret, slot);
  const base = `${window.location.origin}${window.location.pathname}`;
  return { url: `${base}?checkin=${toB64Url(JSON.stringify({ i: session.id, s: slot, k }))}`, token: 'TOK-' + k.slice(0, 6).toUpperCase() };
}

const NOT_CAMPUSSIGN = "That QR code isn't a CampusSign check-in code.";

/** Read whatever a scanner (or the page URL) hands us. The server does the real verification. */
export async function parseCheckin(raw: string): Promise<{ ok: true; code: CheckinCode } | { ok: false; message: string }> {
  let body = (raw || '').trim();
  try {
    const param = new URL(body).searchParams.get('checkin');
    if (!param) return { ok: false, message: NOT_CAMPUSSIGN };
    body = param;
  } catch { /* not a URL: treat as the encoded body */ }
  try {
    const d = JSON.parse(fromB64Url(body));
    if (typeof d.i !== 'string' || typeof d.s !== 'number' || typeof d.k !== 'string') throw new Error();
    return { ok: true, code: { i: d.i, s: d.s, k: d.k } };
  } catch {
    return { ok: false, message: NOT_CAMPUSSIGN };
  }
}
