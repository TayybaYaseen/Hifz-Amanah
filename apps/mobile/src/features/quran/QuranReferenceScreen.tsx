// More → Quran references on this device (F06; US-025; ADR-018 §4.3; FR-SAB-008, FR-SAB-014; plan P3, P4).
//
// The status of the cached snapshot (version, last download, update available, revoked, unavailable, errors) and the
// reusable Surah/Ayat range fields, checked offline against that snapshot. F05's Daily Entry does not exist yet in
// this app, so this screen is the isolated F06 host of the range fields (plan P4); Daily Entry will reuse
// `RangeFields` and `checkRange` unchanged. Nothing here saves a record.
//
// Status is always icon + text (design.md §11). Surah names are shown exactly as stored (BR-15).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppScreen, AppText, Button, Card, Field, Notice, QuranText, isolate } from '../../components/ui.tsx';
import { SyncStateIcon, useFormatDateTime } from '../../components/sync.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { useQuranReference } from './QuranReferenceContext.tsx';
import { checkRange, totalLinesSource, type RangeDraft } from './rangeCheck.ts';
import { shortVersion, type ReferenceViewKind } from './referenceView.ts';

const ICON: Record<ReferenceViewKind, Parameters<typeof SyncStateIcon>[0]['kind']> = {
  INITIAL_PENDING: 'PENDING',
  DOWNLOADING: 'SYNCING',
  SYNCED: 'SYNCED',
  OFFLINE_CACHED: 'OFFLINE',
  UPDATE_AVAILABLE: 'PENDING',
  FAILED: 'FAILED',
  CHECKSUM_MISMATCH: 'FAILED',
  UNSUPPORTED_FORMAT: 'UPGRADE_REQUIRED',
  REVOKED: 'ACCESS_REVOKED',
  NO_DATA: 'NOTHING',
};

export function QuranReferenceScreen() {
  const { t } = useTranslation();
  const ref = useQuranReference();
  const format = useFormatDateTime();
  const view = ref.view;
  const [refreshing, setRefreshing] = useState(false);

  return (
    <AppScreen title={t('quranRef.title')} testID="quranRef.screen">
      <Card>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
          <SyncStateIcon kind={ICON[view.kind]} spinning={view.kind === 'DOWNLOADING'} />
          <View style={{ flex: 1 }}>
            <AppText testID={`quranRef.status.${view.kind}`}>{t(`quranRef.status.${view.kind}`)}</AppText>
          </View>
        </View>
        <AppText role="helper" color={colors.textSecondary} testID="quranRef.usingCache">
          {view.usingCache ? t('quranRef.usingSaved') : t('quranRef.noneSaved')}
        </AppText>
        {view.version ? (
          <AppText role="helper" color={colors.textSecondary} testID="quranRef.version" latin>
            {t('quranRef.version', { version: isolate(shortVersion(view.version)!) })}
          </AppText>
        ) : null}
        <AppText role="helper" color={colors.textSecondary} testID="quranRef.lastSynced">
          {view.lastSyncedAt ? t('quranRef.lastSynced', { time: format(view.lastSyncedAt) }) : t('quranRef.neverSynced')}
        </AppText>
        {view.usingCache ? (
          <AppText role="helper" color={colors.textSecondary} testID={`quranRef.layout.${view.layout}`}>
            {`${view.layout === 'AVAILABLE' ? '✓' : 'ℹ'} ${t(`quranRef.layout.${view.layout}`)}`}
            {view.layout === 'AVAILABLE' ? ` ${view.layoutVerified ? t('quranRef.layoutVerified') : t('quranRef.layoutNotVerified')}` : ''}
          </AppText>
        ) : null}
        {view.checking && view.kind !== 'DOWNLOADING' ? (
          <AppText role="helper" color={colors.textSecondary} testID="quranRef.checking">{t('quranRef.checking')}</AppText>
        ) : null}
        <Button
          testID="quranRef.refresh"
          variant="secondary"
          label={t('quranRef.refresh')}
          busy={refreshing || view.checking}
          busyLabel={t('quranRef.checking')}
          disabled={!ref.enabled}
          onPress={() => {
            setRefreshing(true);
            void ref.refresh().finally(() => setRefreshing(false));
          }}
        />
      </Card>
      {view.revokedNotice ? (
        <Notice tone="info" testID="quranRef.revokedNotice">
          {t('quranRef.revokedNotice', { time: format(view.revokedAt) })}
        </Notice>
      ) : null}
      <RangeFields />
      {ref.index?.attribution.length ? (
        <Card>
          <AppText role="cardTitle">{t('quranRef.attribution')}</AppText>
          {ref.index.attribution.map((a, i) => (
            <AppText key={i} role="helper" color={colors.textSecondary}>{a}</AppText>
          ))}
        </Card>
      ) : null}
    </AppScreen>
  );
}

/**
 * The Surah/Ayat range fields with the offline check and the Total Lines pre-fill (design.md §4.7, §5.3). Reusable:
 * F05 Daily Entry hosts them for Sabaq once it exists. Total Lines can always be typed by hand (FR-SAB-008).
 */
export function RangeFields({ testIDPrefix = 'range' }: { testIDPrefix?: string }) {
  const { t } = useTranslation();
  const { index } = useQuranReference();
  const [draft, setDraft] = useState<RangeDraft>({ surah: '', ayahStart: '', ayahEnd: '' });
  const [totalLines, setTotalLines] = useState('');
  const [touchedLines, setTouchedLines] = useState(false);
  const result = checkRange(draft, index);
  const prefilled = result.state === 'CHECKED' && result.evaluation.issues.length === 0 ? result.evaluation.totalLines : null;
  // Until the Teacher types a value, the field shows the layout's count (never a guess when there is none).
  const shownLines = touchedLines ? totalLines : prefilled === null ? totalLines : String(prefilled);
  const source = totalLinesSource(prefilled, shownLines);
  const fieldError = (field: string): string | null => {
    const e = result.fieldErrors[field];
    if (!e) return null;
    if (e.code === 'NOT_WHOLE') return t('quran.form.wholeNumber');
    if (e.code === 'OUT_OF_RANGE' && e.max !== undefined) return t('fields.OUT_OF_RANGE_MAX', { max: e.max });
    return t(`fields.${e.code}`, { defaultValue: t('fields.INVALID') });
  };
  const set = (key: keyof RangeDraft) => (text: string) => {
    setDraft((d) => ({ ...d, [key]: text }));
    if (!touchedLines) setTotalLines('');
  };
  const surahNumber = Number(draft.surah);
  const name = index?.surahNames.get(surahNumber);

  return (
    <Card>
      <AppText role="cardTitle">{t('quranRef.range.title')}</AppText>
      <AppText role="helper" color={colors.textSecondary}>{t('quranRef.range.help')}</AppText>
      <Field testID={`${testIDPrefix}.surah`} label={t('quranRef.range.surah')} value={draft.surah} onChangeText={set('surah')} keyboardType="number-pad" inputMode="numeric" maxLength={3} error={fieldError('surah')} />
      {name ? <QuranText testID={`${testIDPrefix}.surahName`}>{name.nameAr}</QuranText> : null}
      <Field testID={`${testIDPrefix}.ayahStart`} label={t('quranRef.range.ayahStart')} value={draft.ayahStart} onChangeText={set('ayahStart')} keyboardType="number-pad" inputMode="numeric" maxLength={4} error={fieldError('ayahStart')} />
      <Field testID={`${testIDPrefix}.ayahEnd`} label={t('quranRef.range.ayahEnd')} value={draft.ayahEnd} onChangeText={set('ayahEnd')} keyboardType="number-pad" inputMode="numeric" maxLength={4} error={fieldError('ayahEnd') ?? fieldError('range')} />
      {result.state === 'UNCHECKED' ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${testIDPrefix}.unchecked`}>{`ℹ ${t('quranRef.range.unchecked')}`}</AppText>
      ) : null}
      {result.state === 'CHECKED' && result.evaluation.issues.length === 0 ? (
        <>
          <AppText testID={`${testIDPrefix}.valid`}>{`✓ ${t('quranRef.range.valid')}`}</AppText>
          <AppText testID={`${testIDPrefix}.para`}>
            {result.evaluation.para === null ? t('quranRef.range.paraUnknown') : t('quranRef.range.para', { para: isolate(String(result.evaluation.para)) })}
          </AppText>
        </>
      ) : null}
      <Field
        testID={`${testIDPrefix}.totalLines`}
        label={t('quranRef.range.totalLines')}
        value={shownLines}
        onChangeText={(text) => {
          setTouchedLines(true);
          setTotalLines(text);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        helper={prefilled !== null ? t('quranRef.range.prefilled') : t('quranRef.range.manual')}
      />
      {source ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${testIDPrefix}.linesSource.${source}`}>{t(`quranRef.range.source.${source}`)}</AppText>
      ) : null}
    </Card>
  );
}
