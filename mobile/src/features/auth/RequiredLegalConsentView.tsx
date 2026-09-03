import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "../../ui";
import { brandColors } from "../../theme";

const primary = brandColors.primary;

export function RequiredLegalConsentView({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: () => Promise<boolean>;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const canSubmit = termsAccepted && privacyAccepted && !busy;

  return (
    <View style={styles.screen} testID="required-legal-consent">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}><Text style={styles.iconText}>✓</Text></View>
        <View style={styles.copy}>
          <Text style={styles.title}>약관 확인이 필요해요</Text>
          <Text style={styles.description}>
            아이로그의 이용약관 또는 개인정보 처리방침이 변경되었습니다. 계속 사용하려면 최신 내용을 확인하고 동의해 주세요.
          </Text>
        </View>
        <View style={styles.card}>
          <ConsentRow
            checked={termsAccepted}
            label="(필수) 이용약관에 동의합니다."
            onPress={() => setTermsAccepted((current) => !current)}
            testID="required-legal-terms-consent"
          />
          <ConsentRow
            checked={privacyAccepted}
            label="(필수) 개인정보 처리방침에 동의합니다."
            onPress={() => setPrivacyAccepted((current) => !current)}
            testID="required-legal-privacy-consent"
          />
          <View style={styles.links}>
            <Link href="/terms" asChild>
              <Pressable accessibilityRole="link"><Text style={styles.link}>이용약관 보기</Text></Pressable>
            </Link>
            <Text style={styles.separator}>·</Text>
            <Link href="/privacy-policy" asChild>
              <Pressable accessibilityRole="link"><Text style={styles.link}>개인정보 처리방침 보기</Text></Pressable>
            </Link>
          </View>
          <PrimaryButton
            label={busy ? "저장 중..." : "동의하고 계속하기"}
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            testID="required-legal-submit"
          />
          <Link href="/account-deletion" asChild>
            <Pressable accessibilityRole="link" testID="required-legal-account-deletion">
              <Text style={styles.accountDeletionLink}>동의 없이 계정 탈퇴</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

function ConsentRow({
  checked,
  label,
  onPress,
  testID,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      style={styles.consentRow}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      testID={testID}
    >
      <View style={[styles.check, checked && styles.checkActive]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>
      <Text style={styles.consentText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { flexGrow: 1, justifyContent: "center", gap: 22, paddingHorizontal: 20, paddingVertical: 32 },
  icon: { alignSelf: "center", width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F6F3" },
  iconText: { color: primary, fontSize: 34, fontWeight: "800" },
  copy: { gap: 8 },
  title: { color: "#182238", fontSize: 24, fontWeight: "800", textAlign: "center" },
  description: { color: "#64748B", fontSize: 14, lineHeight: 21, fontWeight: "600", textAlign: "center" },
  card: { gap: 16, borderRadius: 18, borderWidth: 1, borderColor: "#DDE7E2", backgroundColor: "#FFFFFF", padding: 18 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: "#B7D5D0", alignItems: "center", justifyContent: "center" },
  checkActive: { borderColor: brandColors.actionPressed, backgroundColor: brandColors.action },
  checkMark: { color: brandColors.onAction, fontSize: 13, fontWeight: "800" },
  consentText: { flex: 1, color: "#334155", fontSize: 14, fontWeight: "700" },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  link: { color: primary, fontSize: 13, fontWeight: "700" },
  separator: { color: "#CBD5E1", fontSize: 13, fontWeight: "700" },
  accountDeletionLink: { color: "#64748B", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", textDecorationLine: "underline" },
});
