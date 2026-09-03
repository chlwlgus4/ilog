import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useBabyBossAppContext } from "../../hooks/BabyBossAppContext";
import { listBlockedCaregivers, refreshContentSafetyState, type BlockedCaregiver } from "../../serverless/safetyApi";
import { brandColors } from "../../theme";
import { SafetyActions } from "./SafetyActions";
import { useContentSafetyState } from "./useContentSafetyState";

export function SafetyScreen() {
  const router = useRouter();
  const app = useBabyBossAppContext();
  const safety = useContentSafetyState();
  const [blocked, setBlocked] = useState<BlockedCaregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setBlocked([]);
    Promise.all([listBlockedCaregivers(), refreshContentSafetyState()])
      .then(([rows]) => { if (active) setBlocked(rows); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "차단 목록을 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [app.session?.caregiver.id, refreshKey]));

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="screen-safety">
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace("/settings")} accessibilityRole="button" accessibilityLabel="이전 화면"><Text style={styles.backText}>‹</Text></Pressable>
      <Text style={styles.title}>신고·차단 관리</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>불편한 콘텐츠는 해당 화면에서 신고해 주세요</Text>
      <Text style={styles.body}>대화·댓글·사진·기록 또는 가족 구성원의 ··· 메뉴에서 사유를 선택해 앱 안에서 바로 신고할 수 있어요. 신고는 운영자에게 전달되며 사용자 차단과는 별도로 처리됩니다.</Text>
      <Text style={styles.note}>사진과 본문 원문은 신고에 복제되지 않아요. 대상 참조와 선택한 사유, 직접 입력한 설명만 운영자가 확인하며 처리 완료 후 90일 이내 삭제합니다.</Text>
      <Pressable style={styles.link} onPress={() => router.push("/support")} accessibilityRole="button" testID="safety-open-support"><Text style={styles.linkText}>도움말 및 긴급 문의 안내</Text></Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>내가 차단한 보호자</Text>
      <Text style={styles.body}>차단은 대화·댓글·태그·개인 알림 접촉을 제한해요. 가족에서 내보내거나 가족 권한·공동 육아 기록을 삭제하지 않으며, 공동 기록·일정·분담·가족 사진은 계속 보일 수 있어요.</Text>
      {loading || safety.status === "idle" || safety.status === "loading" ? <Text style={styles.note} testID="safety-blocks-loading">차단 목록을 확인하고 있어요.</Text> : error || safety.status === "error" ? <View style={styles.errorCard}>
        <Text style={styles.error} accessibilityRole="alert" testID="safety-blocks-error">{error ?? safety.error}</Text>
        <Pressable style={styles.link} onPress={() => setRefreshKey((value) => value + 1)} accessibilityRole="button" testID="safety-blocks-retry"><Text style={styles.linkText}>다시 시도</Text></Pressable>
      </View> : blocked.length === 0 ? <Text style={styles.note} testID="safety-blocks-empty">내가 차단한 보호자가 없어요.</Text> : blocked.map((caregiver) => <View key={caregiver.caregiverId} style={styles.blockedRow} testID={`safety-blocked-${caregiver.caregiverId}`}>
        <View style={styles.rowCopy}><Text style={styles.name}>{caregiver.name}</Text><Text style={styles.note}>차단됨 · {new Date(caregiver.blockedAt).toLocaleDateString("ko-KR")}</Text></View>
        <SafetyActions target={{ type: "CAREGIVER", id: caregiver.caregiverId, displayName: caregiver.name }} currentCaregiverId={app.session?.caregiver.id} blockedByMe label="차단 해제" testID={`safety-unblock-${caregiver.caregiverId}`} onChanged={() => setRefreshKey((value) => value + 1)} />
      </View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" }, content: { width: "100%", maxWidth: 440, alignSelf: "center", padding: 16, paddingBottom: 32, gap: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 }, back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, backText: { color: brandColors.ink, fontSize: 34 }, title: { color: brandColors.ink, fontSize: 21, fontWeight: "800" },
  card: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 16, padding: 16, gap: 12 }, sectionTitle: { color: brandColors.ink, fontSize: 16, fontWeight: "800", lineHeight: 24 }, body: { color: brandColors.ink, fontSize: 14, lineHeight: 23 }, note: { color: brandColors.muted, fontSize: 12, lineHeight: 20 },
  link: { minHeight: 44, justifyContent: "center" }, linkText: { color: brandColors.primary, fontSize: 14, fontWeight: "700" }, errorCard: { gap: 8 }, error: { color: "#B42318", fontSize: 14, lineHeight: 22 }, blockedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: brandColors.border }, rowCopy: { flex: 1 }, name: { color: brandColors.ink, fontSize: 15, fontWeight: "700" },
});
