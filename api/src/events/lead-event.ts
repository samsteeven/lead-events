/** Les trois étapes de l'agent de qualification, dans l'ordre où n8n les déclenche. */
export const EVENT_TYPES = ['lead.received', 'lead.scored', 'email.sent'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Événement publié dans Kafka (topic `lead.events`, clé = identifiant du lead : tous les événements d'un lead
 * restent donc dans la même partition, dans l'ordre).
 */
export interface LeadEvent {
  /** Clé d'idempotence fournie par n8n ; sert aussi d'identifiant d'événement. */
  eventId: string;
  type: EventType;
  leadId: string;
  externalId: string;
  /** Heure de l'événement côté n8n. */
  occurredAt: string;
  /** Heure d'arrivée du webhook dans l'API : point de départ de la mesure de latence. */
  webhookAt: string;
  score?: number;
}

export class InvalidEventError extends Error {}

/** Valide un message Kafka reçu (JSON non fiable) et le convertit en événement typé. */
export function parseLeadEvent(raw: string): LeadEvent {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidEventError('JSON invalide');
  }
  if (typeof value !== 'object' || value === null) throw new InvalidEventError('objet attendu');
  const e = value as Record<string, unknown>;

  const str = (k: string): string => {
    const v = e[k];
    if (typeof v !== 'string' || v.length === 0) throw new InvalidEventError(`champ « ${k} » manquant`);
    return v;
  };
  const date = (k: string): string => {
    const v = str(k);
    if (Number.isNaN(Date.parse(v))) throw new InvalidEventError(`champ « ${k} » : date invalide`);
    return v;
  };

  const type = str('type');
  if (!(EVENT_TYPES as readonly string[]).includes(type)) throw new InvalidEventError(`type inconnu : ${type}`);

  const event: LeadEvent = {
    eventId: str('eventId'),
    type: type as EventType,
    leadId: str('leadId'),
    externalId: str('externalId'),
    occurredAt: date('occurredAt'),
    webhookAt: date('webhookAt'),
  };
  if (event.type === 'lead.scored') {
    const score = e['score'];
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) {
      throw new InvalidEventError('score : entier de 1 à 10 attendu');
    }
    event.score = score;
  }
  return event;
}
