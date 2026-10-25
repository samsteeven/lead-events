import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MinLength, ValidateIf, validateSync } from 'class-validator';

/** Variables d'environnement requises : l'application refuse de démarrer si l'une manque ou est trop faible. */
export class Env {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** Adresses des brokers Kafka, séparées par des virgules. */
  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS!: string;

  /** Secret partagé avec n8n pour signer les appels du webhook (HMAC-SHA256). */
  @IsString()
  @MinLength(16)
  WEBHOOK_SECRET!: string;

  /** Jeton à présenter pour lire les statistiques et la liste des leads (jamais exposés sans lui). */
  @IsString()
  @MinLength(16)
  DASHBOARD_TOKEN!: string;

  /**
   * Jeton d'administration qui autorise l'effacement d'un lead (distinct du jeton de lecture). Optionnel : sans lui,
   * l'effacement est désactivé. Une valeur vide équivaut à l'absence de valeur.
   */
  @ValidateIf((e: Env) => e.ADMIN_TOKEN !== undefined && e.ADMIN_TOKEN !== '')
  @IsString()
  @MinLength(16)
  ADMIN_TOKEN?: string;

  /** Nombre de jours pendant lesquels un lead est conservé (entier positif). Sans valeur, aucune expiration. */
  @ValidateIf((e: Env) => e.LEAD_RETENTION_DAYS !== undefined && e.LEAD_RETENTION_DAYS !== '')
  @IsString()
  @Matches(/^[1-9]\d{0,4}$/, { message: 'doit être un nombre entier de jours supérieur à 0' })
  LEAD_RETENTION_DAYS?: string;

  /** Origines autorisées pour le tableau de bord, séparées par des virgules. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  /** Topic des événements (défaut `lead.events`) ; la file morte s'appelle `<topic>.dlq`. */
  @IsOptional()
  @IsString()
  KAFKA_TOPIC?: string;

  /** Groupe du consumer (défaut `lead-stats`) : les tests en utilisent un par exécution. */
  @IsOptional()
  @IsString()
  KAFKA_CONSUMER_GROUP?: string;

  /** Partitions lues en parallèle par le consumer (défaut 1 ; le topic en a 3). */
  @IsOptional()
  @IsString()
  KAFKA_CONSUMER_CONCURRENCY?: string;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property} (${Object.values(e.constraints ?? {}).join(', ')})`).join('; ');
    throw new Error(`Configuration invalide : ${detail}`);
  }
  return env;
}
