import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { bearerToken, tokenMatches } from '../common/token';
import { PrivacyService } from './privacy.service';

/**
 * Réserve l'effacement à un jeton d'administration distinct du jeton de lecture du tableau de bord.
 * Sans `ADMIN_TOKEN`, la fonction est désactivée : aucune clé par défaut.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_TOKEN');
    if (!expected) throw new ForbiddenException("Effacement désactivé : ADMIN_TOKEN n'est pas défini");
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    if (!tokenMatches(bearerToken(header), expected)) throw new UnauthorizedException();
    return true;
  }
}

export class EraseByEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

@Controller('leads')
@UseGuards(AdminTokenGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Droit à l'effacement d'un lead connu par son identifiant n8n. */
  @Delete(':externalId')
  @HttpCode(204)
  async erase(@Param('externalId') externalId: string): Promise<void> {
    if ((await this.privacy.eraseByExternalId(externalId)) === 0) throw new NotFoundException();
  }

  /**
   * Droit à l'effacement à la demande de la personne, qui ne connaît que son adresse. L'adresse passe dans le corps
   * et non dans l'URL, pour ne pas finir dans les journaux d'un proxy.
   */
  @Post('erase')
  @HttpCode(200)
  async eraseByEmail(@Body() dto: EraseByEmailDto): Promise<{ erased: number }> {
    return { erased: await this.privacy.eraseByEmail(dto.email) };
  }
}

@Module({ controllers: [PrivacyController], providers: [PrivacyService, AdminTokenGuard] })
export class PrivacyModule {}
