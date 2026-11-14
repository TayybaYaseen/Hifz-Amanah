// F05 · One portion card of Daily Entry, and the performance block shared with Add attempt (design.md §4.7, §5.3,
// §5.4; UI spec §3; US-018, US-020…022; F05-AC3, AC5, AC10…AC14, AC20…AC22).
// The card shows what the form model computes; every rule is the domain's (form.ts → @hifz/domain). Status is always
// icon + text, quality is "{score} · {label}" with Western digits, and an error names its section and portion.
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MISTAKE_CATEGORIES, MISTAKE_NOTE_MAX, MISTAKE_SEVERITIES, PORTION_STATUSES, REMARKS_MAX } from '@hifz/domain/hifz';
import { QUALITY_SCORES } from '@hifz/domain/quality';
import type { ReferenceIndex } from '@hifz/domain/quran-ref';
import type { Quantity } from '@hifz/domain/quantity';
import { AppText, Button, Card, Field, QuranText, isolate } from '../../components/ui.tsx';
import { ConfirmSheet } from '../../components/sync.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import {
  PARA_CHOICES,
  UNIT_CHOICES,
  amountParts,
  applyUnit,
  newMistake,
  qualityBlocked,
  remainingFor,
  sabaqDerived,
  unitChange,
  withStatus,
  type PortionForm,
  type UnitChoice,
} from './form.ts';

type Index = (ReferenceIndex & { surahNames?: Map<number, { nameAr: string }> }) | null;
type T = ReturnType<typeof useTranslation>['t'];

/** Errors already rendered as text, by slot (`unit`, `status`, `mistake.1`…). */
export type SlotErrors = Partial<Record<string, string>>;


function ErrorText({ text, testID }: { text: string | undefined; testID: string }) {
  if (!text) return null;
  return (
    <AppText role="helper" color={colors.danger} testID={testID} accessibilityRole="alert">
      {`⚠ ${text}`}
    </AppText>
  );
}

/** "3 lines", "1/2 Para": a quantity in the active language, isolated so digits and fractions keep their order. */
export function useAmount(): (q: Quantity) => string {
  const { t } = useTranslation();
  return (q) => {
    const { key, params } = amountParts(q);
    const isolated = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, isolate(String(v))]));
    return t(key, isolated);
  };
}

export function portionTitle(t: T, section: string, number: number): string {
  return t('daily.portionTitle', { section: t(`sections.${section}`), number: isolate(String(number)) });
}

/**
 * The attempt part: completed, remaining, status, mistakes, quality, remarks. `prefix` is the testID prefix
 * (`daily.sabqi.portion.2` or `attempt`).
 */
export function PerformanceBlock({ form, onChange, prefix, index, errors }: { form: PortionForm; onChange: (next: PortionForm) => void; prefix: string; index: Index; errors: SlotErrors }) {
  const { t } = useTranslation();
  const amount = useAmount();
  const perf = form.perf;
  const setPerf = (patch: Partial<PortionForm['perf']>) => onChange({ ...form, perf: { ...perf, ...patch } });
  const sabaq = form.section === 'SABAQ';
  const paraUnit = !sabaq && form.unit !== null && (PARA_CHOICES as readonly string[]).includes(form.unit);
  const numericUnit = !sabaq && form.unit !== null && !paraUnit;
  const rem = remainingFor(form, index);
  const blocked = qualityBlocked(perf.status);
  const mistakeState = perf.mistakes.length > 0 ? t('mistakes.count', { count: isolate(String(perf.mistakes.length)) }) : perf.noMistakes ? t('mistakes.noneChosen') : t('mistakes.notRecorded');

  return (
    <View style={{ gap: space[3] }}>
      {/* Completed: lines for Sabaq; a Para preset or a number in the assigned unit for Sabqi/Manzil. */}
      {sabaq ? (
        <View style={{ gap: space[1] }}>
          <Field
            testID={`${prefix}.completed`}
            label={t('daily.completedLines')}
            value={perf.completedText}
            onChangeText={(text) => setPerf({ completedText: text })}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            error={errors.completed}
          />
          <AppText role="helper" color={colors.textSecondary}>{t('units.linesLabel')}</AppText>
        </View>
      ) : null}
      {paraUnit ? (
        <View style={{ gap: space[1] }}>
          <AppText role="helper" color={colors.textSecondary}>{t('daily.completedAmount')}</AppText>
          <ChipRow label={t('daily.completedAmount')}>
            {PARA_CHOICES.map((p) => (
              <Chip key={p} testID={`${prefix}.completed.${p}`} label={t(`units.${p}`)} selected={perf.completedPreset === p} onPress={() => setPerf({ completedPreset: p })} />
            ))}
            <Chip testID={`${prefix}.completed.clear`} label={t('daily.clear')} selected={false} onPress={() => setPerf({ completedPreset: null })} />
          </ChipRow>
          <ErrorText text={errors.completed} testID={`${prefix}.completed.error`} />
        </View>
      ) : null}
      {numericUnit ? (
        <View style={{ gap: space[1] }}>
          <Field
            testID={`${prefix}.completedAmount`}
            label={t('daily.completedAmount')}
            value={perf.completedText}
            onChangeText={(text) => setPerf({ completedText: text })}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            error={errors.completedAmount}
          />
          <AppText role="helper" color={colors.textSecondary}>{t(`units.${form.unit}`)}</AppText>
        </View>
      ) : null}
      {perf.status === 'NOT_REMEMBERED' && perf.completedText.trim() === '' && perf.completedPreset === null ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.notRememberedDefault`}>{t('daily.notRememberedDefault')}</AppText>
      ) : null}
      {rem ? (
        <AppText testID={`${prefix}.remaining`}>{t('daily.remaining', { amount: amount(rem) })}</AppText>
      ) : !sabaq && form.unit === null ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.remaining`}>{t('daily.remainingNeedsUnit')}</AppText>
      ) : null}

      {/* Status: required, no default; six chips with text, the chosen one previewed as a StatusChip. */}
      <View style={{ gap: space[1] }}>
        <AppText role="helper" color={colors.textSecondary}>{t('daily.status')}</AppText>
        <ChipRow label={t('daily.status')}>
          {PORTION_STATUSES.map((s) => (
            <Chip key={s} testID={`${prefix}.status.${s}`} label={t(`portionStatus.${s}`)} selected={perf.status === s} onPress={() => onChange(withStatus(form, s, index))} />
          ))}
        </ChipRow>
        <ErrorText text={errors.status} testID={`${prefix}.status.error`} />
      </View>

      {/* Mistakes (FR-ATT-011): a list, or an explicit "No mistakes"; empty without that choice is "not recorded". */}
      <View style={{ gap: space[2] }}>
        <AppText role="cardTitle">{t('mistakes.title')}</AppText>
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.mistakes.state`}>{mistakeState}</AppText>
        <ChipRow label={t('mistakes.title')}>
          <Chip
            testID={`${prefix}.mistakes.none`}
            role="checkbox"
            label={t('mistakes.none')}
            selected={perf.noMistakes && perf.mistakes.length === 0}
            disabled={perf.mistakes.length > 0}
            onPress={() => setPerf({ noMistakes: !perf.noMistakes })}
          />
        </ChipRow>
        {perf.mistakes.map((m, i) => {
          const n = i + 1;
          const set = (patch: Partial<typeof m>) => setPerf({ mistakes: perf.mistakes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <View key={m.key} style={{ gap: space[1] }}>
              <AppText role="helper" style={{ fontWeight: '600' }}>{t('mistakes.item', { number: isolate(String(n)) })}</AppText>
              <ChipRow label={t('mistakes.category')}>
                {MISTAKE_CATEGORIES.map((c) => (
                  <Chip key={c} testID={`${prefix}.mistake.${n}.category.${c}`} label={t(`mistakes.categories.${c}`)} selected={m.category === c} onPress={() => set({ category: c })} />
                ))}
              </ChipRow>
              <ChipRow label={t('mistakes.severity')}>
                {MISTAKE_SEVERITIES.map((s) => (
                  <Chip key={s} testID={`${prefix}.mistake.${n}.severity.${s}`} label={t(`mistakes.severities.${s}`)} selected={m.severity === s} onPress={() => set({ severity: s })} />
                ))}
                {/* Repeated is a separate flag, never a severity (FR-ATT-010). */}
                <Chip testID={`${prefix}.mistake.${n}.repeated`} role="checkbox" label={t('mistakes.repeated')} selected={m.repeated} onPress={() => set({ repeated: !m.repeated })} />
              </ChipRow>
              {/* Optional short note (F07, FR-ATT-012): private to staff unless the Teacher shares it. */}
              <Field
                testID={`${prefix}.mistake.${n}.note`}
                label={t('mistakes.note')}
                helper={m.noteVisibility === 'SHARED' ? `👪 ${t('mistakes.noteShared')}` : `🔒 ${t('daily.privateToStaff')}`}
                value={m.note}
                onChangeText={(text) => set({ note: text })}
                autoCapitalize="sentences"
                maxLength={MISTAKE_NOTE_MAX}
              />
              <ChipRow label={t('mistakes.noteVisibility')}>
                <Chip
                  testID={`${prefix}.mistake.${n}.noteShared`}
                  role="checkbox"
                  label={t('mistakes.shareNote')}
                  selected={m.noteVisibility === 'SHARED'}
                  disabled={m.note.trim() === ''}
                  onPress={() => set({ noteVisibility: m.noteVisibility === 'SHARED' ? 'INTERNAL' : 'SHARED' })}
                />
              </ChipRow>
              <ErrorText text={errors[`mistake.${n}`]} testID={`${prefix}.mistake.${n}.error`} />
              <Button testID={`${prefix}.mistake.${n}.remove`} variant="tertiary" label={t('mistakes.remove')} onPress={() => setPerf({ mistakes: perf.mistakes.filter((_, j) => j !== i) })} />
            </View>
          );
        })}
        <Button
          testID={`${prefix}.mistakes.add`}
          variant="secondary"
          label={t('mistakes.add')}
          onPress={() => setPerf({ noMistakes: false, mistakes: [...perf.mistakes, newMistake(`${form.key}-m${Date.now()}-${perf.mistakes.length}`)] })}
        />
        <ErrorText text={errors.mistakes} testID={`${prefix}.mistakes.error`} />
      </View>

      {/* Quality 1–5, lower is better; never pre-selected; blocked for Absent, Not Assigned, Pending (F05-AC5). */}
      <View style={{ gap: space[1] }}>
        <AppText role="helper" color={colors.textSecondary}>{t('quality.label')}</AppText>
        <AppText role="helper" color={colors.textSecondary}>{t('quality.lowerIsBetter')}</AppText>
        <ChipRow label={t('quality.label')}>
          <Chip testID={`${prefix}.quality.NONE`} label={t('quality.notAssessed')} selected={perf.quality === null} disabled={blocked} onPress={() => setPerf({ quality: null })} />
          {QUALITY_SCORES.map((score) => (
            <Chip
              key={score}
              testID={`${prefix}.quality.${score}`}
              label={t('quality.option', { score: String(score), label: t(`quality.name.${score}`) })}
              selected={perf.quality === score}
              disabled={blocked}
              onPress={() => setPerf({ quality: score })}
            />
          ))}
        </ChipRow>
        {blocked ? <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.quality.notForStatus`}>{t('quality.notForStatus')}</AppText> : null}
        <ErrorText text={errors.quality} testID={`${prefix}.quality.error`} />
      </View>

      <Field
        testID={`${prefix}.remarks`}
        label={t('daily.remarks')}
        helper={`🔒 ${t('daily.privateToStaff')}`}
        value={perf.remarks}
        onChangeText={(text) => setPerf({ remarks: text })}
        multiline
        autoCapitalize="sentences"
        maxLength={REMARKS_MAX}
        error={errors.remarks}
      />
    </View>
  );
}

/** Sabaq: Surah/Ayat range, derived Para (read-only), Total Lines from the layout, Assigned lines. Lines only. */
function SabaqFields({ form, onChange, prefix, index, errors }: { form: PortionForm; onChange: (next: PortionForm) => void; prefix: string; index: Index; errors: SlotErrors }) {
  const { t } = useTranslation();
  const derived = sabaqDerived(form, index);
  const set = (patch: Partial<PortionForm>) => onChange({ ...form, ...patch });
  // A range change re-applies the layout pre-fill unless the Teacher typed Total Lines (FR-SAB-008).
  const setRange = (key: 'surah' | 'surahEnd' | 'ayahStart' | 'ayahEnd') => (text: string) => set({ [key]: text, ...(form.linesTouched ? {} : { totalLines: '' }) });
  const name = index?.surahNames?.get(Number(form.surah));
  return (
    <View style={{ gap: space[3] }}>
      <Field testID={`${prefix}.surah`} label={t('quranRef.range.surah')} value={form.surah} onChangeText={setRange('surah')} keyboardType="number-pad" inputMode="numeric" maxLength={3} error={errors.surah} />
      {name ? <QuranText testID={`${prefix}.surahName`}>{name.nameAr}</QuranText> : null}
      <Field testID={`${prefix}.ayahStart`} label={t('quranRef.range.ayahStart')} value={form.ayahStart} onChangeText={setRange('ayahStart')} keyboardType="number-pad" inputMode="numeric" maxLength={4} error={errors.ayahStart} />
      <Field
        testID={`${prefix}.surahEnd`}
        label={t('daily.surahEnd')}
        helper={t('daily.surahEndHelp')}
        value={form.surahEnd}
        placeholder={form.surah}
        onChangeText={setRange('surahEnd')}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={3}
        error={errors.surahEnd}
      />
      <Field testID={`${prefix}.ayahEnd`} label={t('quranRef.range.ayahEnd')} value={form.ayahEnd} onChangeText={setRange('ayahEnd')} keyboardType="number-pad" inputMode="numeric" maxLength={4} error={errors.ayahEnd} />
      {derived.state === 'UNCHECKED' ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.unchecked`}>{`ℹ ${t('quranRef.range.unchecked')}`}</AppText>
      ) : null}
      {derived.para !== null ? (
        <View>
          <AppText testID={`${prefix}.para`}>{t('quranRef.range.para', { para: isolate(String(derived.para)) })}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('daily.paraDerived')}</AppText>
        </View>
      ) : derived.state === 'CHECKED' && !errors.ayahEnd && !errors.surah && !errors.ayahStart ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.para`}>{t('quranRef.range.paraUnknown')}</AppText>
      ) : null}
      <Field
        testID={`${prefix}.totalLines`}
        label={t('quranRef.range.totalLines')}
        value={derived.totalLinesText}
        onChangeText={(text) => set({ totalLines: text, linesTouched: true })}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        error={errors.totalLines}
        helper={derived.layoutLines === null && !form.linesTouched ? t('quranRef.range.manual') : undefined}
      />
      {!form.linesTouched && derived.layoutLines !== null ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.linesSource.LAYOUT`}>{t('daily.fromLayout')}</AppText>
      ) : derived.source === 'MANUAL' ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.linesSource.MANUAL`}>{t('quranRef.range.source.MANUAL')}</AppText>
      ) : null}
      <Field
        testID={`${prefix}.assigned`}
        label={t('daily.assignedLines')}
        value={derived.assignedText}
        onChangeText={(text) => set({ assignedLines: text, assignedTouched: true })}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        error={errors.assigned}
      />
      {/* Sabaq is measured in lines only: a fixed unit label, never a unit picker or Para presets (F05-AC20). */}
      <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.unitLabel`}>{t('units.linesLabel')}</AppText>
    </View>
  );
}

/** Sabqi / Manzil: Para (Sabqi defaults to the Sabaq Para), assigned unit and amount (presets or Lines/Ayat/Pages). */
function RevisionFields({ form, onChange, prefix, errors, sabqiDefault }: { form: PortionForm; onChange: (next: PortionForm) => void; prefix: string; errors: SlotErrors; sabqiDefault: number | null }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ to: UnitChoice; kind: 'KEEP' | 'CLEAR'; amount: string; from: string } | null>(null);
  const choose = (to: UnitChoice) => {
    const change = unitChange(form, to);
    if (change.kind === 'APPLY') onChange(applyUnit(form, to, true));
    else if (change.kind === 'ASK_KEEP_OR_CLEAR') setPending({ to, kind: 'KEEP', amount: change.amount, from: change.from });
    else setPending({ to, kind: 'CLEAR', amount: '', from: form.unit ?? '' });
  };
  const numeric = form.unit === 'LINES' || form.unit === 'AYAT' || form.unit === 'PAGES';
  return (
    <View style={{ gap: space[3] }}>
      <Field
        testID={`${prefix}.para`}
        label={t('daily.para')}
        helper={form.section === 'SABQI' && sabqiDefault !== null && form.para === String(sabqiDefault) ? t('daily.sabqiParaDefault') : undefined}
        value={form.para}
        onChangeText={(text) => onChange({ ...form, para: text })}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        error={errors.para}
      />
      <View style={{ gap: space[1] }}>
        <AppText role="helper" color={colors.textSecondary}>{t('daily.unit')}</AppText>
        <ChipRow label={t('daily.unit')}>
          {UNIT_CHOICES.map((c) => (
            <Chip key={c} testID={`${prefix}.unit.${c}`} label={t(`units.${c}`)} selected={form.unit === c} onPress={() => choose(c)} />
          ))}
        </ChipRow>
        <ErrorText text={errors.unit} testID={`${prefix}.unit.error`} />
      </View>
      {numeric ? (
        <View style={{ gap: space[1] }}>
          <Field
            testID={`${prefix}.assignedAmount`}
            label={t('daily.amount')}
            value={form.assignedAmount}
            onChangeText={(text) => onChange({ ...form, assignedAmount: text })}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            error={errors.assignedAmount}
          />
          <AppText role="helper" color={colors.textSecondary}>{t(`units.${form.unit}`)}</AppText>
        </View>
      ) : null}
      <ConfirmSheet visible={pending !== null} title={t('daily.unitChange.title')} onCancel={() => setPending(null)} testID={`${prefix}.unitChange.sheet`}>
        {pending ? (
          <>
            <AppText>
              {pending.kind === 'KEEP'
                ? t('daily.unitChange.body', { amount: isolate(pending.amount), from: t(`units.${pending.from}`), to: t(`units.${pending.to}`) })
                : t('daily.unitChange.bodyPara', { to: t(`units.${pending.to}`) })}
            </AppText>
            {pending.kind === 'KEEP' ? (
              <>
                <Button testID={`${prefix}.unitChange.keep`} label={t('daily.unitChange.keep', { amount: isolate(pending.amount) })} onPress={() => { onChange(applyUnit(form, pending.to, true)); setPending(null); }} />
                <Button testID={`${prefix}.unitChange.clear`} variant="secondary" label={t('daily.unitChange.clear')} onPress={() => { onChange(applyUnit(form, pending.to, false)); setPending(null); }} />
              </>
            ) : (
              <Button testID={`${prefix}.unitChange.confirm`} label={t('daily.unitChange.confirm')} onPress={() => { onChange(applyUnit(form, pending.to, false)); setPending(null); }} />
            )}
            <Button testID={`${prefix}.unitChange.cancel`} variant="tertiary" label={t('common.cancel')} onPress={() => setPending(null)} />
          </>
        ) : null}
      </ConfirmSheet>
    </View>
  );
}

/** A whole portion card (UI spec §3.1). */
export function PortionCard({ form, number, onChange, onRemove, index, errors, sabqiDefault }: {
  form: PortionForm;
  number: number;
  onChange: (next: PortionForm) => void;
  onRemove: () => void;
  index: Index;
  errors: SlotErrors;
  sabqiDefault: number | null;
}) {
  const { t } = useTranslation();
  const prefix = `daily.${form.section.toLowerCase()}.portion.${number}`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        <AppText role="cardTitle" testID={`${prefix}.title`}>{portionTitle(t, form.section, number)}</AppText>
        {form.isExtra ? <AppText role="helper" color={colors.info} testID={`${prefix}.extra`}>{`＋ ${t('daily.extra')}`}</AppText> : null}
        {form.perf.status ? <StatusChip status={form.perf.status} testID={`${prefix}.statusChip.${form.perf.status}`} /> : null}
      </View>
      {form.section === 'SABAQ' ? (
        <SabaqFields form={form} onChange={onChange} prefix={prefix} index={index} errors={errors} />
      ) : (
        <RevisionFields form={form} onChange={onChange} prefix={prefix} errors={errors} sabqiDefault={sabqiDefault} />
      )}
      <PerformanceBlock form={form} onChange={onChange} prefix={prefix} index={index} errors={errors} />
      <Button testID={`${prefix}.remove`} variant="tertiary" label={t('daily.removePortion')} onPress={onRemove} />
    </Card>
  );
}
