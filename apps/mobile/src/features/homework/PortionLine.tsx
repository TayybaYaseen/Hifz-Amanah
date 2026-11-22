// F08 · One homework portion as text (design.md §4.9): section, Para or Surah/Ayat range with Total Lines, the
// assigned amount with its unit ("Al-Baqarah 1–10 · 4 of 10 lines", FR-HW-018), where it came from, and a "Review
// units" flag when no remaining amount could be calculated (F08-AC4). A missing amount reads "No amount yet", never 0.
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HomeworkPortionProgress } from '@hifz/domain/homework';
import { StatusChip } from '../../components/StatusChip.tsx';
import { AppText, QuranText, isolate } from '../../components/ui.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { useQuranReference } from '../quran/QuranReferenceContext.tsx';
import { useAmount } from '../daily-entry/PortionCard.tsx';
import type { LocalHomeworkPortion } from './local.ts';

export function usePortionText(): (p: Pick<LocalHomeworkPortion, 'section' | 'paraNumber' | 'range' | 'totalLines' | 'assigned'>) => string {
  const { t } = useTranslation();
  const amount = useAmount();
  return (p) => {
    const section = t(`sections.${p.section}`);
    if (p.section === 'SABAQ' && p.range) {
      const range = isolate(`${p.range.ayahStart}–${p.range.ayahEnd}`);
      const surah = isolate(String(p.range.surahStart));
      const total = isolate(String(p.totalLines ?? '—'));
      return p.assigned
        ? t('homework.portion.sabaq', { surah, range, assigned: isolate(String(p.assigned.numerator)), total })
        : t('homework.portion.sabaqNoAmount', { surah, range, total });
    }
    const para = isolate(String(p.paraNumber ?? '—'));
    return p.assigned ? t('homework.portion.para', { section, para, amount: amount(p.assigned) }) : t('homework.portion.paraNoAmount', { section, para });
  };
}

export function PortionLine({ portion: p, testID, showOrigin = false, showWhy = false, progress = null }: {
  portion: LocalHomeworkPortion;
  testID: string;
  showOrigin?: boolean;
  showWhy?: boolean;
  progress?: HomeworkPortionProgress | null;
}) {
  const { t } = useTranslation();
  const amount = useAmount();
  const text = usePortionText();
  const { index } = useQuranReference();
  const name = p.section === 'SABAQ' && p.range ? index?.surahNames.get(p.range.surahStart)?.nameAr : undefined;
  return (
    <View style={{ gap: space[1] }}>
      {name ? <QuranText>{name}</QuranText> : null}
      <AppText testID={testID}>{text(p)}</AppText>
      {showOrigin ? <AppText role="helper" color={colors.textSecondary} testID={`${testID}.origin.${p.origin}`}>{t(`homework.origin.${p.origin}`)}</AppText> : null}
      {p.needsReview && p.assigned === null ? (
        <AppText role="helper" color={colors.warning} testID={`${testID}.reviewUnits`}>{`⚠ ${t('homework.reviewUnits')}`}</AppText>
      ) : null}
      {showWhy && p.why ? (
        <AppText role="helper" color={colors.textSecondary} testID={`${testID}.why`}>
          {t('homework.why', {
            status: t(`portionStatus.${p.why.status}`),
            assigned: amount(p.why.assigned),
            completed: p.why.completed ? amount(p.why.completed) : t('quality.notRecorded'),
          })}
        </AppText>
      ) : null}
      {progress ? (
        progress.status ? (
          <StatusChip status={progress.status} testID={`${testID}.progress.${progress.status}`} />
        ) : (
          <AppText role="helper" color={colors.neutral} testID={`${testID}.progress.none`}>{`◷ ${t('homework.notAttempted')}`}</AppText>
        )
      ) : null}
    </View>
  );
}
