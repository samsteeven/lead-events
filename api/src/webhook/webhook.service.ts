import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { LeadEvent } from '../events/lead-event';
import { KafkaProducerService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';
import { N8nWebhookDto } from './webhook.dto';

const RANK: Record<LeadStatus, number> = { RECEIVED: 0, SCORED: 1, EMAILED: 2 };
const STATUS_OF: Record<N8nWebhookDto['type'], LeadStatus> = {
  'lead.received': 'RECEIVED',
  'lead.scored': 'SCORED',
  'email.sent': 'EMAILED',
};

/** Un lead ne recule jamais : un événement arrivé en retard ne peut pas faire repasser « e-mail envoyé » à « reçu ». */
export function furthest(a: LeadStatus, b: LeadStatus): LeadStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface WebhookResult {
  eventId: string;
  leadId: string;
  duplicate: boolean;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  /**
   * 1. enregistre le lead et la livraison dans une transaction (idempotence) ;
   * 2. publie l'événement dans Kafka ;
   * 3. marque la livraison comme publiée.
   * Si Kafka est indisponible, l'appel échoue en 503 : n8n le renvoie, et comme la livraison n'est pas marquée
   * « publiée », le rejeu republie l'événement (les doublons éventuels sont absorbés par le consumer).
   */
  async handle(dto: N8nWebhookDto): Promise<WebhookResult> {
    const webhookAt = new Date(); // départ de la mesure de latence « webhook -> événement consommé »
    const state = await this.persistWithRetry(dto);

    if (state.duplicate && state.published) {
      return { eventId: dto.idempotencyKey, leadId: state.leadId, duplicate: true };
    }

    const event: LeadEvent = {
      eventId: dto.idempotencyKey,
      type: dto.type,
      leadId: state.leadId,
      externalId: dto.lead.externalId,
      occurredAt: dto.occurredAt,
      webhookAt: webhookAt.toISOString(),
      ...(dto.type === 'lead.scored' ? { score: dto.score } : {}),
    };

    try {
      await this.kafka.publish(event);
    } catch (error) {
      this.logger.error(`Publication Kafka impossible pour ${dto.idempotencyKey} : ${(error as Error).message}`);
      throw new ServiceUnavailableException('Bus d\'événements indisponible, réessayer');
    }
    await this.prisma.webhookDelivery.update({
      where: { idempotencyKey: dto.idempotencyKey },
      data: { published: true },
    });
    return { eventId: dto.idempotencyKey, leadId: state.leadId, duplicate: state.duplicate };
  }

  /** Deux appels identiques simultanés se disputent la clé d'idempotence : le perdant relit simplement le gagnant. */
  private async persistWithRetry(dto: N8nWebhookDto): Promise<{ leadId: string; duplicate: boolean; published: boolean }> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.persist(tx, dto));
      } catch (error) {
        const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!conflict || attempt >= 3) throw error;
      }
    }
  }

  private async persist(
    tx: Prisma.TransactionClient,
    dto: N8nWebhookDto,
  ): Promise<{ leadId: string; duplicate: boolean; published: boolean }> {
    const existing = await tx.webhookDelivery.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return { leadId: existing.leadId, duplicate: true, published: existing.published };

    const leadId = await this.upsertLead(tx, dto);
    await tx.webhookDelivery.create({ data: { idempotencyKey: dto.idempotencyKey, type: dto.type, leadId } });
    return { leadId, duplicate: false, published: false };
  }

  private async upsertLead(tx: Prisma.TransactionClient, dto: N8nWebhookDto): Promise<string> {
    const occurredAt = new Date(dto.occurredAt);
    const { lead } = dto;
    const profile = {
      email: lead.email,
      ...(lead.fullName !== undefined && { fullName: lead.fullName }),
      ...(lead.company !== undefined && { company: lead.company }),
      ...(lead.message !== undefined && { message: lead.message }),
      ...(lead.source !== undefined && { source: lead.source }),
    };
    const target = STATUS_OF[dto.type];
    // Champs propres à l'étape : renseignés à la création comme à la mise à jour du lead.
    const stage: { score?: number; scoreReason?: string; scoredAt?: Date; emailSentAt?: Date } =
      dto.type === 'lead.scored'
        ? { score: dto.score, scoreReason: dto.scoreReason, scoredAt: occurredAt }
        : dto.type === 'email.sent'
          ? { emailSentAt: occurredAt }
          : {};

    const existing = await tx.lead.findUnique({ where: { externalId: lead.externalId } });
    if (!existing) {
      const created = await tx.lead.create({
        data: { externalId: lead.externalId, ...profile, ...stage, status: target, receivedAt: occurredAt },
      });
      return created.id;
    }
    const updated = await tx.lead.update({
      where: { id: existing.id },
      data: {
        ...profile,
        ...stage,
        status: furthest(existing.status, target),
        receivedAt: occurredAt < existing.receivedAt ? occurredAt : existing.receivedAt,
      },
    });
    return updated.id;
  }
}
