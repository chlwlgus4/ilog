import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";

export function appAlertTitle(message: string) {
  if (message.includes("닉네임")) {
    return "닉네임을 확인해 주세요";
  }

  if (message.includes("권한")) {
    return "권한이 필요해요";
  }

  if (message.includes("비밀번호")) {
    return "비밀번호를 확인해 주세요";
  }

  if (message.includes("로그인")) {
    return "로그인 정보를 확인해 주세요";
  }

  return "확인해 주세요";
}

export function showAppAlert(message: string, title = appAlertTitle(message)) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return;
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${trimmedMessage}`);
    return;
  }

  Alert.alert(title, trimmedMessage, [{ text: "확인" }]);
}

export function useAppAlert(message: string | null | undefined, title?: string) {
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmedMessage = message?.trim() || null;

    if (!trimmedMessage) {
      lastMessageRef.current = null;
      return;
    }

    if (lastMessageRef.current === trimmedMessage) {
      return;
    }

    lastMessageRef.current = trimmedMessage;
    showAppAlert(trimmedMessage, title ?? appAlertTitle(trimmedMessage));
  }, [message, title]);
}
