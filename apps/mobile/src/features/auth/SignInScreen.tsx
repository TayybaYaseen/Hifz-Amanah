// Sign-in (US-001; design.md §4.2): brand header, User ID, password with show/hide, Sign in, Forgot password,
// language selection. No sign-up: the madrasa Admin creates accounts (FR-AUTH-009).
import { useTranslation } from 'react-i18next';
import { AppScreen, AppText, Button } from '../../components/ui.tsx';
import { LanguagePicker } from '../../components/LanguagePicker.tsx';
import { colors } from '../../theme/tokens.ts';
import { SignInForm } from './SignInForm.tsx';

export function SignInScreen({ lastLoginId, onForgotPassword }: { lastLoginId: string | null; onForgotPassword: () => void }) {
  const { t } = useTranslation();
  return (
    <AppScreen testID="signin.screen">
      <AppText role="screenTitle" color={colors.brandPrimary} accessibilityRole="header">
        {t('common.appName')}
      </AppText>
      <AppText role="helper" color={colors.textSecondary}>
        {t('common.tagline')}
      </AppText>
      <AppText role="sectionTitle">{t('signIn.title')}</AppText>
      <SignInForm initialLoginId={lastLoginId} />
      <Button testID="signin.forgot" variant="tertiary" label={t('signIn.forgot')} onPress={onForgotPassword} />
      <AppText role="helper" color={colors.textSecondary}>
        {t('signIn.noSignUp')}
      </AppText>
      <LanguagePicker />
    </AppScreen>
  );
}
