import { createHmac, timingSafeEqual } from 'node:crypto';

/** Délai maximal accepté entre l'horodatage signé et l'heure de réception : limite le rejeu d'un appel capturé. */
export const TOLERANCE_SECONDS = 300;

/** Signature d'un appel : HMAC-SHA256 de « horodatage.corps », comme les webhooks Stripe ou GitHub. */
export function sign(secret: string, timestamp: number, rawBody: string | Buffer): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  return hmac.digest('hex');
}

/** Valeur de l'en-tête `x-lead-signature` : `t=<horodatage unix>,v1=<signature hex>`. */
export function signatureHeader(secret: string, rawBody: string | Buffer, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${sign(secret, timestamp, rawBody)}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' };

export function verifySignature(
  header: string | undefined,
  rawBody: string | Buffer | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!header || rawBody === undefined) return { ok: false, reason: 'missing' };

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const timestamp = Number(parts['t']);
  const provided = parts['v1'];
  if (!Number.isInteger(timestamp) || !provided || !/^[0-9a-f]{64}$/i.test(provided)) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: 'expired' };

  const expected = Buffer.from(sign(secret, timestamp, rawBody), 'hex');
  const received = Buffer.from(provided, 'hex');
  // Comparaison en temps constant : ne révèle pas à partir de quel octet la signature diffère.
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? { ok: true }
    : { ok: false, reason: 'mismatch' };
}
