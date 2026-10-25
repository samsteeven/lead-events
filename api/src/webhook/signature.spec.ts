import { sign, signatureHeader, TOLERANCE_SECONDS, verifySignature } from './signature';

const SECRET = 'un-secret-de-test-assez-long';
const BODY = JSON.stringify({ type: 'lead.received', idempotencyKey: 'exec-1:lead.received' });
const NOW = 1_800_000_000;

describe('signature du webhook', () => {
  it('accepte une signature produite avec le bon secret', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(header, BODY, SECRET, NOW)).toEqual({ ok: true });
  });

  it('produit un en-tête « t=<horodatage>,v1=<64 caractères hexadécimaux> »', () => {
    expect(signatureHeader(SECRET, BODY, NOW)).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
  });

  it('refuse un corps modifié après signature', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(header, BODY.replace('received', 'scored'), SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuse un autre secret', () => {
    const header = signatureHeader('autre-secret-tout-aussi-long', BODY, NOW);
    expect(verifySignature(header, BODY, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuse un horodatage modifié : il fait partie du message signé', () => {
    const [, v1] = signatureHeader(SECRET, BODY, NOW).split(',');
    expect(verifySignature(`t=${NOW + 1},${v1}`, BODY, SECRET, NOW + 1)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuse un appel trop ancien ou trop dans le futur (rejeu)', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(header, BODY, SECRET, NOW + TOLERANCE_SECONDS + 1)).toEqual({ ok: false, reason: 'expired' });
    expect(verifySignature(header, BODY, SECRET, NOW - TOLERANCE_SECONDS - 1)).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepte un appel dans la tolérance', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(header, BODY, SECRET, NOW + TOLERANCE_SECONDS)).toEqual({ ok: true });
  });

  it.each([
    ['sans en-tête', undefined],
    ['en-tête vide', ''],
  ])('refuse un appel %s', (_label, header) => {
    expect(verifySignature(header, BODY, SECRET, NOW).ok).toBe(false);
  });

  it.each(['n-importe-quoi', 't=abc,v1=00', `t=${NOW}`, `t=${NOW},v1=zz`, `v1=${'0'.repeat(64)}`])(
    'refuse un en-tête mal formé (%s)',
    (header) => {
      expect(verifySignature(header, BODY, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
    },
  );

  it('refuse un appel dont le corps est absent', () => {
    expect(verifySignature(signatureHeader(SECRET, BODY, NOW), undefined, SECRET, NOW).ok).toBe(false);
  });

  it('signe de la même façon un Buffer et une chaîne', () => {
    expect(sign(SECRET, NOW, Buffer.from(BODY))).toBe(sign(SECRET, NOW, BODY));
  });
});
