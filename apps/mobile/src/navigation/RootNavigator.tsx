// Chooses what the user may see from the session state. Data screens exist only while signed in, so after
// sign-out or an expired session, Back can never return to them (F01-AC5).
// F12 gates, in order (UI spec §5): app lock (locked-out sign-in, unlock, setup) → workspace locked after access
// was revoked (F12-AC14, AC20) → the signed-in app. The sign-out warning sheet (F12-AC10) is rendered here so
// every sign-out entry point can open it.
import { useEffect } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useLocale } from '../i18n/LocaleContext.tsx';
import { OfflineScreen } from '../features/auth/OfflineScreen.tsx';
import { useTranslation } from 'react-i18next';
import type { AccountResponse, MeResponse } from '@hifz/contracts';
import { useSession } from '../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Notice } from '../components/ui.tsx';
import { AccountCreateScreen, AccountDetailScreen, AccountsScreen } from '../features/accounts/AccountsScreens.tsx';
import { ForgotPasswordScreen } from '../features/auth/ForgotPasswordScreen.tsx';
import { SessionExpiredScreen } from '../features/auth/SessionExpiredScreen.tsx';
import { SignInScreen } from '../features/auth/SignInScreen.tsx';
import { TwoFactorScreen } from '../features/auth/TwoFactorScreen.tsx';
import { RecoveryCodesScreen, TwoFactorSetupScreen } from '../features/auth/TwoFactorSetupScreen.tsx';
import { HomeScreen } from '../features/home/HomeScreen.tsx';
import { MoreScreen } from '../features/home/MoreScreen.tsx';
import { ProfileScreen } from '../features/profile/ProfileScreen.tsx';
import { WorkspaceScreen } from '../features/settings/WorkspaceScreen.tsx';
import { AppLockScreen, AppLockSetupScreen, AppLockSignInScreen } from '../features/app-lock/AppLockScreens.tsx';
import { ConflictReviewScreen } from '../features/sync/ConflictReviewScreen.tsx';
import { SignOutWarningSheet } from '../features/sync/SignOutWarningSheet.tsx';
import { SyncQueueScreen } from '../features/sync/SyncQueueScreen.tsx';
import { WorkspaceLockedScreen } from '../features/sync/WorkspaceLockedScreen.tsx';
import { useAppLock } from '../app-lock/AppLockContext.tsx';
import { MAX_WRONG_PINS } from '../app-lock/lock.ts';
import { useSync } from '../sync/SyncContext.tsx';
import { OFFLINE_ROLES } from '../sync/deviceIndex.ts';
import { colors } from '../theme/tokens.ts';

type AuthStack = { SignIn: undefined; ForgotPassword: undefined };
type AppStack = {
  Home: undefined;
  More: undefined;
  Profile: undefined;
  Workspace: undefined;
  Accounts: undefined;
  AccountCreate: undefined;
  AccountDetail: { account: AccountResponse };
  SyncQueue: undefined;
  ConflictReview: { conflictId: string };
};

/** Lets the sign-out sheet open the Sync Queue from outside the stack. */
export const navigationRef = createNavigationContainerRef<AppStack>();

const Auth = createNativeStackNavigator<AuthStack>();
const App = createNativeStackNavigator<AppStack>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.canvas },
  headerTintColor: colors.brandDeep,
  contentStyle: { backgroundColor: colors.canvas },
};

export function RootNavigator() {
  return (
    <>
      <Screens />
      <SignOutWarningSheet
        onOpenQueue={() => {
          if (navigationRef.isReady()) navigationRef.navigate('SyncQueue');
        }}
      />
    </>
  );
}

function Screens() {
  const { state } = useSession();
  const lock = useAppLock();
  const sync = useSync();
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
    case 'revoked':
      return <WorkspaceLockedScreen madrasa={null} />;
    case 'signedIn': {
      const me = state.me;
      let screen;
      switch (lock.gate) {
        case 'LOADING':
          screen = <Splash />;
          break;
        case 'ERROR':
          // Secure storage could not be read: never fail open.
          screen = <LockError onRetry={lock.retry} />;
          break;
        case 'LOCKED_OUT':
          screen = <AppLockSignInScreen loginId={me.loginId} forgot={(lock.status?.wrongAttempts ?? 0) < MAX_WRONG_PINS} />;
          break;
        case 'LOCKED':
          screen = <AppLockScreen loginId={me.loginId} />;
          break;
        case 'SETUP_REQUIRED':
          screen = <AppLockSetupScreen variant="required" />;
          break;
        case 'SETUP_RESET':
          screen = <AppLockSetupScreen variant="reset" />;
          break;
        case 'SETUP_OFFERED':
          screen = <AppLockSetupScreen variant="optional" />;
          break;
        case 'OPEN':
          screen = sync.locked ? <WorkspaceLockedScreen madrasa={me.organization.name} /> : <SignedInNavigator me={me} />;
          break;
      }
      return (
        <>
          <AccountLocale me={me} />
          {screen}
        </>
      );
    }
  }
}

function LockError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <AppScreen testID="appLock.error">
      <Notice tone="error">{t('errors.INTERNAL')}</Notice>
      <Button label={t('common.retry')} onPress={onRetry} />
    </AppScreen>
  );
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
        {({ navigation }) => <HomeScreen me={me} onMore={() => navigation.navigate('More')} onSyncQueue={() => navigation.navigate('SyncQueue')} />}
      </App.Screen>
      <App.Screen name="More" options={{ title: t('more.title') }}>
        {({ navigation }) => (
          <MoreScreen
            me={me}
            onProfile={() => navigation.navigate('Profile')}
            onAccounts={() => navigation.navigate('Accounts')}
            onWorkspace={() => navigation.navigate('Workspace')}
            onSyncQueue={() => navigation.navigate('SyncQueue')}
          />
        )}
      </App.Screen>
      <App.Screen name="Profile" options={{ title: t('profile.title') }}>
        {() => <ProfileScreen me={me} />}
      </App.Screen>
      <App.Screen name="Workspace" options={{ title: t('workspace.title') }}>
        {() => <WorkspaceScreen />}
      </App.Screen>
      {OFFLINE_ROLES.includes(me.role) ? (
        <>
          <App.Screen name="SyncQueue" options={{ title: t('syncQueue.title') }}>
            {({ navigation }) => <SyncQueueScreen onReview={(conflictId) => navigation.navigate('ConflictReview', { conflictId })} />}
          </App.Screen>
          <App.Screen name="ConflictReview" options={{ title: t('conflict.title') }}>
            {({ navigation, route }) => <ConflictReviewScreen conflictId={route.params.conflictId} onDone={() => navigation.goBack()} />}
          </App.Screen>
        </>
      ) : null}
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
