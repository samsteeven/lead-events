import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { bearerToken, tokenMatches } from '../common/token';
import { validateEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AdminTokenGuard } from './privacy.controller';
import { PrivacyService } from './privacy.service';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://x',
  KAFKA_BROKERS: 'localhost:9094',
  WEBHOOK_SECRET: 'a'.repeat(16),
  DASHBOARD_TOKEN: 'b'.repeat(16),
};

function service(env: Record<string, string> = {}) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
  const prisma = { lead: { deleteMany } } as unknown as PrismaService;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return { svc: new PrivacyService(prisma, config), deleteMany };
}

describe('conservation des leads', () => {
  it('supprime les leads reçus avant la limite, calculée en jours pleins', async () => {
    const { svc, deleteMany } = service();
    const now = new Date('2026-10-25T12:00:00.000Z');
    await expect(svc.purgeOlderThan(30, now)).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({ where: { receivedAt: { lt: new Date('2026-09-25T12:00:00.000Z') } } });
  });

  it('ne purge rien au démarrage sans LEAD_RETENTION_DAYS', () => {
    const { svc, deleteMany } = service();
    expect(svc.retentionDays()).toBeNull();
    svc.onModuleInit();
    svc.onModuleDestroy();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('purge au démarrage quand LEAD_RETENTION_DAYS est défini, puis arrête son minuteur', () => {
    const { svc, deleteMany } = service({ LEAD_RETENTION_DAYS: '90' });
    expect(svc.retentionDays()).toBe(90);
    svc.onModuleInit();
    svc.onModuleDestroy();
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe('effacement', () => {
  it('efface par identifiant externe et renvoie le nombre de leads supprimés', async () => {
    const { svc, deleteMany } = service();
    await expect(svc.eraseByExternalId('crm-42')).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({ where: { externalId: 'crm-42' } });
  });

  it('efface par adresse e-mail sans tenir compte de la casse', async () => {
    const { svc, deleteMany } = service();
    await svc.eraseByEmail('Jane@Acme.com');
    expect(deleteMany).toHaveBeenCalledWith({ where: { email: { equals: 'Jane@Acme.com', mode: 'insensitive' } } });
  });
});

describe('AdminTokenGuard', () => {
  const context = (authorization?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as unknown as ExecutionContext;
  const guard = (adminToken?: string) => new AdminTokenGuard({ get: () => adminToken } as unknown as ConfigService);

  it('désactive la fonction sans ADMIN_TOKEN, même avec un en-tête', () => {
    expect(() => guard(undefined).canActivate(context('Bearer rien'))).toThrow(ForbiddenException);
    expect(() => guard('').canActivate(context('Bearer '))).toThrow(ForbiddenException);
  });

  it('refuse un jeton absent ou faux et accepte le bon', () => {
    const admin = 'c'.repeat(20);
    expect(() => guard(admin).canActivate(context())).toThrow(UnauthorizedException);
    expect(() => guard(admin).canActivate(context('Bearer faux'))).toThrow(UnauthorizedException);
    expect(guard(admin).canActivate(context(`Bearer ${admin}`))).toBe(true);
  });
});

describe('jetons', () => {
  it('extrait le jeton Bearer', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBe('');
    expect(bearerToken(undefined)).toBe('');
  });

  it('compare sans fuite de longueur', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abcd')).toBe(false);
    expect(tokenMatches('', 'abc')).toBe(false);
  });
});

describe('configuration', () => {
  it("accepte l'absence de ADMIN_TOKEN et de LEAD_RETENTION_DAYS, ou des valeurs vides", () => {
    expect(() => validateEnv(BASE_ENV)).not.toThrow();
    expect(() => validateEnv({ ...BASE_ENV, ADMIN_TOKEN: '', LEAD_RETENTION_DAYS: '' })).not.toThrow();
  });

  it('refuse un ADMIN_TOKEN trop court', () => {
    expect(() => validateEnv({ ...BASE_ENV, ADMIN_TOKEN: 'court' })).toThrow(/ADMIN_TOKEN/);
  });

  it.each(['0', '-5', 'abc', '1.5', '100000'])('refuse LEAD_RETENTION_DAYS = %s', (value) => {
    expect(() => validateEnv({ ...BASE_ENV, LEAD_RETENTION_DAYS: value })).toThrow(/LEAD_RETENTION_DAYS/);
  });

  it.each(['1', '90', '3650'])('accepte LEAD_RETENTION_DAYS = %s', (value) => {
    expect(() => validateEnv({ ...BASE_ENV, LEAD_RETENTION_DAYS: value })).not.toThrow();
  });
});
