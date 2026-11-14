// F06 · Quran reference data for screens (ADR-018 §4.2; FR-SAB-014; DEC-B75, DEC-B79; plan P3, P4).
//
// Runs only where F12 opened a live workspace database (signed-in Owner, Admin, or Teacher): Student and Parent have
// no workspace and never download reference data. It reads the F12 state through `useSync()` and changes nothing in
// F12: the outbox, the engine, and the sync protocol are untouched.
//
// Checks run in the background and never block sign-in, navigation, or entry: on start, on return to the
// foreground, when connectivity comes back, after each F12 sync cycle (timing only), once a day while the app runs,
// and on "Refresh". Lookups use the cached snapshot through packages/domain, so they work offline.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../../auth/SessionContext.tsx';
import { pinCrypto } from '../../sync/platform.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { clearCache, loadIndex, readCacheMeta, type CacheMeta } from './referenceCache.ts';
import { httpReferenceApi, ReferenceSync, type CheckOutcome } from './referenceSync.ts';
import { referenceView, type ReferenceView } from './referenceView.ts';

type Index = NonNullable<Awaited<ReturnType<typeof loadIndex>>>;

export interface QuranReferenceValue {
  /** False for Student/Parent and when no workspace is open: reference data is not available on this device. */
  enabled: boolean;
  view: ReferenceView;
  /** The cached rows for offline lookups, or null (no snapshot yet: Total Lines is entered by hand). */
  index: Index | null;
  lastOutcome: CheckOutcome | null;
  refresh(): Promise<void>;
}

const HOURLY_MS = 3_600_000;
const EMPTY_VIEW = referenceView({ meta: null, running: false, online: true, surahCount: 0 });

const QuranReferenceContext = createContext<QuranReferenceValue>({ enabled: false, view: EMPTY_VIEW, index: null, lastOutcome: null, refresh: async () => {} });

export function QuranReferenceProvider({ children }: { children: ReactNode }) {
  const sync = useSync();
  const { session } = useSession();
  const db = sync.db;
  const [meta, setMeta] = useState<CacheMeta | null>(null);
  const [index, setIndex] = useState<Index | null>(null);
  const [running, setRunning] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<CheckOutcome | null>(null);
  const syncRef = useRef<ReferenceSync | null>(null);

  const reload = useCallback(async () => {
    if (!db) return;
    try {
      setMeta(await readCacheMeta(db));
      setIndex(await loadIndex(db));
    } catch {
      // An unreadable cache shows as "no reference data"; the next check rebuilds it.
      setMeta(null);
      setIndex(null);
    }
  }, [db]);

  const reference = useMemo(() => {
    if (!db) return null;
    return new ReferenceSync({ db, api: httpReferenceApi(session), sha256: pinCrypto.sha256Hex, clock: () => Date.now() });
  }, [db, session]);
  syncRef.current = reference;

  const check = useCallback(
    async (trigger: Parameters<ReferenceSync['check']>[0]) => {
      const r = syncRef.current;
      if (!r) return;
      try {
        setLastOutcome(await r.check(trigger));
      } catch {
        setLastOutcome('FAILED');
      }
      await reload();
    },
    [reload],
  );

  useEffect(() => {
    if (!reference) {
      setMeta(null);
      setIndex(null);
      return undefined;
    }
    const unsubscribe = reference.subscribe(setRunning);
    void reload().then(() => check('START'));
    return unsubscribe;
  }, [reference, reload, check]);

  // Connectivity regained.
  const wasOnline = useRef(sync.online);
  useEffect(() => {
    if (sync.online && !wasOnline.current) void check('ONLINE');
    wasOnline.current = sync.online;
  }, [sync.online, check]);

  // After each F12 sync cycle ends (timing only; no protocol coupling).
  const wasRunning = useRef(sync.engine.running);
  useEffect(() => {
    if (wasRunning.current && !sync.engine.running) void check('AFTER_SYNC');
    wasRunning.current = sync.engine.running;
  }, [sync.engine.running, check]);

  // Foreground, and the daily check while the app runs. An old snapshot is never discarded for its age (P3).
  useEffect(() => {
    if (!reference) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check('FOREGROUND');
    });
    const timer = setInterval(() => {
      void reference.dailyDue().then((due) => (due ? check('DAILY') : undefined)).catch(() => undefined);
    }, HOURLY_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [reference, check]);

  // Membership revoked anywhere (F12 locks the workspace): the licensed reference data is deleted too (ADR-018 §4.5).
  // The driver serializes calls, so this runs before F12 closes the database.
  useEffect(() => {
    if (sync.locked && db) void clearCache(db, new Date().toISOString()).then(reload).catch(() => undefined);
  }, [sync.locked, db, reload]);

  const value: QuranReferenceValue = {
    enabled: db !== null && !sync.locked,
    view: referenceView({ meta, running, online: sync.online, surahCount: index?.surahs.length ?? 0 }),
    index: sync.locked ? null : index,
    lastOutcome,
    refresh: () => check('MANUAL'),
  };
  return <QuranReferenceContext.Provider value={value}>{children}</QuranReferenceContext.Provider>;
}

export function useQuranReference(): QuranReferenceValue {
  return useContext(QuranReferenceContext);
}
