import { utcDay } from '../consumer/stats-aggregator.service';
import { furthest } from '../webhook/webhook.service';
import { maskEmail } from './stats.service';

describe('maskEmail', () => {
  it('ne garde que la première lettre et le domaine', () => {
    expect(maskEmail('jane.doe@acme.com')).toBe('j***@acme.com');
  });

  it('masque tout ce qui ne ressemble pas à une adresse', () => {
    expect(maskEmail('sans-arobase')).toBe('***');
    expect(maskEmail('@acme.com')).toBe('***');
  });
});

describe('furthest : un lead ne recule jamais', () => {
  it.each([
    ['RECEIVED', 'SCORED', 'SCORED'],
    ['SCORED', 'RECEIVED', 'SCORED'],
    ['EMAILED', 'RECEIVED', 'EMAILED'],
    ['EMAILED', 'SCORED', 'EMAILED'],
    ['RECEIVED', 'RECEIVED', 'RECEIVED'],
  ] as const)('%s puis %s donne %s', (current, incoming, expected) => {
    expect(furthest(current, incoming)).toBe(expected);
  });
});

describe('utcDay', () => {
  it('retourne le jour UTC, quel que soit le fuseau de la machine', () => {
    expect(utcDay('2026-10-25T23:30:00.000Z')).toBe('2026-10-25');
    expect(utcDay('2026-10-26T00:00:00.000Z')).toBe('2026-10-26');
    expect(utcDay('2026-10-25T23:30:00-05:00')).toBe('2026-10-26');
  });
});
