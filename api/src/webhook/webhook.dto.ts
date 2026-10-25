import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EVENT_TYPES, type EventType } from '../events/lead-event';

export class LeadDto {
  /** Identifiant du lead dans la CRM de n8n. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  externalId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

/** Corps de l'appel envoyé par n8n à chaque étape du workflow « Lead Agent ». */
export class N8nWebhookDto {
  @IsIn(EVENT_TYPES)
  type!: EventType;

  /** Identique à chaque nouvel essai du même appel (ex. `<executionId>:lead.scored`) : rend les rejeux sans effet. */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @ValidateNested()
  @Type(() => LeadDto)
  lead!: LeadDto;

  @ValidateIf((o: N8nWebhookDto) => o.type === 'lead.scored')
  @IsInt()
  @Min(1)
  @Max(10)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  scoreReason?: string;
}
