// Chooses what the user may see from the session state. Data screens exist only while signed in, so after
// sign-out or an expired session, Back can never return to them (F01-AC5).
import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useLocale } from '../i18n/LocaleContext.tsx';
import { OfflineScreen } from '../features/auth/OfflineScreen.tsx';
import { useTranslation } from 'react-i18next';
import type { AccountResponse, MeResponse } from '@hifz/contracts';
import { useSession } from '../auth/SessionContext.tsx';
import { AppScreen, AppText } from '../components/ui.tsx';
import { AccountCreateScreen, AccountDetailScreen, AccountsScreen } from '../features/accounts/AccountsScreens.tsx';
import { ForgotPasswordScreen } from '../features/auth/ForgotPasswordScreen.tsx';
import { SessionExpiredScreen } from '../features/auth/SessionExpiredScreen.tsx';
import { SignInScreen } from '../features/auth/SignInScreen.tsx';
import { TwoFactorScreen } from '../features/auth/TwoFactorScreen.tsx';
import { RecoveryCodesScreen, TwoFactorSetupScreen } from '../features/auth/TwoFactorSetupScreen.tsx';
import { HomeScreen } from '../features/home/HomeScreen.tsx';
import { MoreScreen } from '../features/home/MoreScreen.tsx';
import { ProfileScreen } from '../features/profile/ProfileScreen.tsx';
import { colors } from '../theme/tokens.ts';

type AuthStack = { SignIn: undefined; ForgotPassword: undefined };
type AppStack = {
  Home: undefined;
  More: undefined;
  Profile: undefined;
  Accounts: undefined;
  AccountCreate: undefined;
  AccountDetail: { account: AccountResponse };
};

const Auth = createNativeStackNavigator<AuthStack>();
const App = createNativeStackNavigator<AppStack>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.canvas },
  headerTintColor: colors.brandDeep,
  contentStyle: { backgroundColor: colors.canvas },
};

export function RootNavigator() {
  const { state } = useSession();
  switch (state.kind) {
    case 'starting':
      return <Splash />;
    case 'signedOut':
      return <AuthNavigator lastLoginId={state.lastLoginId} />;
    case 'twoFactor':
      return state.step === 'TWO_FACTOR_SETUP_REQUIRED' ? <TwoFactorSetupScreen /> : <TwoFactorScreen />;
    case 'recoveryCodes':
      return <RecoveryCodesScreen codes={state.codes} />;
    case 'offline':
      return <OfflineScreen />;
    case 'expired':
      return <SessionExpiredScreen loginId={state.loginId} />;
    case 'signedIn':
      return (
        <>
          <AccountLocale me={state.me} />
          <SignedInNavigator me={state.me} />
        </>
      );
  }
}

/**
 * Applies the account's saved language once per sign-in, so it follows the user to any device (FR-AUTH-005).
 * Later changes on My profile are saved to the account by the profile screen itself.
 */
function AccountLocale({ me }: { me: MeResponse }) {
  const { setLocale } = useLocale();
  useEffect(() => {
    setLocale(me.preferredLocale);
    // Once per account, not on every profile reload.
  }, [me.id]);
  return null;
}

function Splash() {
  const { t } = useTranslation();
  return (
    <AppScreen testID="splash.screen">
      <AppText role="screenTitle" color={colors.brandPrimary}>
        {t('common.appName')}
      </AppText>
      <AppText color={colors.textSecondary}>{t('common.tagline')}</AppText>
    </AppScreen>
  );
}

function AuthNavigator({ lastLoginId }: { lastLoginId: string | null }) {
  const { t } = useTranslation();
  return (
    <Auth.Navigator screenOptions={screenOptions}>
      <Auth.Screen name="SignIn" options={{ headerShown: false }}>
        {({ navigation }) => <SignInScreen lastLoginId={lastLoginId} onForgotPassword={() => navigation.navigate('ForgotPassword')} />}
      </Auth.Screen>
      <Auth.Screen name="ForgotPassword" options={{ title: t('reset.title') }}>
        {({ navigation }) => <ForgotPasswordScreen initialLoginId={lastLoginId} onDone={() => navigation.popToTop()} />}
      </Auth.Screen>
    </Auth.Navigator>
  );
}

function SignedInNavigator({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const staff = me.role === 'OWNER' || me.role === 'ADMIN';
  return (
    <App.Navigator screenOptions={screenOptions}>
      <App.Screen name="Home" options={{ title: t('common.appName') }}>
        {({ navigation }) => <HomeScreen me={me} onMore={() => navigation.navigate('More')} />}
      </App.Screen>
      <App.Screen name="More" options={{ title: t('more.title') }}>
        {({ navigation }) => (
          <MoreScreen me={me} onProfile={() => navigation.navigate('Profile')} onAccounts={() => navigation.navigate('Accounts')} />
        )}
      </App.Screen>
      <App.Screen name="Profile" options={{ title: t('profile.title') }}>
        {() => <ProfileScreen me={me} />}
      </App.Screen>
      {staff ? (
        <>
          <App.Screen name="Accounts" options={{ title: t('accounts.title') }}>
            {({ navigation }) => (
              <AccountsScreen onAdd={() => navigation.navigate('AccountCreate')} onOpen={(account) => navigation.navigate('AccountDetail', { account })} />
            )}
          </App.Screen>
          <App.Screen name="AccountCreate" options={{ title: t('accounts.createTitle') }}>
            {({ navigation }) => <AccountCreateScreen onCreated={() => navigation.goBack()} />}
          </App.Screen>
          <App.Screen name="AccountDetail" options={{ title: t('accounts.title') }}>
            {({ route }) => <AccountDetailScreen me={me} account={route.params.account} />}
          </App.Screen>
        </>
      ) : null}
    </App.Navigator>
  );
}
