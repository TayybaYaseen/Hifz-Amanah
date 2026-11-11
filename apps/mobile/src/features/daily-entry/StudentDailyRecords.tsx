// F05 · "Daily records" on the student profile (UI spec §1.2): newest first, the device's records (including unsynced
// ones) merged with the server's list for the last 62 days when online. Each row opens the record detail.
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { DailyRecordListResponse } from '@hifz/contracts';
import { DAILY_RECORD_RANGE_MAX_DAYS } from '@hifz/contracts';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { useSession } from '../../auth/SessionContext.tsx';
import { SyncStateIcon } from '../../components/sync.tsx';
import { AppText, Card, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { rowStyle } from '../roster/Chip.tsx';
import { recordsForStudent, type RecordListRow } from './local.ts';

export function StudentDailyRecords({ studentId, onOpen }: { studentId: string; onOpen: (recordId: string) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const [rows, setRows] = useState<RecordListRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!sync.db) return undefined;
      const db = sync.db;
      let live = true;
      void (async () => {
        const local = await recordsForStudent(db, studentId);
        if (live) setRows(local);
        try {
          const to = calendarDateIn(new Date(), sync.meta?.orgTimeZone ?? 'Asia/Karachi');
          const from = addDays(to, -(DAILY_RECORD_RANGE_MAX_DAYS - 1));
          const res = await session.authorized<DailyRecordListResponse>(`/hifz/daily-records?studentId=${studentId}&from=${from}&to=${to}`);
          const merged = new Map(local.map((r) => [r.id, r]));
          for (const r of res.items) {
            if (!merged.has(r.id)) merged.set(r.id, { id: r.id, reportDate: r.reportDate, sessionLabel: r.sessionLabel, portionCount: r.portionCount, rowVersion: r.rowVersion });
          }
          const list = [...merged.values()].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || (a.sessionLabel ?? '').localeCompare(b.sessionLabel ?? ''));
          if (live) setRows(list);
        } catch {
          // Offline: the device's records only.
        }
      })();
      return () => {
        live = false;
      };
    }, [session, studentId, sync.db, sync.meta?.orgTimeZone]),
  );

  return (
    <Card>
      <AppText role="cardTitle">{t('students.dailyRecords')}</AppText>
      {rows === null ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {rows?.length === 0 ? <AppText color={colors.textSecondary} testID="studentProfile.noDailyRecords">{t('students.noDailyRecords')}</AppText> : null}
      {rows?.map((r) => (
        <Pressable
          key={r.id}
          testID={r.sessionLabel ? `studentProfile.record.${r.reportDate}.${r.sessionLabel}` : `studentProfile.record.${r.reportDate}`}
          accessibilityRole="button"
          onPress={() => onOpen(r.id)}
          style={rowStyle.card}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <SyncStateIcon kind={r.rowVersion === null ? 'PENDING' : 'SYNCED'} />
            <AppText style={{ flex: 1 }}>
              {r.sessionLabel
                ? t('students.dailyRecordRowSession', { date: isolate(r.reportDate), session: isolate(r.sessionLabel), count: isolate(String(r.portionCount)) })
                : t('students.dailyRecordRow', { date: isolate(r.reportDate), count: isolate(String(r.portionCount)) })}
            </AppText>
          </View>
          <AppText role="helper" color={colors.textSecondary}>{t(r.rowVersion === null ? 'sync.state.PENDING' : 'sync.state.SYNCED')}</AppText>
        </Pressable>
      ))}
    </Card>
  );
}
