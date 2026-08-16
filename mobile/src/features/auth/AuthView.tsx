import {useRef, useState} from "react";
import {Link} from "expo-router";
import {Image, Pressable, StyleSheet, Text, View} from "react-native";

import type {CaregiverRole} from "../../api";
import {caregiverRoleOptions, nicknameForRoleChange, roleLabel} from "../../constants";
import {AppInput, ChoiceChip, Field, PrimaryButton} from "../../ui";
import {GoogleSignInButton} from "./GoogleSignInButton";
import {AppleSignInButton} from "./AppleSignInButton";
import {AuthCaptcha} from "./AuthCaptcha";
import {
    isAuthCaptchaCancelled,
    runAuthCaptcha,
    type AuthCaptchaHandle,
} from "./authCaptchaTypes";
import {getLoginAttemptStatus, loginLockMessage} from "./authRequestLimiter";
import {showAppAlert} from "../shared/appAlerts";
import {currentLegalConsent, type LegalConsentVersions} from "../../legalDocuments";
import {brandColors} from "../../theme";

type AuthMode = "login" | "signup";
const authBrandLogo = require("../../../assets/ilog-logo-transparent.png");

export function AuthView({
                             loginForm,
                             setLoginForm,
                             joinForm,
                             setJoinForm,
                             busyAction,
                             onLogin,
                             onJoin,
                             onGoogleAuth,
                             onAppleAuth,
                             onForgotPassword,
                             initialMode = "login",
}: {
    loginForm: { email: string; password: string };
    setLoginForm: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>;
    joinForm: {
        inviteCode: string;
        email: string;
        caregiverName: string;
        role: CaregiverRole;
        password: string;
        termsAccepted: boolean;
        privacyAccepted: boolean;
    };
    setJoinForm: React.Dispatch<
        React.SetStateAction<{
            inviteCode: string;
            email: string;
            caregiverName: string;
            role: CaregiverRole;
            password: string;
            termsAccepted: boolean;
            privacyAccepted: boolean;
        }>
    >;
    busyAction: string | null;
    onLogin: (captchaToken: string) => Promise<boolean>;
    onJoin: (captchaToken: string) => Promise<boolean>;
    onGoogleAuth: (inviteCode?: string, legalConsent?: LegalConsentVersions) => void;
    onAppleAuth: (inviteCode?: string, legalConsent?: LegalConsentVersions) => void;
    onForgotPassword?: () => void;
    initialMode?: AuthMode;
}) {
    const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
    const [captchaBusy, setCaptchaBusy] = useState(false);
    const captchaRef = useRef<AuthCaptchaHandle>(null);
    const submitting = captchaBusy || busyAction === "login" || busyAction === "join";

    async function submitWithCaptcha(work: (captchaToken: string) => Promise<boolean>) {
        try {
            setCaptchaBusy(true);
            await runAuthCaptcha(captchaRef, work);
        } catch (error) {
            if (!isAuthCaptchaCancelled(error)) {
                showAppAlert(error instanceof Error ? error.message : "보안 확인을 완료하지 못했어요.");
            }
        } finally {
            setCaptchaBusy(false);
        }
    }

    async function submitJoin() {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(joinForm.email.trim())) {
            showAppAlert("이메일 형식을 확인해 주세요.");
            return;
        }

        if (!joinForm.caregiverName.trim()) {
            showAppAlert("닉네임을 입력해 주세요.");
            return;
        }

        if (joinForm.password.length < 8 || !/[A-Za-z]/.test(joinForm.password) || !/\d/.test(joinForm.password)) {
            showAppAlert("비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.");
            return;
        }

        if (!joinForm.termsAccepted || !joinForm.privacyAccepted) {
            showAppAlert("이용약관과 개인정보 처리방침에 모두 동의해 주세요.");
            return;
        }

        await submitWithCaptcha(onJoin);
    }

    function startGoogleSignup() {
        if (!joinForm.termsAccepted || !joinForm.privacyAccepted) {
            showAppAlert("이용약관과 개인정보 처리방침에 모두 동의해 주세요.");
            return;
        }

        onGoogleAuth(joinForm.inviteCode, currentLegalConsent());
    }

    function startAppleSignup() {
        if (!joinForm.termsAccepted || !joinForm.privacyAccepted) {
            showAppAlert("이용약관과 개인정보 처리방침에 모두 동의해 주세요.");
            return;
        }

        onAppleAuth(joinForm.inviteCode, currentLegalConsent());
    }

    async function submitLogin() {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email.trim()) || !loginForm.password) {
            showAppAlert("이메일과 비밀번호를 확인해 주세요.");
            return;
        }

        const attemptStatus = getLoginAttemptStatus(loginForm.email);
        if (!attemptStatus.allowed) {
            showAppAlert(loginLockMessage(attemptStatus.remainingMs));
            return;
        }

        await submitWithCaptcha(onLogin);
    }

    if (authMode === "signup") {
        return (
            <View style={styles.authSurface}>
                <View style={styles.copyBlock}>
                    <Text style={styles.title}>회원가입</Text>
                    <Text style={styles.description}>
                        가입 정보를 입력해 주세요. 가족 초대 코드가 있으면 가입 후 해당 가족 공간에 연결됩니다.
                    </Text>
                </View>

                <Field label="이메일">
                    <AppInput
                        placeholder="name@example.com"
                        value={joinForm.email}
                        onChangeText={(email) => setJoinForm((current) => ({...current, email}))}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        testID="auth-join-email"
                    />
                </Field>
                <Field label="닉네임">
                    <AppInput
                        placeholder="닉네임을 입력하세요"
                        value={joinForm.caregiverName}
                        onChangeText={(caregiverName) => setJoinForm((current) => ({...current, caregiverName}))}
                        testID="auth-join-caregiver-name"
                    />
                </Field>
                <Field label="비밀번호">
                    <AppInput
                        placeholder="영문과 숫자를 포함해 8자 이상"
                        value={joinForm.password}
                        onChangeText={(password) => setJoinForm((current) => ({...current, password}))}
                        secureTextEntry
                        autoCapitalize="none"
                        testID="auth-join-password"
                    />
                </Field>
                <Field label="초대 코드 (선택)">
                    <AppInput
                        placeholder="가족 초대 코드가 있으면 입력"
                        value={joinForm.inviteCode}
                        onChangeText={(inviteCodeValue) => setJoinForm((current) => ({
                            ...current,
                            inviteCode: inviteCodeValue
                        }))}
                        autoCapitalize="characters"
                        testID="auth-join-invite-code"
                    />
                </Field>
                {joinForm.inviteCode.trim() ? <Text style={styles.inviteCodeHint}>가족 초대 코드가 적용되어 있어요.</Text> : null}
                <Field label="역할">
                    <View style={styles.chipRow}>
                        {caregiverRoleOptions.map((role) => (
                            <ChoiceChip key={role} label={roleLabel[role]} active={joinForm.role === role}
                                        onPress={() => setJoinForm((current) => ({
                                            ...current,
                                            caregiverName: nicknameForRoleChange(current.caregiverName, current.role, role),
                                            role,
                                        }))}
                                        testID={`auth-join-role-${role}`}/>
                        ))}
                    </View>
                </Field>
                <View style={styles.consentGroup}>
                    <Pressable
                        style={styles.consentRow}
                        onPress={() => setJoinForm((current) => ({...current, termsAccepted: !current.termsAccepted}))}
                        accessibilityRole="checkbox"
                        accessibilityState={{checked: joinForm.termsAccepted}}
                        testID="auth-join-terms-consent"
                    >
                        <View style={[styles.consentCheck, joinForm.termsAccepted && styles.consentCheckActive]}>
                            {joinForm.termsAccepted ? <Text style={styles.consentCheckMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.consentText}>(필수) 이용약관에 동의합니다.</Text>
                    </Pressable>
                    <Pressable
                        style={styles.consentRow}
                        onPress={() => setJoinForm((current) => ({...current, privacyAccepted: !current.privacyAccepted}))}
                        accessibilityRole="checkbox"
                        accessibilityState={{checked: joinForm.privacyAccepted}}
                        testID="auth-join-privacy-consent"
                    >
                        <View style={[styles.consentCheck, joinForm.privacyAccepted && styles.consentCheckActive]}>
                            {joinForm.privacyAccepted ? <Text style={styles.consentCheckMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.consentText}>(필수) 개인정보 처리방침에 동의합니다.</Text>
                    </Pressable>
                    <LegalLinks/>
                </View>
                <PrimaryButton
                    label={submitting ? "확인 중..." : "가입 완료"}
                    onPress={() => void submitJoin()}
                    disabled={submitting || !joinForm.termsAccepted || !joinForm.privacyAccepted}
                    testID="auth-join-submit"
                />
                <View style={styles.dividerRow}>
                    <View style={styles.divider}/>
                    <Text style={styles.dividerText}>또는</Text>
                    <View style={styles.divider}/>
                </View>
                <ProviderAuthButton
                    label={busyAction === "google-auth" ? "Google로 이동 중..." : "Sign in with Google"}
                    onPress={startGoogleSignup}
                    disabled={busyAction === "google-auth" || !joinForm.termsAccepted || !joinForm.privacyAccepted}
                />
                <AppleSignInButton
                    label={busyAction === "apple-auth" ? "Apple로 이동 중..." : "Sign in with Apple"}
                    variant="signUp"
                    onPress={startAppleSignup}
                    disabled={busyAction === "apple-auth" || !joinForm.termsAccepted || !joinForm.privacyAccepted}
                    style={styles.providerAuthGoogleButton}
                    testID="provider-apple-auth"
                />
                <Pressable style={styles.footerLink} onPress={() => setAuthMode("login")} accessibilityRole="button">
                    <Text style={styles.footerMuted}>계정이 있으신가요?</Text>
                    <Text style={styles.footerAccent}>로그인</Text>
                </Pressable>
                <AuthCaptcha ref={captchaRef}/>
            </View>
        );
    }

    return (
        <View style={styles.authSurface}>
            <ScreenBadge label="02. 로그인"/>
            <View style={styles.logoBlock}>
                <Image
                    source={authBrandLogo}
                    style={styles.brandLogo}
                    resizeMode="contain"
                    accessibilityLabel="아이로그"
                    testID="auth-view-brand-logo"
                />
            </View>

            <Field label="이메일">
                <AppInput
                    placeholder="name@example.com"
                    value={loginForm.email}
                    onChangeText={(email) => setLoginForm((current) => ({...current, email}))}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    testID="auth-login-email"
                />
            </Field>
            <Field label="비밀번호">
                <AppInput
                    placeholder="비밀번호"
                    value={loginForm.password}
                    onChangeText={(password) => setLoginForm((current) => ({...current, password}))}
                    secureTextEntry
                    autoCapitalize="none"
                    testID="auth-login-password"
                />
            </Field>

            <View style={styles.keepRow}>
                <View style={styles.checkBox}>
                    <Text style={styles.checkText}>✓</Text>
                </View>
                <Text style={styles.keepText}>로그인 상태 유지</Text>
            </View>

            <PrimaryButton label={submitting ? "확인 중..." : "로그인"} onPress={() => void submitLogin()}
                           disabled={submitting} testID="auth-login-submit"/>
            <Pressable
                style={styles.forgotButton}
                accessibilityRole="button"
                onPress={onForgotPassword}
                testID="go-forgot-password"
            >
                <Text style={styles.forgotText}>비밀번호 찾기</Text>
            </Pressable>

            <View style={styles.dividerRow}>
                <View style={styles.divider}/>
                <Text style={styles.dividerText}>또는</Text>
                <View style={styles.divider}/>
            </View>

            <ProviderAuthButton
                label={busyAction === "google-auth" ? "Google로 이동 중..." : "Sign in with Google"}
                onPress={() => onGoogleAuth()}
                disabled={busyAction === "google-auth"}
            />
            <AppleSignInButton
                label={busyAction === "apple-auth" ? "Apple로 이동 중..." : "Sign in with Apple"}
                onPress={() => onAppleAuth()}
                disabled={busyAction === "apple-auth"}
                style={styles.providerAuthGoogleButton}
                testID="provider-apple-auth"
            />
            <Pressable style={styles.footerLink} onPress={() => setAuthMode("signup")} accessibilityRole="button">
                <Text style={styles.footerMuted}>계정이 없으신가요?</Text>
                <Text style={styles.footerAccent}>회원가입</Text>
            </Pressable>
            <LegalLinks/>
            <AuthCaptcha ref={captchaRef}/>
        </View>
    );
}

function LegalLinks() {
    return (
        <View style={styles.legalLinkRow}>
            <Link href="/terms" asChild>
                <Pressable accessibilityRole="link">
                    <Text style={styles.legalLinkText}>이용약관</Text>
                </Pressable>
            </Link>
            <Text style={styles.legalSeparator}>·</Text>
            <Link href="/privacy-policy" asChild>
                <Pressable accessibilityRole="link">
                    <Text style={styles.legalLinkText}>개인정보 처리방침</Text>
                </Pressable>
            </Link>
        </View>
    );
}

function ProviderAuthButton({
                                label,
                                onPress,
                                disabled,
                            }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
}) {
    return <GoogleSignInButton label={label} onPress={onPress} disabled={disabled} style={styles.providerAuthGoogleButton} testID="provider-google-auth"/>;
}

function ScreenBadge({label}: { label: string }) {
    return (
        <View style={styles.screenBadge}>
            <Text style={styles.screenBadgeText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    authSurface: {
        gap: 16,
        paddingVertical: 6,
    },
    screenBadge: {
        alignSelf: "center",
        borderRadius: 7,
        backgroundColor: brandColors.tint,
        paddingHorizontal: 18,
        paddingVertical: 6,
    },
    screenBadgeText: {
        color: brandColors.primary,
        fontSize: 13,
        fontWeight: "700",
    },
    copyBlock: {
        gap: 8,
        paddingTop: 8,
    },
    logoBlock: {
        alignItems: "center",
        paddingTop: 8,
        paddingBottom: 8,
    },
    brandLogo: {
        width: 208,
        height: 208,
    },
    title: {
        textAlign: "center",
        color: brandColors.ink,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: "700",
    },
    description: {
        textAlign: "center",
        color: brandColors.muted,
        fontSize: 13,
        lineHeight: 20,
    },
    inviteCodeHint: {
        marginTop: -8,
        color: brandColors.logoTeal,
        fontSize: 12,
        fontWeight: "700",
    },
    contextCard: {
        gap: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: brandColors.border,
        backgroundColor: brandColors.background,
        padding: 15,
    },
    contextLabel: {
        color: "#A06D54",
        fontSize: 12,
        fontWeight: "700",
    },
    contextTitle: {
        color: brandColors.ink,
        fontSize: 16,
        fontWeight: "700",
    },
    contextMeta: {
        color: brandColors.muted,
        fontSize: 12,
        fontWeight: "700",
    },
    keepRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    checkBox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: brandColors.action,
    },
    checkText: {
        color: brandColors.onAction,
        fontSize: 12,
        fontWeight: "700",
    },
    keepText: {
        color: brandColors.muted,
        fontSize: 12,
        fontWeight: "700",
    },
    forgotButton: {
        alignItems: "center",
    },
    forgotText: {
        color: brandColors.primary,
        fontSize: 12,
        fontWeight: "700",
    },
    dividerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: brandColors.border,
    },
    dividerText: {
        color: "#94A3B8",
        fontSize: 12,
        fontWeight: "700",
    },
    providerAuthGoogleButton: {
        height: 48,
        width: "100%",
    },
    footerLink: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    footerMuted: {
        color: brandColors.muted,
        fontSize: 12,
        fontWeight: "700",
    },
    footerAccent: {
        color: brandColors.primary,
        fontSize: 12,
        fontWeight: "700",
    },
    legalLinkRow: {
        minHeight: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingTop: 2,
    },
    legalLinkText: {
        color: brandColors.muted,
        fontSize: 11,
        fontWeight: "700",
    },
    legalSeparator: {
        color: "#CBD5E1",
        fontSize: 11,
        fontWeight: "700",
    },
    consentGroup: {
        gap: 8,
        marginTop: -2,
    },
    consentRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    consentCheck: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#B7D5D0",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: brandColors.background,
    },
    consentCheckActive: {
        borderColor: brandColors.actionPressed,
        backgroundColor: brandColors.action,
    },
    consentCheckMark: {
        color: brandColors.onAction,
        fontSize: 12,
        fontWeight: "800",
    },
    consentText: {
        color: "#475569",
        fontSize: 12,
        fontWeight: "700",
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
});
