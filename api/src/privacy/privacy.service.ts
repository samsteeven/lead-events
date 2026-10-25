import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** La conservation est vérifiée au démarrage puis toutes les heures. */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Données personnelles : seule la table `leads` en contient (adresse e-mail, nom, entreprise, message, motif du score).
 * Les événements Kafka, les livraisons du webhook et les événements traités ne portent que des identifiants ; les
 * compteurs sont agrégés. Effacer ou expirer un lead suffit donc à retirer la personne du système.
 */
@Injectable()
export class PrivacyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrivacyService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Durée de conservation en jours (`LEAD_RETENTION_DAYS`) ; `null` si aucune expiration n'est configurée. */
  retentionDays(): number | null {
    const raw = this.config.get<string>('LEAD_RETENTION_DAYS');
    return raw ? Number(raw) : null;
  }

  onModuleInit(): void {
    const days = this.retentionDays();
    if (days === null) return;
    void this.runRetention(days);
    this.timer = setInterval(() => void this.runRetention(days), RETENTION_INTERVAL_MS);
    this.timer.unref(); // ne retient pas l'arrêt du processus
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Efface le lead identifié par son identifiant côté n8n ; renvoie le nombre de leads effacés (0 ou 1). */
  async eraseByExternalId(externalId: string): Promise<number> {
    const { count } = await this.prisma.lead.deleteMany({ where: { externalId } });
    if (count > 0) this.logger.log(`Effacement : ${count} lead(s) supprimé(s) (identifiant externe)`);
    return count;
  }

  /** Efface tous les leads d'une adresse e-mail (sans tenir compte de la casse), cas d'une demande de la personne. */
  async eraseByEmail(email: string): Promise<number> {
    const { count } = await this.prisma.lead.deleteMany({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (count > 0) this.logger.log(`Effacement : ${count} lead(s) supprimé(s) (adresse e-mail)`);
    return count;
  }

  /** Supprime les leads reçus il y a plus de `days` jours. */
  async purgeOlderThan(days: number, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const { count } = await this.prisma.lead.deleteMany({ where: { receivedAt: { lt: cutoff } } });
    return count;
  }

  private async runRetention(days: number): Promise<void> {
    try {
      const count = await this.purgeOlderThan(days);
      if (count > 0) this.logger.log(`Conservation : ${count} lead(s) de plus de ${days} jours supprimé(s)`);
    } catch (error) {
      this.logger.error(`Purge de conservation en échec : ${(error as Error).message}`);
    }
  }
}
