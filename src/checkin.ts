// ---------------------------------------------------------------------------
// CampusSign signed check-in codes
//
// The lecturer's QR encodes a link containing: session id, course, lecturer,
// a 30-second time slot, and an HMAC signature. The student's device can verify
// the signature and expiry on its own, with no server.
//
// DEMO-GRADE ONLY: the secret below ships inside the website's JavaScript, so a
// determined person could read it and forge codes. Real security needs a backend
// that holds the secret (see the Supabase suggestion).
// ---------------------------------------------------------------------------
const SECRET = 'campussign-demo-secret-change-me';

export const SLOT_MS = 30_000; // QR changes every 30 seconds
const SLOT_TOLERANCE = 2; // accept +/- 2 slots (about 60-90s) to allow for clock drift

export interface CheckinSession {
  id: string;
  course: string;
  teacher: string;
}

export type CheckinResult =
  | { ok: true; session: CheckinSession }
  | { ok: false; message: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

export const currentSlot = (now: number = Date.now()) => Math.floor(now / SLOT_MS);

function toB64Url(text: string): string {
  const bytes = enc.encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function sign(session: CheckinSession, slot: number): Promise<string> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Secure context required (open the site over https).');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = enc.encode(JSON.stringify([session.id, session.course, session.teacher, slot]));
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(''); // 12 hex chars
}

/** Build the link that goes inside the lecturer's QR code. */
export async function buildCheckin(
  session: CheckinSession,
  slot: number = currentSlot()
): Promise<{ url: string; token: string }> {
  const k = await sign(session, slot);
  const body = toB64Url(JSON.stringify({ i: session.id, c: session.course, t: session.teacher, s: slot, k }));
  const base = `${window.location.origin}${window.location.pathname}`;
  return { url: `${base}?checkin=${body}`, token: 'TOK-' + k.slice(0, 6).toUpperCase() };
}

const NOT_CAMPUSSIGN = "That QR code isn't a CampusSign check-in code.";

/** Validate whatever a scanner (or the page URL) hands us. */
export async function parseCheckin(raw: string): Promise<CheckinResult> {
  let body = (raw || '').trim();
  try {
    const url = new URL(body);
    const param = url.searchParams.get('checkin');
    if (!param) return { ok: false, message: NOT_CAMPUSSIGN };
    body = param;
  } catch {
    // not a URL; treat the text itself as the encoded body
  }

  let data: any;
  try {
    data = JSON.parse(fromB64Url(body));
  } catch {
    return { ok: false, message: NOT_CAMPUSSIGN };
  }
  if (
    !data ||
    typeof data.i !== 'string' ||
    typeof data.c !== 'string' ||
    typeof data.t !== 'string' ||
    typeof data.s !== 'number' ||
    typeof data.k !== 'string'
  ) {
    return { ok: false, message: NOT_CAMPUSSIGN };
  }

  const session: CheckinSession = { id: data.i, course: data.c, teacher: data.t };
  let expected: string;
  try {
    expected = await sign(session, data.s);
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Could not verify the QR code on this device.' };
  }
  if (expected !== data.k) {
    return { ok: false, message: 'This QR code failed verification (it may have been altered).' };
  }
  if (Math.abs(currentSlot() - data.s) > SLOT_TOLERANCE) {
    return { ok: false, message: "This QR code has expired. Scan the fresh code on the lecturer's screen." };
  }
  return { ok: true, session };
}
