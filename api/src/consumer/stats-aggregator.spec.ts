import { LeadEvent } from '../events/lead-event';
import { aggregate } from './stats-aggregator.service';

const event = (over: Partial<LeadEvent>): LeadEvent => ({
  eventId: 'e-1',
  type: 'lead.received',
  leadId: '6f0f6a7e-9d0e-4a53-8f7e-6e0b52a1f0a1',
  externalId: 'crm-1',
  occurredAt: '2026-10-25T10:00:00.000Z',
  webhookAt: '2026-10-25T10:00:00.100Z',
  ...over,
});

describe('aggregate : variations de compteurs d\'un lot', () => {
  it('compte chaque type d\'événement dans la colonne qui lui correspond', () => {
    const { days } = aggregate([
      event({ eventId: '1', type: 'lead.received' }),
      event({ eventId: '2', type: 'lead.scored', score: 7 }),
      event({ eventId: '3', type: 'email.sent' }),
    ]);
    expect(days).toEqual([{ day: '2026-10-25', received: 1, scored: 1, emailed: 1, scoreSum: 7 }]);
  });

  it('cumule la somme des scores, pour calculer la moyenne plus tard', () => {
    const { days, scores } = aggregate([
      event({ eventId: '1', type: 'lead.scored', score: 4 }),
      event({ eventId: '2', type: 'lead.scored', score: 8 }),
      event({ eventId: '3', type: 'lead.scored', score: 8 }),
    ]);
    expect(days[0]).toMatchObject({ scored: 3, scoreSum: 20 });
    expect(scores).toEqual([
      { score: 4, count: 1 },
      { score: 8, count: 2 },
    ]);
  });

  it('sépare les jours UTC et les renvoie triés (ordre de verrouillage stable)', () => {
    const { days } = aggregate([
      event({ eventId: '1', occurredAt: '2026-10-26T00:00:01.000Z' }),
      event({ eventId: '2', occurredAt: '2026-10-25T23:59:59.000Z' }),
      event({ eventId: '3', occurredAt: '2026-10-26T12:00:00.000Z' }),
    ]);
    expect(days.map((d) => [d.day, d.received])).toEqual([
      ['2026-10-25', 1],
      ['2026-10-26', 2],
    ]);
  });

  it('trie les scores par ordre croissant', () => {
    const { scores } = aggregate([
      event({ eventId: '1', type: 'lead.scored', score: 9 }),
      event({ eventId: '2', type: 'lead.scored', score: 2 }),
    ]);
    expect(scores.map((s) => s.score)).toEqual([2, 9]);
  });

  it('ne produit rien pour un lot vide', () => {
    expect(aggregate([])).toEqual({ days: [], scores: [] });
  });
});
