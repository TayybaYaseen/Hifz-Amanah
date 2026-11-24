// F10 · Family access for one student, Owner/Admin only (design.md §4.12 "Linking state"; FR-PORT-001, FR-PORT-007;
// F10-AC7, AC8, AC16; DEC-B37). Online only; the server enforces every permission (a Teacher gets 403).
// - Student login: link the Student account that sees this student's published reports, or unlink it.
// - Parents: link a Parent account only after verifying the parent offline (in person, or against the madrasa's own
//   records); the method is required before the Link button works. Re-verify records a new method; Revoke stops the
//   Parent's access on their next request. Revoked links stay listed for history. Every action is audited.
// - Accounts are picked from the madrasa's own Student or Parent logins. No search by name, phone, or email.
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GUARDIAN_VERIFICATION_METHODS, type FamilyAccountRef, type GuardianVerificationMethod, type StudentAccessResponse } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';

interface AccountPage {
  items: FamilyAccountRef[];
  page: number;
  pageSize: number;
  total: number;
}

export function FamilyAccessScreen({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const formatTime = useFormatDateTime();
  const [access, setAccess] = useState<StudentAccessResponse | null>(null);
  const [students, setStudents] = useState<FamilyAccountRef[] | null>(null);
  const [parents, setParents] = useState<FamilyAccountRef[] | null>(null);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [pickedParent, setPickedParent] = useState<string | null>(null);
  const [method, setMethod] = useState<GuardianVerificationMethod | null>(null);
  const [reverify, setReverify] = useState<{ linkId: string; method: GuardianVerificationMethod | null } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      const keys = errorKeys(err);
      setNotice({ tone: 'error', text: t(keys.form ?? Object.values(keys.fields)[0] ?? 'errors.INTERNAL') });
    },
    [t],
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [a, s, p] = await Promise.all([
          session.authorized<StudentAccessResponse>(`/students/${studentId}/access`),
          session.authorized<AccountPage>('/family-accounts?role=STUDENT'),
          session.authorized<AccountPage>('/family-accounts?role=PARENT'),
        ]);
        if (!live) return;
        setAccess(a);
        setStudents(s.items);
        setParents(p.items);
      } catch (err) {
        if (live) fail(err);
      }
    })();
    return () => {
      live = false;
    };
  }, [session, studentId, fail]);

  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      setAccess(await session.authorized<StudentAccessResponse>(path, { method: 'POST', body: body ?? {} }));
      setNotice({ tone: 'success', text: t(done) });
      setPickedParent(null);
      setPickedStudent(null);
      setMethod(null);
      setReverify(null);
      setConfirmRevoke(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const methodChips = (selected: GuardianVerificationMethod | null, onPick: (m: GuardianVerificationMethod) => void, prefix: string) => (
    <ChipRow label={t('familyAccess.method')}>
      {GUARDIAN_VERIFICATION_METHODS.map((m) => (
        <Chip key={m} testID={`${prefix}.${m}`} label={t(`familyAccess.methods.${m}`)} selected={selected === m} onPress={() => onPick(m)} />
      ))}
    </ChipRow>
  );

  const linkedParents = new Set((access?.guardians ?? []).filter((g) => g.revokedAt === null).map((g) => g.parent.userId));

  return (
    <AppScreen title={t('familyAccess.title')} testID="familyAccess.screen">
      <AppText role="sectionTitle">{isolate(studentName)}</AppText>
      {notice ? <Notice tone={notice.tone} testID={`familyAccess.${notice.tone}`}>{notice.text}</Notice> : null}
      {access === null && !notice ? <AppText color={colors.textSecondary} testID="familyAccess.loading">{t('common.loading')}</AppText> : null}

      {access ? (
        <>
          {/* Student login (FR-PORT-001). */}
          <Card>
            <View testID="familyAccess.studentLogin" style={{ gap: space[2] }}>
              <AppText role="cardTitle" accessibilityRole="header">{t('familyAccess.studentLogin')}</AppText>
              {access.studentAccount ? (
                <>
                  <AppText testID="familyAccess.studentLogin.linked">{t('familyAccess.account', { name: isolate(access.studentAccount.displayName), loginId: isolate(access.studentAccount.loginId) })}</AppText>
                  <Button testID="familyAccess.studentLogin.unlink" variant="secondary" label={t('familyAccess.unlink')} busy={busy} onPress={() => void act(`/students/${studentId}/student-account/unlink`, {}, 'familyAccess.unlinked')} />
                </>
              ) : (
                <>
                  <AppText color={colors.textSecondary} testID="familyAccess.studentLogin.none">{t('familyAccess.noStudentLogin')}</AppText>
                  {students?.length ? (
                    <ChipRow label={t('familyAccess.pickStudentLogin')}>
                      {students.map((a) => (
                        <Chip key={a.userId} testID={`familyAccess.studentAccount.${a.loginId}`} label={a.loginId} selected={pickedStudent === a.userId} onPress={() => setPickedStudent(a.userId)} />
                      ))}
                    </ChipRow>
                  ) : (
                    <AppText role="helper" color={colors.textSecondary}>{t('familyAccess.noStudentAccounts')}</AppText>
                  )}
                  <Button testID="familyAccess.studentLogin.link" label={t('familyAccess.link')} busy={busy} disabled={!pickedStudent} onPress={() => void act(`/students/${studentId}/student-account`, { userId: pickedStudent }, 'familyAccess.linked')} />
                </>
              )}
            </View>
          </Card>

          {/* Parents (FR-PORT-007): verified offline, method recorded; revoked links kept for history. */}
          <Card>
            <View testID="familyAccess.parents" style={{ gap: space[2] }}>
              <AppText role="cardTitle" accessibilityRole="header">{t('familyAccess.parents')}</AppText>
              {access.guardians.length === 0 ? <AppText color={colors.textSecondary} testID="familyAccess.parents.none">{t('familyAccess.noParents')}</AppText> : null}
              {access.guardians.map((g) => (
                <View key={g.id} testID={`familyAccess.link.${g.parent.loginId}`} style={{ gap: space[1], borderTopWidth: 1, borderColor: colors.border, paddingTop: space[2] }}>
                  <AppText>{t('familyAccess.account', { name: isolate(g.parent.displayName), loginId: isolate(g.parent.loginId) })}</AppText>
                  <AppText role="helper" color={colors.textSecondary}>
                    {t('familyAccess.verified', { method: t(`familyAccess.methods.${g.verificationMethod}`), time: formatTime(g.verifiedAt, true), by: isolate(g.verifiedBy) })}
                  </AppText>
                  {g.revokedAt ? (
                    <AppText role="helper" color={colors.textSecondary} testID={`familyAccess.link.${g.parent.loginId}.revoked`}>{`⛔ ${t('familyAccess.revokedOn', { time: formatTime(g.revokedAt, true) })}`}</AppText>
                  ) : (
                    <>
                      <AppText role="helper" testID={`familyAccess.link.${g.parent.loginId}.active`}>{`✓ ${t('familyAccess.active')}`}</AppText>
                      {reverify?.linkId === g.id ? (
                        <>
                          {methodChips(reverify.method, (m) => setReverify({ linkId: g.id, method: m }), `familyAccess.link.${g.parent.loginId}.method`)}
                          <Button testID={`familyAccess.link.${g.parent.loginId}.verifySave`} label={t('familyAccess.verifyAgain')} busy={busy} disabled={!reverify.method} onPress={() => void act(`/guardian-links/${g.id}/verify`, { verificationMethod: reverify.method }, 'familyAccess.verifiedDone')} />
                          <Button testID={`familyAccess.link.${g.parent.loginId}.verifyCancel`} variant="tertiary" label={t('common.cancel')} onPress={() => setReverify(null)} />
                        </>
                      ) : (
                        <Button testID={`familyAccess.link.${g.parent.loginId}.verify`} variant="tertiary" label={t('familyAccess.verifyAgain')} disabled={busy} onPress={() => setReverify({ linkId: g.id, method: null })} />
                      )}
                      {confirmRevoke === g.id ? (
                        <>
                          <AppText role="helper" color={colors.danger}>{t('familyAccess.revokeConfirm')}</AppText>
                          <Button testID={`familyAccess.link.${g.parent.loginId}.revokeConfirm`} variant="destructive" label={t('familyAccess.revoke')} busy={busy} onPress={() => void act(`/guardian-links/${g.id}/revoke`, {}, 'familyAccess.revokedDone')} />
                          <Button testID={`familyAccess.link.${g.parent.loginId}.revokeCancel`} variant="tertiary" label={t('common.cancel')} onPress={() => setConfirmRevoke(null)} />
                        </>
                      ) : (
                        <Button testID={`familyAccess.link.${g.parent.loginId}.revoke`} variant="destructive" label={t('familyAccess.revoke')} disabled={busy} onPress={() => setConfirmRevoke(g.id)} />
                      )}
                    </>
                  )}
                </View>
              ))}

              <AppText role="cardTitle">{t('familyAccess.addParent')}</AppText>
              <AppText role="helper" color={colors.textSecondary}>{t('familyAccess.verifyFirst')}</AppText>
              {parents?.filter((p) => !linkedParents.has(p.userId)).length ? (
                <ChipRow label={t('familyAccess.pickParent')}>
                  {parents
                    .filter((p) => !linkedParents.has(p.userId))
                    .map((a) => (
                      <Chip key={a.userId} testID={`familyAccess.parentAccount.${a.loginId}`} label={a.loginId} selected={pickedParent === a.userId} onPress={() => setPickedParent(a.userId)} />
                    ))}
                </ChipRow>
              ) : (
                <AppText role="helper" color={colors.textSecondary}>{t('familyAccess.noParentAccounts')}</AppText>
              )}
              {methodChips(method, setMethod, 'familyAccess.method')}
              <Button
                testID="familyAccess.parent.link"
                label={t('familyAccess.linkParent')}
                busy={busy}
                disabled={!pickedParent || !method}
                onPress={() => void act(`/students/${studentId}/guardians`, { parentUserId: pickedParent, verificationMethod: method }, 'familyAccess.linked')}
              />
            </View>
          </Card>
        </>
      ) : null}
    </AppScreen>
  );
}
