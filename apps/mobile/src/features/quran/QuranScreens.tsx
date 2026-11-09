// Settings → Quran metadata (US-024…026; F06-AC1…AC4, AC6, AC19; design.md §13 US-024, a design gap built from cards
// and FormField). Online only: edits need the network. Owner/Admin add and edit Surahs and Para boundaries and see
// the review list; a Teacher sees the same data read-only with no edit controls (F06-AC2). The server decides every
// permission; `canEdit` only hides controls it would refuse.
//
// No Quran data ships yet (SRS §17.3, DEC-B31): until an approved seed is loaded the lists are empty and say so.
// Surah names are shown exactly as stored, in the Quranic font, never transliterated (BR-15, F06-AC3).
import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type {
  EditionsResponse,
  ParaListResponse,
  ParaView,
  ReviewResponse,
  SaveParaResponse,
  SaveSurahResponse,
  SurahListResponse,
  SurahView,
} from '@hifz/contracts';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys, fieldLimits } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice, QuranText, isolate } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';
import { Chip, ChipRow, rowStyle } from '../roster/Chip.tsx';
import { checkPara, checkSurah, findingMessage, paraFieldOf, refText, type Message } from './quran.ts';

type Tab = 'SURAHS' | 'PARAS';

interface Data {
  editions: EditionsResponse;
  surahs: SurahView[];
  paras: ParaView[];
}

/** API field errors as form messages, naming a limit when the server gives one (F06-AC6). */
function apiFieldErrors(err: unknown, mapField: (field: string, issue: string) => string = (f) => f): { form: string | null; fields: Record<string, Message> } {
  const keys = errorKeys(err);
  const limits = fieldLimits(err);
  const raw = err instanceof ApiFailure ? err.fields : {};
  const fields: Record<string, Message> = {};
  for (const [field, key] of Object.entries(keys.fields)) {
    fields[mapField(field, raw[field] ?? '')] = { key, values: limits[field] };
  }
  return { form: keys.form, fields };
}

export function QuranMetadataScreen({ canEdit, onAddSurah, onEditSurah, onAddPara, onEditPara, onReview }: {
  canEdit: boolean;
  onAddSurah: () => void;
  onEditSurah: (surah: SurahView) => void;
  onAddPara: (surahs: SurahView[]) => void;
  onEditPara: (para: ParaView, surahs: SurahView[]) => void;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('SURAHS');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [editions, surahs, paras] = await Promise.all([
        session.authorized<EditionsResponse>('/quran/editions'),
        session.authorized<SurahListResponse>('/quran/surahs'),
        session.authorized<ParaListResponse>('/quran/paras'),
      ]);
      setData({ editions, surahs: surahs.items, paras: paras.items });
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const nameOf = (n: number) => data?.surahs.find((s) => s.number === n);
  const edition = data?.editions.editions.find((e) => e.code === data.editions.active);

  return (
    <AppScreen title={t('quran.title')} testID="quran.screen">
      {error ? (
        <>
          <Notice tone="error" testID="quran.error">{error}</Notice>
          <Button testID="quran.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {data === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {data && edition ? (
        <Card>
          <AppText role="cardTitle" testID="quran.edition">{t('quran.edition.name', { lines: edition.linesPerPage })}</AppText>
          <AppText role="helper" color={colors.textSecondary} testID="quran.edition.verification">
            {edition.verification === 'VERIFIED' ? `✓ ${t('quran.edition.verified')}` : `ℹ ${t('quran.edition.unverified')}`}
          </AppText>
          <AppText role="helper" color={colors.textSecondary} testID="quran.edition.layout">
            {/* DEC-B78/B79: "verified" only after a signed production review; a withdrawn layout is never shown as approved. */}
            {edition.layoutWithdrawn
              ? `⚠ ${t('quran.edition.layoutWithdrawn')}`
              : edition.layoutVerified
                ? `✓ ${t('quran.edition.layoutVerified')}`
                : edition.hasLayout
                  ? `ℹ ${t('quran.edition.layoutLoaded')}`
                  : `ℹ ${t('quran.edition.noLayout')}`}
          </AppText>
        </Card>
      ) : null}
      {data && canEdit ? <Button testID="quran.review" variant="secondary" label={t('quran.review.open')} onPress={onReview} /> : null}
      {data ? (
        <ChipRow label={t('quran.title')}>
          <Chip testID="quran.tab.surahs" label={t('quran.surahs', { count: data.surahs.length })} selected={tab === 'SURAHS'} onPress={() => setTab('SURAHS')} />
          <Chip testID="quran.tab.paras" label={t('quran.paras', { count: data.paras.length })} selected={tab === 'PARAS'} onPress={() => setTab('PARAS')} />
        </ChipRow>
      ) : null}
      {data && tab === 'SURAHS' ? (
        <>
          {canEdit ? <Button testID="quran.addSurah" label={t('quran.addSurah')} onPress={onAddSurah} /> : null}
          {data.surahs.length === 0 ? <EmptyState canEdit={canEdit} testID="quran.surahs.empty" /> : null}
          {data.surahs.map((s) => (
            <Pressable
              key={s.id}
              testID={`quran.surah.${s.number}`}
              accessibilityRole={canEdit ? 'button' : 'text'}
              disabled={!canEdit}
              onPress={() => onEditSurah(s)}
              style={rowStyle.card}
            >
              <AppText role="cardTitle">{t('quran.surahNumber', { number: s.number })}</AppText>
              <QuranText role="sectionTitle" testID={`quran.surah.${s.number}.nameAr`}>{s.nameAr}</QuranText>
              <AppText latin>{s.nameTranslit}</AppText>
              <AppText role="helper" color={colors.textSecondary}>
                {`${t('quran.ayahCount', { count: s.ayahCount })} · ${s.source === 'ADMIN' ? `✎ ${t('quran.source.ADMIN')}` : t('quran.source.SEED')}`}
              </AppText>
            </Pressable>
          ))}
        </>
      ) : null}
      {data && tab === 'PARAS' ? (
        <>
          {canEdit ? <Button testID="quran.addPara" label={t('quran.addPara')} onPress={() => onAddPara(data.surahs)} /> : null}
          {data.paras.length === 0 ? <EmptyState canEdit={canEdit} testID="quran.paras.empty" /> : null}
          {data.paras.map((p) => {
            const start = nameOf(p.start.surah);
            const end = nameOf(p.end.surah);
            return (
              <Pressable
                key={p.id}
                testID={`quran.para.${p.number}`}
                accessibilityRole={canEdit ? 'button' : 'text'}
                disabled={!canEdit}
                onPress={() => onEditPara(p, data.surahs)}
                style={rowStyle.card}
              >
                <AppText role="cardTitle">{t('quran.paraNumber', { number: p.number })}</AppText>
                <AppText>{t('quran.paraRange', { start: isolate(refText(p.start)), end: isolate(refText(p.end)) })}</AppText>
                {start || end ? (
                  <AppText role="helper" color={colors.textSecondary} latin>
                    {`${start?.nameTranslit ?? p.start.surah} → ${end?.nameTranslit ?? p.end.surah}`}
                  </AppText>
                ) : null}
                <AppText role="helper" color={colors.textSecondary}>
                  {p.source === 'ADMIN' ? `✎ ${t('quran.source.ADMIN')}` : t('quran.source.SEED')}
                </AppText>
              </Pressable>
            );
          })}
        </>
      ) : null}
      {data && !canEdit ? (
        <AppText role="helper" color={colors.textSecondary} testID="quran.readOnly">{t('quran.readOnly')}</AppText>
      ) : null}
    </AppScreen>
  );
}

function EmptyState({ canEdit, testID }: { canEdit: boolean; testID: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <AppText role="cardTitle" testID={testID}>{t('quran.empty')}</AppText>
      <AppText color={colors.textSecondary}>{canEdit ? t('quran.emptyAdmin') : t('quran.emptyTeacher')}</AppText>
    </Card>
  );
}

function ReviewNotice({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return <Notice tone="info" testID="quran.reviewNeeded">{t('quran.reviewNeeded', { count })}</Notice>;
}

/** Add or edit a Surah (F06-AC1, AC3). The number is fixed once saved. */
export function SurahFormScreen({ surah, onSaved }: { surah: SurahView | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [number, setNumber] = useState(surah ? String(surah.number) : '');
  const [nameAr, setNameAr] = useState(surah?.nameAr ?? '');
  const [nameTranslit, setNameTranslit] = useState(surah?.nameTranslit ?? '');
  const [ayahCount, setAyahCount] = useState(surah ? String(surah.ayahCount) : '');
  const [errors, setErrors] = useState<Record<string, Message>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const msg = (field: string) => (errors[field] ? t(errors[field].key, errors[field].values) : null);

  const save = async () => {
    setFormError(null);
    const { request, errors: found } = checkSurah({ number, nameAr, nameTranslit, ayahCount }, surah);
    setErrors(found);
    if (!request) return;
    setBusy(true);
    try {
      const res = await session.authorized<SaveSurahResponse>(`/quran/surahs/${request.number}`, { method: 'PUT', body: request.body });
      // F06-AC19: records keep their ranges; any that no longer fit are listed for review.
      if (res.recordsNeedingReview > 0) setReviewCount(res.recordsNeedingReview);
      else onSaved();
    } catch (err) {
      // Everything typed is kept after an error (design.md §5.2).
      const mapped = apiFieldErrors(err);
      setErrors(mapped.fields);
      setFormError(mapped.form ? t(mapped.form) : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={surah ? t('quran.editSurah') : t('quran.addSurah')} testID="surahForm.screen">
      {formError ? <Notice tone="error" testID="surahForm.error">{formError}</Notice> : null}
      <ReviewNotice count={reviewCount} />
      {reviewCount > 0 ? <Button testID="surahForm.done" label={t('common.continue')} onPress={onSaved} /> : null}
      <Field
        testID="surahForm.number"
        label={t('quran.form.surahNumber')}
        helper={t('quran.form.surahNumberHelp')}
        value={number}
        onChangeText={setNumber}
        error={msg('number')}
        keyboardType="number-pad"
        maxLength={3}
        editable={!surah}
      />
      <Field testID="surahForm.nameAr" label={t('quran.form.nameAr')} helper={t('quran.form.nameArHelp')} value={nameAr} onChangeText={setNameAr} error={msg('nameAr')} maxLength={100} />
      {nameAr.trim() ? <QuranText role="sectionTitle" testID="surahForm.nameAr.preview">{nameAr}</QuranText> : null}
      <Field testID="surahForm.nameTranslit" label={t('quran.form.nameTranslit')} value={nameTranslit} onChangeText={setNameTranslit} error={msg('nameTranslit')} maxLength={100} />
      <Field testID="surahForm.ayahCount" label={t('quran.form.ayahCount')} value={ayahCount} onChangeText={setAyahCount} error={msg('ayahCount')} keyboardType="number-pad" maxLength={3} />
      {reviewCount === 0 ? <Button testID="surahForm.save" label={t('common.save')} busyLabel={t('common.saving')} busy={busy} onPress={() => void save()} /> : null}
    </AppScreen>
  );
}

/** Add or correct a Para boundary (F06-AC1, AC4, AC19). */
export function ParaFormScreen({ para, surahs, onSaved }: { para: ParaView | null; surahs: SurahView[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [draft, setDraft] = useState({
    number: para ? String(para.number) : '',
    startSurah: para ? String(para.start.surah) : '',
    startAyah: para ? String(para.start.ayah) : '',
    endSurah: para ? String(para.end.surah) : '',
    endAyah: para ? String(para.end.ayah) : '',
  });
  const [errors, setErrors] = useState<Record<string, Message>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const msg = (field: string) => (errors[field] ? t(errors[field].key, errors[field].values) : null);
  const set = (key: keyof typeof draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const surahHelp = (value: string) => {
    const s = surahs.find((x) => String(x.number) === value.trim());
    return s ? `${s.nameTranslit} · ${t('quran.ayahCount', { count: s.ayahCount })}` : undefined;
  };

  const save = async () => {
    setFormError(null);
    const { request, errors: found } = checkPara(draft, para, surahs);
    setErrors(found);
    if (!request) return;
    setBusy(true);
    try {
      const res = await session.authorized<SaveParaResponse>(`/quran/paras/${request.number}`, { method: 'PUT', body: request.body });
      if (res.recordsNeedingReview > 0) setReviewCount(res.recordsNeedingReview);
      else onSaved();
    } catch (err) {
      const mapped = apiFieldErrors(err, paraFieldOf);
      setErrors(mapped.fields);
      setFormError(mapped.form ? t(mapped.form) : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={para ? t('quran.editPara') : t('quran.addPara')} testID="paraForm.screen">
      {formError ? <Notice tone="error" testID="paraForm.error">{formError}</Notice> : null}
      {surahs.length === 0 ? <Notice tone="info" testID="paraForm.noSurahs">{t('quran.form.addSurahsFirst')}</Notice> : null}
      <ReviewNotice count={reviewCount} />
      {reviewCount > 0 ? <Button testID="paraForm.done" label={t('common.continue')} onPress={onSaved} /> : null}
      <Field testID="paraForm.number" label={t('quran.form.paraNumber')} helper={t('quran.form.paraNumberHelp')} value={draft.number} onChangeText={set('number')} error={msg('number')} keyboardType="number-pad" maxLength={2} editable={!para} />
      <AppText role="cardTitle">{t('quran.form.start')}</AppText>
      <Field testID="paraForm.startSurah" label={t('quran.form.surah')} helper={surahHelp(draft.startSurah)} value={draft.startSurah} onChangeText={set('startSurah')} error={msg('startSurah')} keyboardType="number-pad" maxLength={3} />
      <Field testID="paraForm.startAyah" label={t('quran.form.ayah')} value={draft.startAyah} onChangeText={set('startAyah')} error={msg('startAyah')} keyboardType="number-pad" maxLength={3} />
      <AppText role="cardTitle">{t('quran.form.end')}</AppText>
      <Field testID="paraForm.endSurah" label={t('quran.form.surah')} helper={surahHelp(draft.endSurah)} value={draft.endSurah} onChangeText={set('endSurah')} error={msg('endSurah')} keyboardType="number-pad" maxLength={3} />
      <Field testID="paraForm.endAyah" label={t('quran.form.ayah')} value={draft.endAyah} onChangeText={set('endAyah')} error={msg('endAyah')} keyboardType="number-pad" maxLength={3} />
      {reviewCount === 0 ? <Button testID="paraForm.save" label={t('common.save')} busyLabel={t('common.saving')} busy={busy} onPress={() => void save()} /> : null}
    </AppScreen>
  );
}

/** What an Admin should review: gaps in the metadata and records whose range no longer fits (F06-AC19). */
export function QuranReviewScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReview(await session.authorized<ReviewResponse>('/quran/review'));
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AppScreen title={t('quran.review.title')} testID="quranReview.screen">
      {error ? (
        <>
          <Notice tone="error" testID="quranReview.error">{error}</Notice>
          <Button testID="quranReview.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {review === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {review && review.findings.length === 0 && review.records.length === 0 ? (
        <Notice tone="success" testID="quranReview.clean">{t('quran.review.clean')}</Notice>
      ) : null}
      {review?.findings.map((f, i) => {
        const m = findingMessage(f);
        return (
          <Card key={`${f.code}-${i}`}>
            <AppText testID={`quranReview.finding.${f.code}`}>{`⚠ ${t(m.key, m.values)}`}</AppText>
          </Card>
        );
      })}
      {review && review.records.length > 0 ? (
        <>
          <AppText role="sectionTitle">{t('quran.review.records', { count: review.records.length })}</AppText>
          {review.records.map((r) => (
            <Card key={r.id}>
              <AppText testID={`quranReview.record.${r.id}`}>
                {t('quran.review.record', { range: isolate(`${r.range.surah}:${r.range.ayahStart}–${r.range.ayahEnd}`) })}
              </AppText>
            </Card>
          ))}
          <AppText role="helper" color={colors.textSecondary}>{t('quran.review.recordsKept')}</AppText>
        </>
      ) : null}
    </AppScreen>
  );
}
