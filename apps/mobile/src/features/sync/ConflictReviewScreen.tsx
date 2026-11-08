// Conflict Review (UI spec §3; F12-AC11, AC12, AC13, AC17; FR-SYNC-008). Both versions side by side in plain
// language; the person explicitly keeps the phone version, the server version, or picks per item (coupled groups
// as one unit). The choice is applied online by the server as a new, audited change (plan Q6). Nothing is
// overwritten silently; missing values read "Not recorded", never 0.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, PixelRatio } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ConflictDetail, FieldPick, ResolveConflictRequest } from '@hifz/contracts';
import { ApiFailure } from '../../api/client.ts';
import { AppScreen, AppText, Button, Card, Notice } from '../../components/ui.tsx';
import { ConfirmSheet } from '../../components/sync.tsx';
import { isolate } from '../../i18n/direction.ts';
import { useLocale } from '../../i18n/LocaleContext.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';
import { Skeleton } from './SyncQueueScreen.tsx';

type Choice = 'KEEP_DEVICE' | 'KEEP_SERVER' | 'MERGE';

interface Group {
  id: string;
  title: string | null;
  fields: string[];
  coupled: boolean;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ConflictDetail }
  | { kind: 'notAvailable' }
  | { kind: 'error'; code: string };

export function ConflictReviewScreen({ conflictId, onDone }: { conflictId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [choice, setChoice] = useState<Choice | null>(null);
  const [picks, setPicks] = useState<Record<string, FieldPick>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'error' | 'info' | 'success'; code: string } | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoad({ kind: 'loading' });
    setResult(null);
    try {
      const detail = await sync.conflicts.getConflict(conflictId);
      setLoad({ kind: 'ready', detail });
      if (detail.status === 'RESOLVED') {
        // Resolved elsewhere (review H2): the phone's item is settled from the server's word, nothing is applied here.
        setResult({ tone: 'info', code: 'errors.CONFLICT_CLOSED' });
        void sync.conflictClosed(conflictId).catch(() => undefined);
      }
    } catch (err) {
      // F12-AC17: another Teacher (or a conflict that is gone) gets 404, and no data is shown. The phone's own item
      // for it, if any, becomes failed NOT_FOUND (Q8).
      if (err instanceof ApiFailure && err.status === 404) {
        setLoad({ kind: 'notAvailable' });
        void sync.conflictClosed(conflictId).catch(() => undefined);
      }
      else setLoad({ kind: 'error', code: err instanceof ApiFailure ? err.code : 'INTERNAL' });
    }
    // sync.conflicts wraps the stable session.
  }, [conflictId]);

  useEffect(() => {
    if (sync.online) void fetchDetail();
  }, [sync.online, fetchDetail]);

  const handler = load.kind === 'ready' ? sync.registry.get(load.detail.entity) : undefined;
  const fieldLabel = (field: string) => {
    const key = handler?.fieldLabelKey?.(field);
    return key ? t(key) : field;
  };
  const format = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return t('conflict.notRecorded');
    const own = handler?.formatValue?.(field, value);
    if (own !== undefined) return own === null ? t('conflict.notRecorded') : isolate(own);
    return isolate(typeof value === 'string' ? value : JSON.stringify(value));
  };

  const groups: Group[] = [];
  if (load.kind === 'ready') {
    const seen = new Set<string>();
    for (const diff of load.detail.fieldDiff) {
      if (seen.has(diff.field)) continue;
      const members = (diff.group ?? [diff.field]).filter((f) => load.detail.fieldDiff.some((d) => d.field === f));
      members.forEach((m) => seen.add(m));
      const declared = handler?.fieldGroups?.find((g) => g.fields.includes(diff.field));
      groups.push({ id: declared?.id ?? members.join('+'), title: declared ? t(declared.labelKey) : null, fields: members, coupled: members.length > 1 });
    }
  }
  const pickedGroups = groups.filter((g) => picks[g.id] !== undefined).length;
  const mergeComplete = choice !== 'MERGE' || pickedGroups === groups.length;

  const apply = async () => {
    if (load.kind !== 'ready' || !choice) return;
    setConfirming(false);
    setBusy(true);
    setResult(null);
    const request: ResolveConflictRequest =
      choice === 'MERGE'
        ? { choice, picks: Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f, picks[g.id]!]))) }
        : { choice };
    try {
      const { rowVersion } = await sync.conflicts.resolveConflict(conflictId, request);
      await sync.conflictResolved(conflictId, rowVersion);
      setResult({ tone: 'success', code: 'conflict.resolved' });
    } catch (err) {
      const code = err instanceof ApiFailure ? err.code : 'INTERNAL';
      if (err instanceof ApiFailure && err.status === 404) setLoad({ kind: 'notAvailable' });
      else if (code === 'CONFLICT_CLOSED') {
        // Resolved by someone else meanwhile (review H2): settle the phone's item from the server's state.
        setResult({ tone: 'info', code: 'errors.CONFLICT_CLOSED' });
        void sync.conflictClosed(conflictId).catch(() => undefined);
      }
      else setResult({ tone: 'error', code: `errors.${code}` });
    } finally {
      setBusy(false);
    }
  };

  if (!sync.online && load.kind !== 'ready') {
    return (
      <AppScreen testID="conflict.screen">
        <Notice tone="info" testID="conflict.offline">
          {t('conflict.offline')}
        </Notice>
      </AppScreen>
    );
  }
  if (load.kind === 'loading') {
    return (
      <AppScreen testID="conflict.screen">
        <Skeleton count={2} />
      </AppScreen>
    );
  }
  if (load.kind === 'notAvailable') {
    return (
      <AppScreen testID="conflict.screen">
        <Notice tone="error" testID="conflict.error">
          {t('conflict.notAvailable')}
        </Notice>
        <Button variant="secondary" label={t('common.back')} onPress={onDone} />
      </AppScreen>
    );
  }
  if (load.kind === 'error') {
    return (
      <AppScreen testID="conflict.screen">
        <Notice tone="error" testID="conflict.error">
          {t(`errors.${load.code}`, { defaultValue: t('conflict.loadError') })}
        </Notice>
        <Button variant="secondary" label={t('common.retry')} onPress={() => void fetchDetail()} />
      </AppScreen>
    );
  }

  const detail = load.detail;
  const label = isolate(handler?.label(detail.device) ?? handler?.label(detail.server) ?? t(`sync.entity.${detail.entity}`, { defaultValue: t('sync.entity.unknown') }));
  const resolved = result?.tone === 'success';
  const closed = result?.code === 'errors.CONFLICT_CLOSED';

  return (
    <AppScreen testID="conflict.screen">
      <Notice tone="info" testID="conflict.intro">
        {t('conflict.intro', { label })}
      </Notice>
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          detail={detail}
          fieldLabel={fieldLabel}
          format={format}
          merge={choice === 'MERGE'}
          pick={picks[group.id]}
          onPick={(p) => setPicks((prev) => ({ ...prev, [group.id]: p }))}
        />
      ))}
      <AppText color={colors.textSecondary}>{t('conflict.otherFields')}</AppText>

      {resolved || closed ? null : (
        <Card>
          <AppText role="cardTitle" accessibilityRole="header">
            {t('conflict.choiceTitle')}
          </AppText>
          <View accessibilityRole="radiogroup" style={{ gap: space[2] }}>
            {(['KEEP_DEVICE', 'KEEP_SERVER', 'MERGE'] as const).map((c) => (
              <Pressable
                key={c}
                testID={`conflict.choice.${c}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: choice === c }}
                onPress={() => setChoice(c)}
                style={[styles.option, choice === c ? { backgroundColor: colors.surfaceSelected, borderColor: colors.brandPrimary } : null]}
              >
                <AppText>{`${choice === c ? '●' : '○'} ${t(`conflict.${c}`)}`}</AppText>
              </Pressable>
            ))}
          </View>
          {choice === 'MERGE' ? (
            <AppText role="helper" color={colors.textSecondary}>
              {t('conflict.mergeProgress', { done: pickedGroups, total: groups.length })}
            </AppText>
          ) : null}
          {!mergeComplete ? (
            <AppText role="helper" color={colors.textSecondary}>
              {t('conflict.mergeIncomplete')}
            </AppText>
          ) : null}
        </Card>
      )}

      {!sync.online ? <Notice tone="info">{t('conflict.offline')}</Notice> : null}
      {result ? (
        <Notice tone={result.tone} testID={result.tone === 'success' ? 'conflict.resolved' : 'conflict.error'}>
          {t(result.code)}
        </Notice>
      ) : null}
      {result?.code === 'errors.CONFLICT_STALE' ? (
        <Button
          testID="conflict.reload"
          variant="secondary"
          label={t('conflict.reload')}
          onPress={() => {
            setChoice(null);
            setPicks({});
            void fetchDetail();
          }}
        />
      ) : null}
      {resolved || closed ? (
        <Button variant="secondary" label={t('common.back')} onPress={onDone} />
      ) : (
        <Button
          testID="conflict.apply"
          label={t('conflict.apply')}
          busyLabel={t('conflict.applying')}
          busy={busy}
          disabled={!choice || !mergeComplete || !sync.online}
          onPress={() => setConfirming(true)}
        />
      )}

      <ConfirmSheet visible={confirming} title={t('conflict.confirmTitle')} onCancel={() => setConfirming(false)}>
        <AppText>{t('conflict.confirmBody')}</AppText>
        {groups.map((group) => {
          const side = choice === 'MERGE' ? picks[group.id] : choice === 'KEEP_DEVICE' ? 'DEVICE' : 'SERVER';
          const values = side === 'DEVICE' ? detail.device : detail.server;
          return (
            <AppText key={group.id} role="helper" color={colors.textSecondary}>
              {`${side === 'DEVICE' ? t('conflict.device') : t('conflict.server')}: ${group.fields
                .map((f) => t('conflict.fieldValue', { field: fieldLabel(f), value: format(f, values[f]) }))
                .join(t('common.listSeparator'))}`}
            </AppText>
          );
        })}
        <Button testID="conflict.confirm" label={t('conflict.confirm')} onPress={() => void apply()} />
        <Button variant="secondary" label={t('common.cancel')} onPress={() => setConfirming(false)} />
      </ConfirmSheet>
    </AppScreen>
  );
}

function GroupCard({ group, detail, fieldLabel, format, merge, pick, onPick }: {
  group: Group;
  detail: ConflictDetail;
  fieldLabel: (field: string) => string;
  format: (field: string, value: unknown) => string;
  merge: boolean;
  pick: FieldPick | undefined;
  onPick: (pick: FieldPick) => void;
}) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const { width } = useWindowDimensions();
  // Stack the two versions on narrow screens or large text (UI spec §3).
  const stacked = width < 360 || PixelRatio.getFontScale() >= 1.3;
  const column = (side: 'DEVICE' | 'SERVER') => {
    const values = side === 'DEVICE' ? detail.device : detail.server;
    return (
      <View testID={`conflict.group.${group.id}.${side === 'DEVICE' ? 'device' : 'server'}`} style={[styles.column, stacked ? null : { flex: 1 }]}>
        <AppText role="helper" color={colors.textSecondary} style={{ fontWeight: '600' }}>
          {side === 'DEVICE' ? t('conflict.device') : t('conflict.server')}
        </AppText>
        {group.fields.map((f) => (
          <AppText key={f} style={{ fontWeight: '600' }}>
            {t('conflict.fieldValue', { field: fieldLabel(f), value: format(f, values[f]) })}
          </AppText>
        ))}
      </View>
    );
  };
  return (
    <Card>
      <View testID={`conflict.group.${group.id}`} style={{ gap: space[2] }}>
        {group.title ? <AppText role="cardTitle">{group.title}</AppText> : null}
        {group.coupled ? (
          <AppText role="helper" color={colors.textSecondary}>
            {t('conflict.groupTogether')}
          </AppText>
        ) : null}
        {/* The phone version is at the start in every direction. */}
        <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space[3], direction }}>
          {column('DEVICE')}
          {column('SERVER')}
        </View>
        {merge ? (
          <View style={{ flexDirection: 'row', gap: space[2] }} accessibilityRole="radiogroup">
            {(['DEVICE', 'SERVER'] as const).map((p) => (
              <Pressable
                key={p}
                testID={`conflict.group.${group.id}.pick.${p}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: pick === p }}
                onPress={() => onPick(p)}
                style={[styles.segment, pick === p ? { backgroundColor: colors.surfaceSelected, borderColor: colors.brandPrimary } : null]}
              >
                <AppText>{`${pick === p ? '●' : '○'} ${p === 'DEVICE' ? t('conflict.pickDevice') : t('conflict.pickServer')}`}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[1], padding: space[3], borderWidth: 1, borderColor: colors.border, borderRadius: radius.input },
  option: {
    minHeight: touch.preferred,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
  },
  segment: {
    flex: 1,
    minHeight: touch.preferred,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
});
