import {
  CanActivate,
  Controller,
  DefaultValuePipe,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  ParseIntPipe,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { StatsService } from './stats.service';

/** Toutes les lectures exigent `Authorization: Bearer <DASHBOARD_TOKEN>` : les leads sont des données personnelles. */
@Injectable()
export class DashboardTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    // On compare des empreintes de même longueur : temps constant, quelle que soit la longueur du jeton fourni.
    const digest = (v: string) => createHash('sha256').update(v).digest();
    if (!timingSafeEqual(digest(token), digest(this.config.getOrThrow<string>('DASHBOARD_TOKEN')))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Borne un paramètre numérique de l'URL pour éviter les requêtes démesurées. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

@Controller()
@UseGuards(DashboardTokenGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats/summary')
  summary(@Query('minutes', new DefaultValuePipe(15), ParseIntPipe) minutes: number) {
    return this.stats.summary(clamp(minutes, 1, 1440));
  }

  @Get('stats/daily')
  daily(@Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number) {
    return this.stats.daily(clamp(days, 1, 90));
  }

  @Get('stats/scores')
  scores() {
    return this.stats.scores();
  }

  @Get('stats/latency')
  latency(@Query('minutes', new DefaultValuePipe(30), ParseIntPipe) minutes: number) {
    return this.stats.latencySeries(clamp(minutes, 1, 1440));
  }

  @Get('leads')
  leads(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.stats.recentLeads(clamp(limit, 1, 200));
  }
}

@Module({ controllers: [StatsController], providers: [StatsService, DashboardTokenGuard] })
export class StatsModule {}
