import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

export type NativeAppleCredential = {
  identityToken: string;
  nonce: string;
  fullName: string | null;
};

function normalizeFullName(value: string | null | undefined) {
  return value?.trim() || null;
}

function isCancellation(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (
      (error as { code?: string }).code === "ERR_REQUEST_CANCELED"
      || (error as { code?: string }).code === "ERR_CANCELED"
    ),
  );
}

export async function getNativeAppleCredential(): Promise<NativeAppleCredential | null> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple 로그인은 iPhone 또는 iPad 앱에서만 이용할 수 있어요.");
  }

  if (!await AppleAuthentication.isAvailableAsync()) {
    throw new Error("이 기기에서는 Apple 로그인을 사용할 수 없어요.");
  }

  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error("Apple 계정에서 ID 토큰을 받지 못했어요.");
    }

    return {
      identityToken: credential.identityToken,
      nonce,
      fullName: credential.fullName
        ? normalizeFullName(AppleAuthentication.formatFullName(credential.fullName))
        : null,
    };
  } catch (error) {
    if (isCancellation(error)) {
      return null;
    }

    throw error;
  }
}
