import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber, timeAgo } from './api';

describe('formatDuration', () => {
  it.each([
    [84, '84 ms'],
    [999.4, '999 ms'],
    [1000, '1 s'],
    [1234, '1,2 s'],
    [20_000, '20 s'],
  ])('%d ms s\'affiche « %s »', (ms, expected) => {
    // le séparateur décimal français est une virgule ; l'espace avant l'unité est insécable ou normale selon l'ICU
    expect(formatDuration(ms).replace(/\s/g, ' ')).toBe(expected);
  });

  it.each([null, undefined, Number.NaN])('affiche un tiret pour %p', (value) => {
    expect(formatDuration(value as number | null)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groupe les milliers à la française et garde le nombre de décimales demandé', () => {
    expect(formatNumber(1234).replace(/\s/g, ' ')).toBe('1 234');
    expect(formatNumber(7.25, 1)).toBe('7,3');
  });

  it('affiche un tiret quand la valeur n\'existe pas encore', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [5, 'il y a 5 s'],
    [59, 'il y a 59 s'],
    [60, 'il y a 1 min'],
    [3599, 'il y a 59 min'],
    [3600, 'il y a 1 h'],
    [86_400, 'il y a 1 j'],
  ])('%d s : « %s »', (seconds, expected) => {
    expect(timeAgo(ago(seconds), now)).toBe(expected);
  });

  it('ne renvoie jamais une durée négative (horloge en avance)', () => {
    expect(timeAgo(new Date(now + 5000).toISOString(), now)).toBe('il y a 0 s');
  });
});
