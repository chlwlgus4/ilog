import { Hcaptcha } from "@hcaptcha/react-native-hcaptcha";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getAuthCaptchaConfig } from "../../serverless/config";
import {
  AuthCaptchaCancelledError,
  type AuthCaptchaHandle,
  type AuthCaptchaVerification,
} from "./authCaptchaTypes";

type PendingVerification = {
  resolve: (verification: AuthCaptchaVerification) => void;
  reject: (error: Error) => void;
};

type HcaptchaMessageEvent = {
  nativeEvent: {
    data: string;
  };
  success?: boolean;
  markUsed?: () => void;
};

export const AuthCaptcha = forwardRef<AuthCaptchaHandle>(function AuthCaptcha(_props, ref) {
  const pendingRef = useRef<PendingVerification | null>(null);
  const { siteKey, isConfigured } = getAuthCaptchaConfig();
  const [isVisible, setIsVisible] = useState(false);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);

  function finishWithError(error: Error) {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setIsChallengeOpen(false);
    setIsVisible(false);
    pending?.reject(error);
  }

  useImperativeHandle(ref, () => ({
    verify: () => {
      if (!isConfigured) {
        return Promise.reject(
          new Error("보안 확인 설정이 비어 있어요. 앱 환경 변수의 hCaptcha 공개 키를 확인해 주세요."),
        );
      }

      if (pendingRef.current) {
        return Promise.reject(new Error("보안 확인이 이미 진행 중이에요."));
      }

      return new Promise<AuthCaptchaVerification>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        setIsChallengeOpen(false);
        setIsVisible(true);
      });
    },
    cancel: () => {
      if (!pendingRef.current) {
        return;
      }

      finishWithError(new AuthCaptchaCancelledError());
    },
  }), [isConfigured]);

  useEffect(() => () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.reject(new AuthCaptchaCancelledError());
  }, []);

  function handleMessage(event: HcaptchaMessageEvent) {
    const data = event.nativeEvent.data;

    if (data === "open") {
      setIsChallengeOpen(true);
      return;
    }

    if (event.success && data.length > 35) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      setIsChallengeOpen(false);
      setIsVisible(false);
      pending?.resolve({
        token: data,
        markUsed: event.markUsed ?? (() => undefined),
      });
      return;
    }

    if (data === "cancel" || data === "challenge-closed") {
      finishWithError(new AuthCaptchaCancelledError());
      return;
    }

    finishWithError(
      new Error("보안 확인을 완료하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."),
    );
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => finishWithError(new AuthCaptchaCancelledError())}
      transparent
      visible={isVisible}
    >
      <View style={[styles.backdrop, !isChallengeOpen && styles.backdropPending]}>
        {isChallengeOpen ? (
          <Pressable
            accessibilityLabel="보안 확인 닫기"
            accessibilityRole="button"
            onPress={() => finishWithError(new AuthCaptchaCancelledError())}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={[
            styles.dialog,
            !isChallengeOpen && styles.dialogPending,
            isChallengeOpen && styles.dialogExpanded,
          ]}
        >
          <Text style={styles.title}>보안 확인</Text>
          <Text style={styles.description}>계정을 안전하게 보호하기 위해 확인해 주세요.</Text>
          <View style={[styles.captchaStage, isChallengeOpen && styles.captchaStageExpanded]}>
            <Hcaptcha
              backgroundColor="#FFFFFF"
              languageCode="ko"
              loadingIndicatorColor="#4DB6AC"
              onMessage={handleMessage}
              sentry={false}
              showLoading
              size="invisible"
              siteKey={siteKey}
              style={styles.captchaWebView}
              url="https://hcaptcha.com"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  backdropPending: {
    backgroundColor: "transparent",
  },
  captchaStage: {
    alignSelf: "center",
    height: 82,
    width: 304,
  },
  captchaStageExpanded: {
    alignSelf: "stretch",
    flex: 1,
    height: undefined,
    width: undefined,
  },
  captchaWebView: {
    backgroundColor: "#FFFFFF",
  },
  description: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  dialog: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    maxWidth: 360,
    paddingHorizontal: 12,
    paddingVertical: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    width: "100%",
  },
  dialogPending: {
    opacity: 0,
  },
  dialogExpanded: {
    height: "76%",
    maxWidth: 420,
  },
  title: {
    color: "#172033",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 4,
    textAlign: "center",
  },
});
