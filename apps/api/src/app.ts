// Builds the API. Dependencies are passed in so tests and the E2E server can supply the clock,
// mailer, and database.
import Fastify, { type FastifyInstance } from 'fastify';
import type { Clock } from './platform/clock.ts';
import type { Config } from './platform/config.ts';
import type { Db } from './platform/db.ts';
import { registerErrorHandler } from './platform/errors.ts';
import type { Mailer, MemoryMailer } from './platform/mailer.ts';
import { AccountsService } from './modules/identity/accounts-service.ts';
import { AuthService } from './modules/identity/auth-service.ts';
import { ProfileService } from './modules/identity/profile-service.ts';
import { bearer, registerIdentityRoutes } from './modules/identity/routes.ts';
import { MembershipService } from './modules/organization/membership-service.ts';
import { OrganizationService } from './modules/organization/organization-service.ts';
import { registerOrganizationRoutes } from './modules/organization/routes.ts';
import { attendanceSyncHandler } from './modules/calendar/attendance-sync.ts';
import { AttendanceService } from './modules/calendar/attendance-service.ts';
import { ExceptionService } from './modules/calendar/exception-service.ts';
import { registerCalendarRoutes } from './modules/calendar/routes.ts';
import { QuranMetadataService } from './modules/quran-ref/metadata-service.ts';
import { registerQuranRoutes } from './modules/quran-ref/routes.ts';
import { QuranSeedLoader, readSeedFile } from './modules/quran-ref/seed.ts';
import { ScheduleService } from './modules/calendar/schedule-service.ts';
import { ClassService } from './modules/roster/class-service.ts';
import { registerRosterRoutes } from './modules/roster/routes.ts';
import { rosterScope } from './modules/roster/scope.ts';
import { StudentService } from './modules/roster/student-service.ts';
import { TokenService } from './modules/identity/tokens.ts';
import { ConflictService } from './modules/sync/conflict-service.ts';
import { SyncControl } from './modules/sync/control-state.ts';
import { SyncRegistry, type SyncHandler } from './modules/sync/handler.ts';
import { registerSyncRoutes } from './modules/sync/routes.ts';
import type { SyncScopeProvider } from './modules/sync/scope.ts';
import { SyncService } from './modules/sync/sync-service.ts';
import { registerTestControl, type LogSink } from './testing/control.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  clock: Clock;
  mailer: Mailer;
  /** Captured log lines, for the test-control text search. */
  logSink?: LogSink;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Test builds only (NODE_ENV=test): extra sync entity handlers, such as the integration tests' sync_probe
   * (F12 decision Q1), and a scope provider replacing the roster's (F03).
   */
  testSync?: { handlers?: SyncHandler[]; scopes?: SyncScopeProvider };
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Trust X-Forwarded-For only from the configured number of proxy hops (code review L7).
    trustProxy: (_address: string, hop: number) => hop < deps.config.trustProxyHops,
    bodyLimit: 64 * 1024,
    logger: {
      level: deps.config.env === 'production' ? 'info' : 'debug',
      // Never log credentials (FR-AUD-003). Request bodies are not logged at all.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-test-control-secret"]'],
      ...(deps.logSink ? { stream: deps.logSink } : {}),
    },
  });
  registerErrorHandler(app);

  const tokens = new TokenService(deps.config.jwtSecret, deps.clock);
  const auth = new AuthService({
    db: deps.db,
    clock: deps.clock,
    tokens,
    mailer: deps.mailer,
    hashPepper: deps.config.hashPepper,
    totpKey: deps.config.totpKey,
    sleep: deps.sleep ?? realSleep,
    log: app.log,
  });
  const accounts = new AccountsService(deps.db, deps.clock);
  const profile = new ProfileService(deps.db, deps.clock, auth);

  app.get('/', async () => ({ status: 'ok' }));
  registerIdentityRoutes(app, { auth, accounts, profile });
  // ---------- Quran reference (F06) ----------
  // Synthetic seeds are accepted only in test builds. The production seed file is unset until a dataset is approved
  // (DEFERRED: DEC-B31); with no file, new madrasas start with empty Quran metadata.
  const quranSeeds = new QuranSeedLoader(deps.db, deps.clock, { allowSynthetic: deps.config.env === 'test' });
  const approvedSeed = deps.config.quranSeedFile ? await readSeedFile(deps.config.quranSeedFile) : null;
  const organization = new OrganizationService(
    deps.db,
    deps.clock,
    approvedSeed ? async (tx, organizationId) => void (await quranSeeds.applyInTx(tx, organizationId, approvedSeed, null)) : null,
  );
  registerOrganizationRoutes(app, {
    authenticate: (request) => auth.authenticate(bearer(request)),
    organization,
    memberships: new MembershipService(deps.db, deps.clock, accounts),
  });

  // ---------- Roster (F03) ----------
  registerRosterRoutes(app, {
    authenticate: (request) => auth.authenticate(bearer(request)),
    classes: new ClassService(deps.db, deps.clock),
    students: new StudentService(deps.db, deps.clock),
  });

  // ---------- Calendar and attendance (F04) ----------
  registerCalendarRoutes(app, {
    authenticate: (request) => auth.authenticate(bearer(request)),
    schedules: new ScheduleService(deps.db, deps.clock),
    exceptions: new ExceptionService(deps.db, deps.clock),
    attendance: new AttendanceService(deps.db, deps.clock),
  });

  registerQuranRoutes(app, {
    authenticate: (request) => auth.authenticate(bearer(request)),
    quran: new QuranMetadataService(deps.db, deps.clock),
  });

  if (deps.testSync && deps.config.env !== 'test') throw new Error('Test sync handlers are allowed only when NODE_ENV=test');
  // Production entity handlers: attendance (F04). F05/F07/F08 register theirs here; tests may add sync_probe.
  const syncRegistry = new SyncRegistry([attendanceSyncHandler({ clock: deps.clock }), ...(deps.testSync?.handlers ?? [])]);
  const syncScopes = deps.testSync?.scopes ?? rosterScope(deps.db, deps.clock);
  const syncControl = new SyncControl(deps.config.syncMinProtocolVersion);
  const syncDeps = { db: deps.db, clock: deps.clock, registry: syncRegistry, scopes: syncScopes };
  registerSyncRoutes(app, {
    authenticate: (request) => auth.authenticate(bearer(request)),
    sync: new SyncService({ ...syncDeps, control: syncControl }),
    conflicts: new ConflictService(syncDeps),
    control: syncControl,
  });

  if (deps.config.testControlSecret) {
    if (deps.config.env !== 'test') throw new Error('The test-control API is enabled only when NODE_ENV=test');
    registerTestControl(app, {
      secret: deps.config.testControlSecret,
      db: deps.db,
      clock: deps.clock,
      mailer: deps.mailer as MemoryMailer,
      logSink: deps.logSink,
      totpKey: deps.config.totpKey,
      organization,
      quranSeeds,
      sync: { control: syncControl, registry: syncRegistry },
    });
  }
  return app;
}
