import { createHash, timingSafeEqual } from 'node:crypto';

/** Extrait le jeton d'un en-tête `Authorization: Bearer <jeton>` (chaîne vide si absent ou mal formé). */
export function bearerToken(header: string | undefined): string {
  return header?.startsWith('Bearer ') ? header.slice(7) : '';
}

/** Compare des empreintes de même longueur : temps constant, quelle que soit la longueur du jeton fourni. */
export function tokenMatches(provided: string, expected: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
