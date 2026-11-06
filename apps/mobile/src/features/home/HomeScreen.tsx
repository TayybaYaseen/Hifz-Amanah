// Role home (F01-AC1, AC17). F01 shows who is signed in and in which madrasa; the operational cards of
// design.md §4.4 (classes, entries, homework, sync) arrive with their features. No invented metrics are shown.
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@hifz/contracts';
import { AppScreen, AppText, Button, Card } from '../../components/ui.tsx';
import { isolate } from '../../i18n/direction.ts';
import { colors } from '../../theme/tokens.ts';

export function HomeScreen({ me, onMore }: { me: MeResponse; onMore: () => void }) {
  const { t } = useTranslation();
  return (
    <AppScreen testID="home.screen">
      <Card>
        <AppText role="screenTitle" color={colors.brandDeep} accessibilityRole="header" testID="home.greeting">
          {/* A name in Urdu script inside an English greeting (or the reverse) keeps the punctuation in place. */}
          {t('home.greeting', { name: isolate(me.displayName) })}
        </AppText>
        <AppText color={colors.textSecondary} testID={`home.role.${me.role}`}>
          {/* The madrasa name may be in Arabic or Latin script; isolate it so the line reads right in every locale. */}
          {t('home.workspace', { role: t(`roles.${me.role}`), madrasa: isolate(me.organization.name) })}
        </AppText>
      </Card>
      <Button testID="nav.more" variant="secondary" label={t('home.more')} onPress={onMore} />
    </AppScreen>
  );
}
