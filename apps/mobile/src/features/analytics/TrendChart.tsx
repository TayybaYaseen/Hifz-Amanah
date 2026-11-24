// F15 · Quality trend chart (F15-AC3; docs/handover/F15-ui-spec.md "Chart a11y and direction rules"). View-based, no
// chart library. The Y axis has 1 · Excellent at the TOP and 5 · Weak at the BOTTOM in every locale (lower is
// better); a day without ratings is a gap with no point, never 0. Time runs oldest → newest in the reading direction:
// the columns are a row in the screen's layout direction, so Urdu mirrors them right → left. The chart is one
// accessible element whose label is the text summary; the marks are not focusable one by one. A "Show values" toggle
// lists every day as text, so nothing relies on the drawing or on colour.
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, isolate } from '../../components/ui.tsx';
import { colors, radius, space } from '../../theme/tokens.ts';
import { chartColumns, nearestScore, oneDecimal, type QualityPointLike } from './view.ts';

const BASE_HEIGHT = 160;
const MARK = space[3];

export function TrendChart({ points, summary }: { points: readonly QualityPointLike[]; summary: string }) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const [showValues, setShowValues] = useState(false);
  const columns = chartColumns(points);
  const height = Math.round(BASE_HEIGHT * Math.max(1, fontScale));
  return (
    <View style={styles.block}>
      <View testID="analytics.quality.chart" accessible accessibilityRole="image" accessibilityLabel={summary} style={[styles.chart, { minHeight: height }]}>
        {/* Y axis on the start side: 1 at the top, 5 at the bottom (text labels, never colour alone). */}
        <View style={[styles.axis, { minHeight: height }]}>
          <AppText role="helper" testID="analytics.quality.axisTop">{t('analytics.quality.axisTop')}</AppText>
          <AppText role="helper" testID="analytics.quality.axisBottom">{t('analytics.quality.axisBottom')}</AppText>
        </View>
        <View style={[styles.plot, { minHeight: height }]}>
          <View style={styles.columns}>
            {/* Guide lines for the scores 1…5. */}
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={`guide${i}`} pointerEvents="none" style={[styles.guide, { top: `${(i / 4) * 100}%` }]} />
            ))}
            {columns.map((c) =>
              c.gap ? (
                <View key={c.index} testID={`analytics.quality.gap.${c.index}`} collapsable={false} style={styles.column} />
              ) : (
                <View key={c.index} testID={`analytics.quality.point.${c.index}`} collapsable={false} style={styles.column}>
                  <View style={[styles.mark, { top: `${c.offset * 100}%` }]} />
                </View>
              ),
            )}
          </View>
        </View>
      </View>
      <Button
        testID="analytics.quality.showValues"
        variant="tertiary"
        label={t(showValues ? 'analytics.quality.hideValues' : 'analytics.quality.showValues')}
        onPress={() => setShowValues((v) => !v)}
      />
      {showValues
        ? columns.map((c) => (
            <AppText key={c.index} role="helper" testID={`analytics.quality.value.${c.index}`}>
              {c.gap
                ? `${isolate(c.date)}: ${t('analytics.notRecorded')}`
                : t('analytics.chart.point', { date: isolate(c.date), score: isolate(oneDecimal(c.value)), label: t(`quality.name.${nearestScore(c.value)}`) })}
            </AppText>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[2] },
  chart: { flexDirection: 'row', gap: space[2] },
  axis: { justifyContent: 'space-between', paddingVertical: space[1] },
  plot: { flex: 1, paddingVertical: MARK, borderStartWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  guide: { position: 'absolute', start: 0, end: 0, borderTopWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  columns: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, minWidth: MARK, alignItems: 'center' },
  mark: {
    position: 'absolute',
    width: MARK,
    height: MARK,
    marginTop: -MARK / 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    borderWidth: 1,
    borderColor: colors.brandDeep,
  },
});
