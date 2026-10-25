import { InvalidEventError, parseLeadEvent } from './lead-event';

const base = {
  eventId: 'exec-1:lead.received',
  type: 'lead.received',
  leadId: '6f0f6a7e-9d0e-4a53-8f7e-6e0b52a1f0a1',
  externalId: 'crm-42',
  occurredAt: '2026-10-25T10:00:00.000Z',
  webhookAt: '2026-10-25T10:00:01.000Z',
};

describe('parseLeadEvent', () => {
  it('lit un événement « lead reçu »', () => {
    expect(parseLeadEvent(JSON.stringify(base))).toEqual(base);
  });

  it('lit un événement « scoré » avec son score', () => {
    const event = parseLeadEvent(JSON.stringify({ ...base, type: 'lead.scored', score: 8 }));
    expect(event.score).toBe(8);
  });

  it('ignore un score fourni sur un autre type d\'événement', () => {
    expect(parseLeadEvent(JSON.stringify({ ...base, score: 8 })).score).toBeUndefined();
  });

  it.each([0, 11, 7.5, '8', null])('refuse le score %p', (score) => {
    expect(() => parseLeadEvent(JSON.stringify({ ...base, type: 'lead.scored', score }))).toThrow(InvalidEventError);
  });

  it('refuse un événement « scoré » sans score', () => {
    expect(() => parseLeadEvent(JSON.stringify({ ...base, type: 'lead.scored' }))).toThrow(InvalidEventError);
  });

  it('refuse un type inconnu', () => {
    expect(() => parseLeadEvent(JSON.stringify({ ...base, type: 'lead.deleted' }))).toThrow(/type inconnu/);
  });

  it.each(['eventId', 'leadId', 'externalId', 'occurredAt', 'webhookAt', 'type'])('refuse l\'absence de « %s »', (field) => {
    const { [field]: _removed, ...incomplete } = base as Record<string, string>;
    expect(() => parseLeadEvent(JSON.stringify(incomplete))).toThrow(InvalidEventError);
  });

  it('refuse une date invalide', () => {
    expect(() => parseLeadEvent(JSON.stringify({ ...base, webhookAt: 'hier' }))).toThrow(/date invalide/);
  });

  it.each(['pas du json', '', 'null', '[]', '42'])('refuse un message illisible (%p)', (raw) => {
    expect(() => parseLeadEvent(raw)).toThrow(InvalidEventError);
  });
});
