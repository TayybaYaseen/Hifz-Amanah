// User ID + password form (US-001; design.md §4.2). Used by Sign-in and the session-expired prompt.
// Every refusal shows the same message; the User ID stays filled and the password is cleared (F01 edge cases).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { Button, Field, Notice } from '../../components/ui.tsx';

export function SignInForm({ initialLoginId }: { initialLoginId: string | null }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [loginId, setLoginId] = useState(initialLoginId ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ loginId?: boolean; password?: boolean }>({});

  const submit = async () => {
    const empty = { loginId: !loginId.trim(), password: !password };
    setMissing(empty);
    if (empty.loginId || empty.password) return;
    setBusy(true);
    setError(null);
    try {
      await session.signIn(loginId.trim(), password);
    } catch (err) {
      setPassword('');
      setError(t(errorKeys(err).form ?? 'errors.INVALID_CREDENTIALS'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? (
        <Notice tone="error" testID="signin.error">
          {error}
        </Notice>
      ) : null}
      <Field
        testID="signin.userId"
        label={t('signIn.userId')}
        helper={t('signIn.userIdHelp')}
        value={loginId}
        onChangeText={setLoginId}
        error={missing.loginId ? t('fields.REQUIRED') : null}
        autoComplete="username"
        textContentType="username"
        maxLength={64}
      />
      <Field
        testID="signin.password"
        label={t('signIn.password')}
        value={password}
        onChangeText={setPassword}
        error={missing.password ? t('fields.REQUIRED') : null}
        secure
        autoComplete="password"
        textContentType="password"
        maxLength={128}
      />
      <Button testID="signin.submit" label={t('signIn.submit')} busyLabel={t('signIn.submitting')} busy={busy} onPress={submit} />
    </>
  );
}
