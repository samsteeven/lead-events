import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifySignature } from './signature';

/** Refuse tout appel du webhook dont la signature HMAC est absente, expirée ou fausse. */
@Injectable()
export class SignatureGuard implements CanActivate {
  private readonly logger = new Logger(SignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const header = req.headers['x-lead-signature'];
    const result = verifySignature(
      typeof header === 'string' ? header : undefined,
      req.rawBody,
      this.config.getOrThrow<string>('WEBHOOK_SECRET'),
    );
    if (!result.ok) {
      // La raison reste dans les journaux : la réponse ne dit pas à un attaquant ce qui a échoué.
      this.logger.warn(`Appel refusé (${result.reason}) depuis ${req.ip}`);
      throw new UnauthorizedException('Signature invalide');
    }
    return true;
  }
}
