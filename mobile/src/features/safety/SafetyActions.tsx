import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { blockCaregiver, refreshContentSafetyState, reportSafetyContent, unblockCaregiver, type ContentSafetySnapshot } from "../../serverless/safetyApi";
import { brandColors } from "../../theme";
import { showAppAlert } from "../shared/appAlerts";
import { safetyReportReasons, validateSafetyReport, type SafetyReportReason, type SafetyTarget } from "./safetyPolicy";

export function SafetyActions({ target, currentCaregiverId, testID, label = "···", onChanged, inverse = false, blockedByMe = false }: {
  target: SafetyTarget;
  currentCaregiverId?: number | null;
  testID: string;
  label?: string;
  onChanged?: () => void;
  inverse?: boolean;
  blockedByMe?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<"menu" | "report" | "block" | null>(null);
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStage(null); setError(null); setReason(null); setDetails(""); }, [currentCaregiverId, target.type, target.id]);
  const caregiverId = target.type === "CAREGIVER" ? target.id : target.caregiverId;
  const isSelf = caregiverId != null && caregiverId === currentCaregiverId;
  const canBlock = caregiverId != null && caregiverId > 0 && !isSelf;
  const isBlocked = blockedByMe;
  if (!Number.isSafeInteger(target.id) || target.id <= 0 || isSelf) return null;

  function close() { if (!busy) { setStage(null); setError(null); } }
  function open(next: "menu" | "report" | "block") { setStage(next); setError(null); }
  async function submitReport() {
    const validation = validateSafetyReport(reason, details);
    if (validation || !reason) { setError(validation); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await reportSafetyContent(target.type, target.id, reason, details);
      setStage(null);
      setDetails("");
      setReason(null);
      onChanged?.();
      showAppAlert(
        result.alreadyReported
          ? "이미 접수한 신고예요. 운영자가 확인하고 있으며, 해당 항목은 내 화면에서 숨겨집니다."
          : "운영자에게 신고가 접수됐어요. 해당 항목은 내 화면에서 숨겨집니다. 사용자 차단은 별도로 설정할 수 있어요.",
        "신고 접수",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "신고를 접수하지 못했어요. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }
  async function submitBlock() {
    if (!canBlock || caregiverId == null) return;
    setBusy(true);
    setError(null);
    try {
      if (isBlocked) await unblockCaregiver(caregiverId);
      else await blockCaregiver(caregiverId);
      setStage(null);
      onChanged?.();
      showAppAlert(
        isBlocked
          ? "차단을 해제했어요. 상대방도 나를 차단한 경우에는 접촉 제한이 계속될 수 있어요."
          : "이 보호자와의 대화·댓글·태그·개인 알림 접촉을 차단했어요. 가족 권한과 공동 육아 기록은 유지됩니다.",
        isBlocked ? "차단 해제" : "차단 완료",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "차단 설정을 변경하지 못했어요. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <>
    <Pressable style={styles.trigger} onPress={() => open("menu")} accessibilityRole="button" accessibilityLabel={`${target.displayName ? `${target.displayName}님 ` : ""}신고 및 차단 메뉴`} testID={testID}>
      <Text style={[styles.triggerText, inverse && styles.inverseText]}>{label}</Text>
    </Pressable>
    <Modal visible={stage !== null} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="신고 및 차단 메뉴 닫기" />
        <View style={[styles.dialog, { marginTop: Math.max(insets.top, 16), marginBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal testID={`${testID}-dialog`}>
          <View style={styles.header}>
            <Text style={styles.title}>{stage === "report" ? "신고하기" : stage === "block" ? (isBlocked ? "차단을 해제할까요?" : "사용자를 차단할까요?") : "신고 및 차단"}</Text>
            <Pressable style={styles.close} onPress={close} disabled={busy} accessibilityRole="button" accessibilityLabel="닫기" testID={`${testID}-close`}><Text style={styles.closeText}>닫기</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {stage === "menu" ? <>
              <Text style={styles.body}>신고는 운영자에게 검토를 요청하고, 차단은 보호자 간 접촉을 제한하는 별도 기능이에요.</Text>
              <Action label={target.type === "CAREGIVER" ? "사용자 신고" : "콘텐츠 신고"} onPress={() => open("report")} testID={`${testID}-report`} />
              {canBlock ? <Action label={isBlocked ? "사용자 차단 해제" : "사용자 차단"} onPress={() => open("block")} testID={`${testID}-block`} /> : null}
            </> : null}
            {stage === "report" ? <>
              <Text style={styles.body}>신고 사유를 선택해 주세요. 사진이나 본문 원문을 복제해 전송하지 않고, 대상 항목의 참조와 입력한 설명만 운영자에게 전달해요.</Text>
              {safetyReportReasons.map((option) => <Pressable key={option.value} style={[styles.reason, reason === option.value && styles.reasonSelected]} onPress={() => setReason(option.value)} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: reason === option.value }} testID={`${testID}-reason-${option.value}`}>
                <Text style={styles.radio}>{reason === option.value ? "●" : "○"}</Text><Text style={styles.reasonText}>{option.label}</Text>
              </Pressable>)}
              <Text style={styles.fieldLabel}>추가 설명 {reason === "OTHER" ? "(10자 이상)" : "(선택)"}</Text>
              <TextInput value={details} onChangeText={setDetails} multiline maxLength={1000} editable={!busy} style={styles.input} textAlignVertical="top" placeholder="검토에 필요한 내용만 적어 주세요." placeholderTextColor={brandColors.muted} accessibilityLabel="신고 추가 설명" testID={`${testID}-details`} />
              <Text style={styles.note}>아이의 이름·연락처·주소·건강 정보 등 민감한 개인정보는 입력하지 마세요. 신고는 운영자만 확인하며, 처리 완료 후 90일 이내 삭제해요.</Text>
              {error ? <Text style={styles.error} accessibilityRole="alert" testID={`${testID}-error`}>{error}</Text> : null}
              <Action label={busy ? "접수 중…" : error ? "다시 신고 제출" : "신고 제출"} onPress={() => void submitReport()} disabled={busy} primary testID={`${testID}-submit`} />
            </> : null}
            {stage === "block" ? <>
              <Text style={styles.body}>{isBlocked ? "차단을 해제하면 이 보호자와 대화·댓글·태그·개인 알림을 다시 주고받을 수 있어요." : "이 보호자와의 대화·댓글·태그·개인 알림 접촉이 중단되고, 서로의 대화와 댓글이 숨겨져요."}</Text>
              <Text style={styles.notice}>가족에서 강퇴하거나 가족 접근 권한을 없애는 기능이 아니에요. 공동 육아 기록·일정·분담·가족 사진은 삭제되지 않으며 가족 구성원에게 계속 보일 수 있어요.</Text>
              {error ? <Text style={styles.error} accessibilityRole="alert" testID={`${testID}-error`}>{error}</Text> : null}
              <Action label={busy ? "처리 중…" : isBlocked ? "차단 해제하기" : "차단하기"} onPress={() => void submitBlock()} disabled={busy} primary testID={`${testID}-confirm-block`} />
            </> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

export function SafetyStateNotice({ state }: { state: ContentSafetySnapshot }) {
  return <View style={styles.stateNotice} testID="content-safety-state">
    <Text style={styles.body}>{state.status === "error" ? state.error : "안전한 대화 표시를 위해 신고·차단 설정을 확인하고 있어요."}</Text>
    {state.status === "error" ? <Action label="다시 시도" onPress={() => void refreshContentSafetyState().catch(() => undefined)} testID="content-safety-retry" /> : null}
  </View>;
}

function Action({ label, onPress, testID, disabled = false, primary = false }: { label: string; onPress: () => void; testID: string; disabled?: boolean; primary?: boolean }) {
  return <Pressable style={[styles.action, primary && styles.primaryAction, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" testID={testID}><Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  trigger: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  triggerText: { color: brandColors.muted, fontSize: 16, fontWeight: "700" }, inverseText: { color: "#FFFFFF" },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", paddingHorizontal: 16 },
  dialog: { width: "100%", maxWidth: 440, maxHeight: "92%", alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 20, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: brandColors.border },
  title: { flex: 1, color: brandColors.ink, fontSize: 19, fontWeight: "800" }, close: { minWidth: 52, minHeight: 44, alignItems: "center", justifyContent: "center" }, closeText: { color: brandColors.muted, fontSize: 14, fontWeight: "700" },
  content: { padding: 20, gap: 12 }, body: { color: brandColors.ink, fontSize: 14, lineHeight: 22 },
  reason: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: brandColors.border }, reasonSelected: { borderColor: brandColors.primary, backgroundColor: "#EEF9F7" }, radio: { color: brandColors.primary, fontSize: 18 }, reasonText: { flex: 1, fontSize: 14, color: brandColors.ink },
  fieldLabel: { color: brandColors.ink, fontWeight: "700", fontSize: 14 }, input: { minHeight: 100, borderWidth: 1, borderColor: brandColors.border, borderRadius: 12, padding: 12, fontSize: 14, color: brandColors.ink },
  note: { color: brandColors.muted, fontSize: 12, lineHeight: 19 }, notice: { padding: 14, borderRadius: 12, backgroundColor: "#F1F5F9", color: brandColors.ink, fontSize: 14, lineHeight: 22 }, error: { color: "#B42318", fontSize: 13, lineHeight: 20 },
  action: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: brandColors.border, alignItems: "center", justifyContent: "center" }, primaryAction: { backgroundColor: brandColors.primary, borderColor: brandColors.primary }, actionText: { color: brandColors.ink, fontSize: 15, fontWeight: "700" }, primaryText: { color: brandColors.onAction }, disabled: { opacity: 0.5 }, stateNotice: { padding: 18, gap: 12 },
});
