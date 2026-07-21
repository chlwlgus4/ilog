import {useState} from "react";
import {Link} from "expo-router";
import {Image, Pressable, StyleSheet, Text, View} from "react-native";

import type {CaregiverRole, ChildSummary, FamilySummary} from "../../api";
import {caregiverRoleOptions, nicknameForRoleChange, roleLabel} from "../../constants";
import {AppInput, ChoiceChip, Field, PrimaryButton} from "../../ui";
import {AppleSignInButton} from "./AppleSignInButton";
import {GoogleSignInButton} from "./GoogleSignInButton";
import {ProfileAvatar} from "../shared/ProfileAvatar";
import {RecordIcon} from "../shared/RecordIcon";

type AuthMode = "login" | "signup" | "family";
const authBrandLogo = require("../../../assets/ilog-logo-transparent.png");

export function AuthView({
                             currentFamily,
                             currentChild,
                             loginForm,
                             setLoginForm,
                             joinForm,
                             setJoinForm,
                             busyAction,
                             onLogin,
                             onJoin,
                             onGoogleAuth,
                             initialMode = "login",
                         }: {
    currentFamily: FamilySummary | null;
    currentChild: ChildSummary | null;
    loginForm: { email: string; password: string };
    setLoginForm: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>;
    joinForm: {
        inviteCode: string;
        email: string;
        caregiverName: string;
        role: CaregiverRole;
        password: string;
    };
    setJoinForm: React.Dispatch<
        React.SetStateAction<{
            inviteCode: string;
            email: string;
            caregiverName: string;
            role: CaregiverRole;
            password: string;
        }>
    >;
    busyAction: string | null;
    onLogin: () => void;
    onJoin: () => void;
    onGoogleAuth: (inviteCode?: string) => void;
    initialMode?: AuthMode;
}) {
    const [authMode, setAuthMode] = useState<AuthMode>(initialMode === "family" ? "signup" : initialMode);
    const inviteCode = currentFamily?.inviteCode ?? (joinForm.inviteCode || "초대 코드 없음");

    if (authMode === "family") {
        return (
            <View style={styles.authSurface}>
                <View style={styles.navLine}>
                    <Pressable onPress={() => setAuthMode("signup")} accessibilityRole="button">
                        <Text style={styles.navBack}>‹</Text>
                    </Pressable>
                    <Text style={styles.navTitle}>가족 구성</Text>
                    <Text style={styles.navDone}>완료</Text>
                </View>

                <View style={styles.copyBlock}>
                    <Text style={styles.title}>가족 구성</Text>
                    <Text style={styles.description}>함께 육아할 가족을 초대하고 기록을 함께 맞춥니다.</Text>
                </View>

                <View style={styles.memberList}>
                    <MemberRow name={joinForm.caregiverName || "보호자"} email="guardian@email.com" badge="관리자" tone="blue"/>
                    <MemberRow name="아빠" email="dad@email.com" badge="초대됨" tone="orange"/>
                    <MemberRow name="보호자" email="guardian2@email.com" badge="초대" tone="blue"/>
                </View>

                <View style={styles.inviteCard}>
                    <View>
                        <Text style={styles.inviteLabel}>가족 초대 코드</Text>
                        <Text style={styles.inviteValue}>{inviteCode}</Text>
                    </View>
                    <RecordIcon name="memo" size={42}/>
                </View>

                <Field label="초대 코드">
                    <AppInput
                        placeholder="예: BB-FAMILY"
                        value={joinForm.inviteCode}
                        onChangeText={(inviteCodeValue) => setJoinForm((current) => ({
                            ...current,
                            inviteCode: inviteCodeValue
                        }))}
                        testID="auth-join-invite-code"
                    />
                </Field>
                <PrimaryButton label={busyAction === "join" ? "등록하는 중..." : "완료"} onPress={onJoin}
                               testID="auth-join-submit"/>
            </View>
        );
    }

    if (authMode === "signup") {
        return (
            <View style={styles.authSurface}>
                <View style={styles.copyBlock}>
                    <Text style={styles.title}>회원가입</Text>
                    <Text style={styles.description}>가입자 정보를 먼저 입력해 주세요. 아이 정보는 로그인 후 등록합니다.</Text>
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
                <PrimaryButton label={busyAction === "join" ? "가입 중..." : "가입 완료"} onPress={onJoin} testID="auth-join-submit"/>
                <View style={styles.dividerRow}>
                    <View style={styles.divider}/>
                    <Text style={styles.dividerText}>또는</Text>
                    <View style={styles.divider}/>
                </View>
                <ProviderAuthButton
                    provider="google"
                    label={busyAction === "google-auth" ? "Google로 이동 중..." : "Sign in with Google"}
                    onPress={() => onGoogleAuth(joinForm.inviteCode)}
                    disabled={busyAction === "google-auth"}
                />
                <Pressable style={styles.footerLink} onPress={() => setAuthMode("login")} accessibilityRole="button">
                    <Text style={styles.footerMuted}>계정이 있으신가요?</Text>
                    <Text style={styles.footerAccent}>로그인</Text>
                </Pressable>
                <LegalLinks/>
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

            <PrimaryButton label={busyAction === "login" ? "로그인 중..." : "로그인"} onPress={onLogin}
                           testID="auth-login-submit"/>
            <Pressable style={styles.forgotButton} accessibilityRole="button">
                <Text style={styles.forgotText}>비밀번호 찾기</Text>
            </Pressable>

            <View style={styles.dividerRow}>
                <View style={styles.divider}/>
                <Text style={styles.dividerText}>또는</Text>
                <View style={styles.divider}/>
            </View>

            <ProviderAuthButton
                provider="google"
                label={busyAction === "google-auth" ? "Google로 이동 중..." : "Sign in with Google"}
                onPress={() => onGoogleAuth()}
                disabled={busyAction === "google-auth"}
            />
            <ProviderAuthButton provider="apple" label="Sign in with Apple"/>
            <Pressable style={styles.footerLink} onPress={() => setAuthMode("signup")} accessibilityRole="button">
                <Text style={styles.footerMuted}>계정이 없으신가요?</Text>
                <Text style={styles.footerAccent}>회원가입</Text>
            </Pressable>
            <LegalLinks/>
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
                                provider,
                                label,
                                onPress,
                                disabled,
                            }: {
    provider: "google" | "apple";
    label: string;
    onPress?: () => void;
    disabled?: boolean;
}) {
    if (provider === "google") {
        return <GoogleSignInButton label={label} onPress={onPress} disabled={disabled} style={styles.providerAuthGoogleButton} testID="provider-google-auth"/>;
    }

    return <AppleSignInButton label={label} onPress={onPress} disabled={disabled} style={styles.providerAuthAppleButton} testID="provider-apple-auth"/>;
}

function ScreenBadge({label}: { label: string }) {
    return (
        <View style={styles.screenBadge}>
            <Text style={styles.screenBadgeText}>{label}</Text>
        </View>
    );
}

function MemberRow({name, email, badge, tone}: {
    name: string;
    email: string;
    badge: string;
    tone: "blue" | "orange"
}) {
    return (
        <View style={styles.memberRow}>
            <ProfileAvatar size={34}/>
            <View style={styles.memberCopy}>
                <Text style={styles.memberName}>{name}</Text>
                <Text style={styles.memberEmail}>{email}</Text>
            </View>
            <View style={[styles.memberBadge, tone === "orange" && styles.memberBadgeOrange]}>
                <Text style={[styles.memberBadgeText, tone === "orange" && styles.memberBadgeTextOrange]}>{badge}</Text>
            </View>
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
        backgroundColor: "#E7F6F3",
        paddingHorizontal: 18,
        paddingVertical: 6,
    },
    screenBadgeText: {
        color: "#3F6EF5",
        fontSize: 13,
        fontWeight: "700",
    },
    navLine: {
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navBack: {
        color: "#334155",
        fontSize: 28,
        lineHeight: 30,
    },
    navTitle: {
        color: "#111827",
        fontSize: 16,
        fontWeight: "700",
    },
    navDone: {
        color: "#4DB6AC",
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
        color: "#111827",
        fontSize: 22,
        lineHeight: 28,
        fontWeight: "700",
    },
    description: {
        textAlign: "center",
        color: "#64748B",
        fontSize: 13,
        lineHeight: 20,
    },
    inviteCodeHint: {
        marginTop: -8,
        color: "#2F8F88",
        fontSize: 12,
        fontWeight: "700",
    },
    contextCard: {
        gap: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#FFFFFF",
        padding: 15,
    },
    contextLabel: {
        color: "#A06D54",
        fontSize: 12,
        fontWeight: "700",
    },
    contextTitle: {
        color: "#111827",
        fontSize: 16,
        fontWeight: "700",
    },
    contextMeta: {
        color: "#64748B",
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
        backgroundColor: "#4DB6AC",
    },
    checkText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "700",
    },
    keepText: {
        color: "#64748B",
        fontSize: 12,
        fontWeight: "700",
    },
    forgotButton: {
        alignItems: "center",
    },
    forgotText: {
        color: "#4DB6AC",
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
        backgroundColor: "#DDE7E2",
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
    providerAuthAppleButton: {
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
        color: "#64748B",
        fontSize: 12,
        fontWeight: "700",
    },
    footerAccent: {
        color: "#4DB6AC",
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
        color: "#64748B",
        fontSize: 11,
        fontWeight: "700",
    },
    legalSeparator: {
        color: "#CBD5E1",
        fontSize: 11,
        fontWeight: "700",
    },
    avatarPicker: {
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
    },
    avatarCircle: {
        width: 82,
        height: 82,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#EDF2FF",
    },
    avatarGlyph: {
        color: "#4DB6AC",
        fontSize: 34,
        fontWeight: "700",
    },
    avatarText: {
        color: "#4DB6AC",
        fontSize: 12,
        fontWeight: "700",
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    scoreRow: {
        flexDirection: "row",
        gap: 10,
    },
    scoreCol: {
        flexDirection: "column",
        gap: 10,
    },
    memberList: {
        gap: 10,
    },
    memberRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#FFFFFF",
        padding: 12,
    },
    memberAvatar: {
        width: 36,
        height: 36,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFE2D1",
    },
    memberInitial: {
        color: "#334155",
        fontSize: 13,
        fontWeight: "700",
    },
    memberCopy: {
        flex: 1,
        gap: 2,
    },
    memberName: {
        color: "#111827",
        fontSize: 13,
        fontWeight: "700",
    },
    memberEmail: {
        color: "#94A3B8",
        fontSize: 11,
        fontWeight: "700",
    },
    memberBadge: {
        borderRadius: 8,
        backgroundColor: "#E7F6F3",
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
    memberBadgeOrange: {
        backgroundColor: "#FFF3E8",
    },
    memberBadgeText: {
        color: "#4DB6AC",
        fontSize: 10,
        fontWeight: "700",
    },
    memberBadgeTextOrange: {
        color: "#F97316",
    },
    inviteCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#DDE7E2",
        backgroundColor: "#F8FAFC",
        padding: 14,
    },
    inviteLabel: {
        color: "#64748B",
        fontSize: 12,
        fontWeight: "600",
    },
    inviteValue: {
        color: "#111827",
        fontSize: 18,
        fontWeight: "700",
    },
});
