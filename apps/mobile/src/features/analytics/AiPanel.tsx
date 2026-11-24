// F15 · The AI area (US-063; F15-AC4…AC6, AC8, AC11, AC12; docs/handover/F15-ui-spec.md "AI state table"). Visually
// separate from the calculated metrics (selected surface, dashed gold border, an "AI" chip with text), and announced
// as "AI suggestion" first. It never changes a record: there is no save/apply/confirm, only "Get again". Every state
// is text (and an icon where it is a status), never colour alone. `analytics.ai.state` carries the state name.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Notice, isolate } from '../../components/ui.tsx';
import { colors, radius, space } from '../../theme/tokens.ts';
import { citedRuns, metricCategories, type AiView } from './view.ts';

const CATEGORY_LABEL = {
  ATTENDANCE: 'aiSettings.category.attendance',
  PROGRESS: 'aiSettings.category.progress',
  MISTAKES: 'aiSettings.category.mistakes',
  QUALITY: 'aiSettings.category.quality',
  HOMEWORK: 'aiSettings.category.homework',
} as const;

function Cited({ text, testID }: { text: string; testID: string }) {
  // Numbers the answer cites are bolded; the text itself is shown as the server returned it.
  return (
    <AppText testID={testID}>
      {'• '}
      {citedRuns(text).map((r, i) =>
        r.number ? (
          <AppText key={i} role="cardTitle">
            {isolate(r.text)}
          </AppText>
        ) : (
          r.text
        ),
      )}
    </AppText>
  );
}

export function AiPanel({ view, onGet, onOpenSettings }: { view: AiView; onGet: () => void; onOpenSettings: () => void }) {
  const { t } = useTranslation();
  if (view.state === 'hidden') return null;

  let body;
  switch (view.state) {
    case 'idle':
      body = <Button testID="analytics.ai.button" variant="secondary" label={t('analytics.ai.get')} onPress={onGet} />;
      break;
    case 'offline':
      body = (
        <>
          <Button testID="analytics.ai.button" variant="secondary" label={t('analytics.ai.offline')} disabled onPress={() => undefined} />
          <AppText role="helper" color={colors.textSecondary} testID="analytics.ai.offline">{`⊘ ${t('analytics.ai.offline')}`}</AppText>
        </>
      );
      break;
    case 'insufficient':
      body = <Button testID="analytics.ai.button" variant="secondary" label={t('analytics.ai.insufficient')} disabled onPress={() => undefined} />;
      break;
    case 'loading':
      body = (
        <>
          <Button testID="analytics.ai.button" variant="secondary" label={t('analytics.ai.get')} busy busyLabel={t('analytics.ai.loading')} onPress={() => undefined} />
          <AppText role="helper" color={colors.textSecondary} testID="analytics.ai.loading">
            {view.slow ? `${t('analytics.ai.loading')}\n${t('analytics.ai.slow')}` : t('analytics.ai.loading')}
          </AppText>
        </>
      );
      break;
    case 'notSetup':
      body = view.canConfigure ? (
        <>
          <Notice tone="info" testID="analytics.ai.notSetup">{t('analytics.ai.notSetup')}</Notice>
          <Button testID="analytics.ai.openSettings" variant="secondary" label={t('analytics.ai.openSettings')} onPress={onOpenSettings} />
        </>
      ) : (
        <Notice tone="info" testID="analytics.ai.unavailable">{t('analytics.ai.unavailable')}</Notice>
      );
      break;
    case 'error':
      body = (
        <>
          <Notice tone="error" testID="analytics.ai.unavailable">{t('analytics.ai.tryLater')}</Notice>
          <Button testID="analytics.ai.retry" variant="secondary" label={t('analytics.ai.retry')} onPress={onGet} />
        </>
      );
      break;
    case 'limit':
      body = <Notice tone="info" testID="analytics.ai.limit">{t('analytics.ai.limit')}</Notice>;
      break;
    case 'ready': {
      const { response } = view;
      const out = response.output;
      body = (
        <>
          <AppText testID="analytics.ai.range">{t('analytics.ai.range', { from: isolate(response.period.from), to: isolate(response.period.to) })}</AppText>
          <View testID="analytics.ai.metrics" style={styles.block}>
            <AppText role="helper" color={colors.textSecondary}>{t('analytics.ai.metricsUsed')}</AppText>
            <View style={styles.chips}>
              {metricCategories(response.metricsUsed).map((c) => (
                <View key={c} testID={`analytics.ai.metric.${c}`} style={styles.metricChip}>
                  <AppText role="helper">{t(CATEGORY_LABEL[c])}</AppText>
                </View>
              ))}
            </View>
          </View>
          {out.data_insufficient ? <AppText color={colors.textSecondary} testID="analytics.ai.insufficient">{t('analytics.ai.insufficient')}</AppText> : null}
          {out.observations.length ? (
            <View testID="analytics.ai.observations" style={styles.block}>
              <AppText role="cardTitle" accessibilityRole="header">{t('analytics.ai.observations')}</AppText>
              {out.observations.map((o, i) => (
                <Cited key={i} text={o} testID={`analytics.ai.observation.${i + 1}`} />
              ))}
            </View>
          ) : null}
          {out.suggestions.length ? (
            <View testID="analytics.ai.suggestions" style={styles.block}>
              <AppText role="cardTitle" accessibilityRole="header">{t('analytics.ai.suggestions')}</AppText>
              {out.suggestions.map((s, i) => (
                <Cited key={i} text={s} testID={`analytics.ai.suggestion.${i + 1}`} />
              ))}
            </View>
          ) : null}
          <AppText role="helper" color={colors.textSecondary} testID="analytics.ai.disclaimer">{t('analytics.ai.disclaimer')}</AppText>
          <Button testID="analytics.ai.button" variant="secondary" label={t('analytics.ai.again')} onPress={onGet} />
        </>
      );
      break;
    }
  }

  return (
    <View testID="analytics.ai.panel" style={styles.panel}>
      <View testID="analytics.ai.state" accessible={false} accessibilityValue={{ text: view.state }} style={styles.header}>
        <View style={styles.aiChip}>
          <AppText role="button" color={colors.brandDeep}>{t('analytics.ai.chip')}</AppText>
        </View>
        <AppText role="cardTitle" accessibilityRole="header" testID="analytics.ai.label" style={styles.headerText}>
          {t('analytics.ai.label')}
        </AppText>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: space[6],
    backgroundColor: colors.surfaceSelected,
    borderColor: colors.brandGold,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  headerText: { flexShrink: 1 },
  aiChip: { borderWidth: 1, borderColor: colors.brandGold, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], backgroundColor: colors.surface },
  block: { gap: space[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  metricChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], backgroundColor: colors.surface },
});
