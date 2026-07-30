import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import {
  completePasswordRecovery,
  requestPasswordReset,
  updateRecoveredPassword,
} from "../../api";
import { useBabyBossAppContext } from "../../hooks/BabyBossAppContext";
import { AppInput, Field, PrimaryButton } from "../../ui";
import { AuthCaptcha } from "./AuthCaptcha";
import {
  isAuthCaptchaCancelled,
  runAuthCaptcha,
  type AuthCaptchaHandle,
} from "./authCaptchaTypes";
import { showAppAlert } from "../shared/appAlerts";

const authBrandLogo = require("../../../assets/ilog-logo-transparent.png");
const primary = "#4DB6AC";
const text = "#182238";
const muted = "#718096";

export function ForgotPasswordView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const captchaRef = useRef<AuthCaptchaHandle>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  async function submit() {
    if (busy || cooldownSeconds > 0) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      showAppAlert("이메일 형식을 확인해 주세요.");
      return;
    }

    try {
      setBusy(true);
      await runAuthCaptcha(captchaRef, (captchaToken) =>
        requestPasswordReset(normalizedEmail, captchaToken),
      );
      setSent(true);
      setCooldownSeconds(60);
      showAppAlert(
        "이메일 비밀번호 계정이라면 재설정 메일을 보내드렸어요. Google로 가입한 계정은 Google 로그인을 이용해 주세요.",
        "메일을 확인해 주세요",
      );
    } catch (error) {
      if (!isAuthCaptchaCancelled(error)) {
        showAppAlert(error instanceof Error ? error.message : "비밀번호 재설정 메일을 보내지 못했어요.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage testID="screen-forgot-password">
      <Text style={styles.title}>비밀번호 찾기</Text>
      <Text style={styles.description}>
        이메일 비밀번호 계정에 새 비밀번호 설정 링크를 보내드려요.
      </Text>
      <Field label="이메일">
        <AppInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!busy}
          testID="forgot-password-email"
        />
      </Field>
      <PrimaryButton
        label={
          busy
            ? "확인 중..."
            : cooldownSeconds > 0
              ? `${cooldownSeconds}초 후 다시 보내기`
              : sent
                ? "메일 다시 보내기"
                : "재설정 메일 보내기"
        }
        onPress={() => void submit()}
        disabled={busy || cooldownSeconds > 0}
        testID="forgot-password-submit"
      />
      <TextLink label="로그인으로 돌아가기" onPress={() => router.replace("/login")} />
      <AuthCaptcha ref={captchaRef} />
    </AuthPage>
  );
}

export function ResetPasswordView() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void completePasswordRecovery()
      .then((recoveryEmail) => {
        setEmail(recoveryEmail);
        setStatus("ready");
      })
      .catch((error) => {
        setStatus("failed");
        showAppAlert(error instanceof Error ? error.message : "비밀번호 재설정 링크를 확인하지 못했어요.");
      });
  }, []);

  async function save() {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showAppAlert("새 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.");
      return;
    }

    if (password !== confirmation) {
      showAppAlert("새 비밀번호가 일치하지 않아요.");
      return;
    }

    try {
      setBusy(true);
      await updateRecoveredPassword(password);
      showAppAlert("새 비밀번호를 저장했어요. 다시 로그인해 주세요.", "변경 완료");
      router.replace("/login");
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : "새 비밀번호를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage testID="screen-reset-password">
      <Text style={styles.title}>새 비밀번호 설정</Text>
      {status === "loading" ? (
        <Text style={styles.statusText}>재설정 링크를 확인하고 있어요.</Text>
      ) : status === "failed" ? (
        <>
          <Text style={styles.statusText}>링크가 만료되었거나 이미 사용되었어요.</Text>
          <TextLink label="재설정 메일 다시 받기" onPress={() => router.replace("/forgot-password")} />
        </>
      ) : (
        <>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <Field label="새 비밀번호">
            <AppInput
              value={password}
              onChangeText={setPassword}
              placeholder="영문과 숫자를 포함해 8자 이상"
              secureTextEntry
              autoCapitalize="none"
              editable={!busy}
              testID="reset-password-new"
            />
          </Field>
          <Field label="새 비밀번호 확인">
            <AppInput
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="새 비밀번호를 다시 입력"
              secureTextEntry
              autoCapitalize="none"
              editable={!busy}
              testID="reset-password-confirmation"
            />
          </Field>
          <PrimaryButton
            label={busy ? "저장하는 중..." : "새 비밀번호 저장"}
            onPress={() => void save()}
            disabled={busy}
            testID="reset-password-submit"
          />
        </>
      )}
    </AuthPage>
  );
}

export function EmailConfirmedView() {
  const router = useRouter();
  const app = useBabyBossAppContext();
  const startedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void app.handleEmailAuthCallback().then((success) => {
      if (!success) {
        setFailed(true);
      }
    });
  }, [app]);

  return (
    <AuthPage testID="screen-email-confirmed">
      <Text style={styles.title}>{failed ? "이메일 확인이 필요해요" : "가입을 마무리하고 있어요"}</Text>
      <Text style={styles.statusText}>
        {failed
          ? "확인 링크가 만료되었거나 이미 사용되었어요. 로그인하거나 확인 메일을 다시 요청해 주세요."
          : "이메일 확인이 완료되었습니다. 가족 정보를 연결하고 있어요."}
      </Text>
      {failed ? <TextLink label="로그인으로 돌아가기" onPress={() => router.replace("/login")} /> : null}
    </AuthPage>
  );
}

function AuthPage({
  children,
  testID,
}: {
  children: ReactNode;
  testID: string;
}) {
  return (
    <KeyboardAwareScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      bottomOffset={28}
      extraKeyboardSpace={28}
      testID={testID}
    >
      <Image
        source={authBrandLogo}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="아이로그"
      />
      <View style={styles.form}>{children}</View>
    </KeyboardAwareScrollView>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.linkButton}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  pageContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  logo: {
    width: 220,
    height: 112,
    alignSelf: "center",
    marginBottom: 28,
  },
  form: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: 16,
  },
  title: {
    color: text,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 8,
  },
  statusText: {
    color: muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  emailText: {
    color: text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "#E7F6F3",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkButton: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkText: {
    color: primary,
    fontSize: 15,
    fontWeight: "700",
  },
});
