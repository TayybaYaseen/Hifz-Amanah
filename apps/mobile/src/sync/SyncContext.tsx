// Sync for screens (F12; US-051…US-054). Opens the signed-in Teacher/Admin/Owner's workspace database (one per
// account + organization), runs the engine on connectivity regained, app foreground, a save, a timer, and
// "Sync now", and exposes the queue, the banner state, conflicts, and the sign-out flow (F12-AC10, Q14).
// Student and Parent are online-only: no database and no engine for them (AGENTS.md §7).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { OrganizationSettingsResponse } from '@hifz/contracts';
import type { QueueState } from '@hifz/domain/sync';
import { useSession } from '../auth/SessionContext.tsx';
import type { SqlDriver } from '../local-db/driver.ts';
import { expoDatabaseFiles } from '../local-db/expoDriver.ts';
import { bannerFor, unsyncedOf, type Banner } from './banner.ts';
import { DeviceIndex, OFFLINE_ROLES, openWorkspaceDb, type WorkspaceEntry, type WorkspaceIdentity } from './deviceIndex.ts';
import { SyncEngine, type EngineSnapshot, type SyncOutcome } from './engine.ts';
import { createIdSource, randomUuid } from './ids.ts';
import { Outbox, type OutboxItem } from './outbox.ts';
import { secureRandomBytes } from './platform.ts';
import { appRegistry, type EntityRegistry } from './registry.ts';
import { httpSyncApi, type ConflictApi } from './transport.ts';
import { holdForSignOut, lockWorkspace, quiesceForSignOut, readMeta, resumeHeld, setOrgTimeZone, signOutAction, type WorkspaceMeta } from './workspace.ts';

const TIMER_MS = 30_000;
const EMPTY_COUNTS: Record<QueueState, number> = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0, ACTION_REQUIRED: 0 };

export type SignOutSheet = null | { variant: 'normal' | 'expired' | 'revoked' };

interface Workspace {
  entry: WorkspaceEntry;
  db: SqlDriver;
  outbox: Outbox;
  engine: SyncEngine | null;
}

export interface SyncContextValue {
  /** A workspace database is open (Teacher/Admin/Owner). */
  enabled: boolean;
  /** The local database has been read at least once. */
  ready: boolean;
  /** The local database could not be opened or read. */
  loadError: boolean;
  workspace: WorkspaceEntry | null;
  items: OutboxItem[];
  counts: Record<QueueState, number>;
  unsynced: number;
  meta: WorkspaceMeta | null;
  engine: EngineSnapshot;
  online: boolean;
  locked: boolean;
  upgradeRequired: boolean;
  banner: Banner | null;
  /** Held changes that resumed at this sign-in (one-time notice), or null. */
  restoredCount: number | null;
  dismissRestored(): void;
  /**
   * For features (F04/F05/F08) to save: `saveWithOp` for a CREATE or COMMAND, `saveWithUpdate` for every edit of an
   * existing row (it derives the base version and per-row dependencies, review N3). Null for Student/Parent.
   */
  outbox: Outbox | null;
  registry: EntityRegistry;
  conflicts: ConflictApi;
  syncNow(): Promise<SyncOutcome | null>;
  retry(opId: string): Promise<void>;
  discard(opId: string): Promise<void>;
  conflictResolved(conflictId: string, rowVersion: number): Promise<void>;
  /** Conflict Review learned the conflict is already resolved (CONFLICT_CLOSED or a RESOLVED detail; review H2). */
  conflictClosed(conflictId: string): Promise<void>;
  reload(): void;
  /**
   * Every sign-out entry point calls this: it reads the live unsynced count and opens the warning when changes are
   * unsynced (F12-AC10; review M3).
   */
  requestSignOut(): Promise<void>;
  signOutSheet: SignOutSheet;
  closeSignOutSheet(): void;
  /**
   * Signs out. "Sign out anyway" holds unsynced changes (Q14); a revoked workspace is deleted (F12-AC20). The rule
   * is applied to the live count at that moment (workspace.signOutAction), never to what the sheet showed.
   */
  signOutNow(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

let deviceIndexPromise: Promise<DeviceIndex> | null = null;
function deviceIndex(): Promise<DeviceIndex> {
  deviceIndexPromise ??= DeviceIndex.open(expoDatabaseFiles, () => randomUuid(secureRandomBytes)).catch((err: unknown) => {
    deviceIndexPromise = null;
    throw err;
  });
  return deviceIndexPromise;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session, state } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [meta, setMeta] = useState<WorkspaceMeta | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [engineState, setEngineState] = useState<EngineSnapshot>({ running: false, online: true, lastOutcome: null });
  const [online, setOnline] = useState(true);
  const [restoredCount, setRestoredCount] = useState<number | null>(null);
  const [signOutSheet, setSignOutSheet] = useState<SignOutSheet>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const workspaceRef = useRef<Workspace | null>(null);
  workspaceRef.current = workspace;

  // Which workspace belongs on screen: the signed-in staff account, or (expired / offline / revoked) the last one
  // opened by that User ID, read-only. Nothing for Student/Parent or when signed out.
  const target = useMemo((): { identity: WorkspaceIdentity | null; loginId: string | null; live: boolean } | null => {
    if (state.kind === 'signedIn') {
      if (!OFFLINE_ROLES.includes(state.me.role)) return null;
      const me = state.me;
      return { identity: { userId: me.id, orgId: me.organization.id, loginId: me.loginId, orgName: me.organization.name, role: me.role }, loginId: me.loginId, live: true };
    }
    if ((state.kind === 'expired' || state.kind === 'offline' || state.kind === 'revoked') && state.loginId) {
      return { identity: null, loginId: state.loginId, live: false };
    }
    return null;
  }, [state]);
  const targetKey = target ? `${target.identity?.userId ?? target.loginId}|${target.identity?.orgId ?? ''}|${target.live}` : null;

  // F12-AC20, Q14: on app start and each return to the foreground, held or locked workspaces whose 30 days have
  // passed are deleted, whoever is signed in (active workspaces are never touched).
  useEffect(() => {
    const purge = () =>
      void deviceIndex()
        .then(async (index) => index.purgeExpired(await index.purgeNow(Date.now()), workspaceRef.current?.entry.dbName ?? null))
        .catch(() => undefined);
    purge();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') purge();
    });
    return () => sub.remove();
  }, []);

  // Open / close the workspace database.
  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    let opened: Workspace | null = null;
    setReady(false);
    setLoadError(false);
    void (async () => {
      try {
        const index = await deviceIndex();
        // Never behind the last server time, so a phone clock set back cannot postpone the purge (review L6).
        const now = await index.purgeNow(Date.now());
        // F12-AC20, Q14: held or locked changes older than 30 days are deleted first, including this account's,
        // so signing in after 30 days never resumes them.
        await index.purgeExpired(now, null);
        const entry = target.identity ? await index.activate(target.identity, now) : await index.latestFor(target.loginId!);
        if (!entry || !OFFLINE_ROLES.includes(entry.role)) {
          setReady(true);
          return;
        }
        const db = await openWorkspaceDb(expoDatabaseFiles, entry.dbName);
        const clock = () => Date.now();
        const outbox = new Outbox(db, { clock, newId: createIdSource(clock, secureRandomBytes), registry: appRegistry });
        let engine: SyncEngine | null = null;
        if (target.live) {
          const api = httpSyncApi(session);
          engine = new SyncEngine({
            db,
            outbox,
            registry: appRegistry,
            transport: api,
            conflicts: api,
            deviceId: await index.deviceId(),
            clock,
            random: Math.random,
            onAccessRevoked: () =>
              void index
                .purgeNow(Date.now())
                .then((at) => index.setState(entry.dbName, 'LOCKED_REVOKED', at))
                .catch(() => undefined),
            onServerTime: (serverTime) => void index.noteServerTime(serverTime).catch(() => undefined),
          });
          await engine.start();
          const restored = await resumeHeld(db);
          if (restored) setRestoredCount(restored);
        }
        if (cancelled) {
          engine?.stop();
          await db.close();
          return;
        }
        opened = { entry, db, outbox, engine };
        setWorkspace(opened);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (opened) {
        opened.engine?.stop();
        const db = opened.db;
        void db.close().catch(() => undefined);
      }
      setWorkspace(null);
      setItems([]);
      setCounts(EMPTY_COUNTS);
      setMeta(null);
    };
    // The session object is stable; the target key decides when to reopen.
  }, [targetKey]);

  // Read the queue whenever the outbox changes.
  useEffect(() => {
    if (!workspace) return undefined;
    let stale = false;
    let queued = false;
    const read = async () => {
      if (queued) return;
      queued = true;
      await Promise.resolve();
      queued = false;
      try {
        const [list, c, m] = await Promise.all([workspace.outbox.list(), workspace.outbox.counts(), readMeta(workspace.db)]);
        if (stale) return;
        setItems(list);
        setCounts(c);
        setMeta(m);
        setLoadError(false);
        setReady(true);
      } catch {
        if (!stale) setLoadError(true);
      }
    };
    void read();
    const unsubscribe = workspace.outbox.subscribe(() => void read());
    const unsubEngine = workspace.engine?.subscribe((s) => {
      setEngineState(s);
      void read();
    });
    return () => {
      stale = true;
      unsubscribe();
      unsubEngine?.();
    };
  }, [workspace, reloadKey]);

  // Triggers: connectivity regained, foreground, a save, a timer (F12 plan §8).
  useEffect(() => {
    const engine = workspace?.engine;
    const unsubscribeNet = NetInfo.addEventListener((net) => {
      const isOnline = net.isConnected === true && net.isInternetReachable !== false;
      setOnline(isOnline);
      engine?.setOnline(isOnline);
    });
    if (!engine || !workspace) return unsubscribeNet;
    const unsubscribeSaved = workspace.outbox.subscribeSaved(() => engine.requestSync('save'));
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        engine.requestSync('foreground');
        void engine.cleanupIfDue().catch(() => undefined);
      }
    });
    const timer = setInterval(() => void engine.tick().catch(() => undefined), TIMER_MS);
    engine.requestSync('start');
    return () => {
      unsubscribeNet();
      unsubscribeSaved();
      appState.remove();
      clearInterval(timer);
    };
  }, [workspace]);

  // The madrasa timezone decides the 120-day cache window (F12-AC19); best effort, online only.
  useEffect(() => {
    if (!workspace?.engine || state.kind !== 'signedIn') return;
    void session
      .authorized<OrganizationSettingsResponse>('/organization')
      .then((org) => setOrgTimeZone(workspace.db, org.timezone))
      .catch(() => undefined);
  }, [workspace, session, state.kind]);

  // Any 403 ACCESS_REVOKED (sync or any other call) locks the workspace: synced data purged at once (F12-AC14, AC20).
  useEffect(() => {
    if (state.kind !== 'revoked' || !workspace) return;
    if (meta?.workspaceState === 'LOCKED_REVOKED') return;
    void (async () => {
      const index = await deviceIndex();
      const at = await index.purgeNow(Date.now());
      await lockWorkspace(workspace.db, appRegistry, at);
      await index.setState(workspace.entry.dbName, 'LOCKED_REVOKED', at);
      workspace.outbox.notify();
    })().catch(() => setLoadError(true));
  }, [state.kind, workspace, meta?.workspaceState]);

  const unsynced = unsyncedOf(counts);
  const locked = meta?.workspaceState === 'LOCKED_REVOKED' || state.kind === 'revoked';
  const upgradeRequired = Boolean(meta?.upgradeRequiredAt) || engineState.lastOutcome === 'UPGRADE_REQUIRED';

  const signOutNow = useCallback(async () => {
    setSignOutSheet(null);
    const ws = workspaceRef.current;
    try {
      if (ws) {
        // Review N6: refuse new saves, stop the engine, and wait for the run and saves in flight, so no save or
        // sync result lands between the count below and the purge.
        await quiesceForSignOut({ engine: ws.engine, outbox: ws.outbox });
        const index = await deviceIndex();
        const remaining = await ws.outbox.unsyncedCount();
        const isLocked = (await readMeta(ws.db)).workspaceState === 'LOCKED_REVOKED' || state.kind === 'revoked';
        // Review M3: unsynced changes are deleted only for a revoked workspace (F12-AC20); otherwise held (Q14).
        if (signOutAction({ remaining, locked: isLocked }) === 'HOLD') {
          const at = await index.purgeNow(Date.now());
          await holdForSignOut(ws.db, appRegistry, at);
          await index.setState(ws.entry.dbName, 'HELD', at);
          await ws.db.close();
        } else {
          await ws.db.close();
          await index.remove(ws.entry.dbName);
        }
      }
    } finally {
      await session.signOut();
    }
  }, [session, state.kind]);

  const value: SyncContextValue = {
    enabled: workspace !== null,
    ready,
    loadError,
    workspace: workspace?.entry ?? null,
    items,
    counts,
    unsynced,
    meta,
    engine: engineState,
    online,
    locked,
    upgradeRequired,
    banner: workspace
      ? bannerFor({
          counts,
          locked,
          upgradeRequired,
          sessionExpired: state.kind === 'expired',
          online,
          running: engineState.running,
          lastSuccessAt: meta?.lastSuccessAt ?? null,
        })
      : null,
    restoredCount,
    dismissRestored: () => setRestoredCount(null),
    outbox: workspace?.engine ? workspace.outbox : null,
    registry: appRegistry,
    conflicts: httpSyncApi(session),
    syncNow: async () => (workspace?.engine ? workspace.engine.syncNow({ ignoreBackoff: true }) : null),
    retry: async (opId) => workspace?.engine?.retry(opId),
    discard: async (opId) => workspace?.engine?.discard(opId),
    conflictResolved: async (conflictId, rowVersion) => workspace?.engine?.conflictResolved(conflictId, rowVersion),
    conflictClosed: async (conflictId) => {
      const engine = workspace?.engine;
      if (!engine) return;
      await engine.reconcileConflict(conflictId);
      engine.requestSync('manual');
    },
    reload: () => setReloadKey((k) => k + 1),
    requestSignOut: async () => {
      // Review M3: the live count, not the last rendered one (a save may have landed since).
      let remaining = 0;
      try {
        remaining = workspace ? await workspace.outbox.unsyncedCount() : 0;
      } catch {
        // The queue cannot be read: warn rather than risk losing changes.
        remaining = workspace ? Math.max(unsynced, 1) : 0;
      }
      if (remaining === 0) {
        await signOutNow();
        return;
      }
      setSignOutSheet({ variant: locked ? 'revoked' : state.kind === 'expired' ? 'expired' : 'normal' });
    },
    signOutSheet,
    closeSignOutSheet: () => setSignOutSheet(null),
    signOutNow,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
