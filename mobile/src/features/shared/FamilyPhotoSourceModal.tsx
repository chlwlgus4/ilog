import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT_FAMILY } from "../../typography";
import { RecordIcon } from "./RecordIcon";

const primary = "#4DB6AC";
const text = "#111827";
const muted = "#64748B";
const border = "#E3EAF2";

export function FamilyPhotoSourceModal({
  visible,
  busy = false,
  onClose,
  onCamera,
  onLibrary,
  testID = "family-photo-source",
}: {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay} testID={`${testID}-modal`} accessibilityViewIsModal>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="사진 추가 닫기"
          testID={`${testID}-backdrop`}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>사진 추가</Text>
              <Text style={styles.subtitle}>촬영하거나 앨범에서 사진을 선택하세요.</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              testID={`${testID}-close`}>
              <RecordIcon name="close" size={20} color={muted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={onCamera}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="카메라로 촬영"
              testID={`${testID}-camera`}>
              <View style={styles.iconFrame}>
                <RecordIcon name="camera" size={27} color={primary} strokeWidth={2.1} />
              </View>
              <Text style={styles.actionTitle}>촬영</Text>
              <Text style={styles.actionDescription}>카메라로 바로 찍기</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={onLibrary}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="앨범에서 사진 선택"
              testID={`${testID}-library`}>
              <View style={styles.iconFrame}>
                <RecordIcon name="photo-album" size={27} color={primary} strokeWidth={2.1} />
              </View>
              <Text style={styles.actionTitle}>앨범 선택</Text>
              <Text style={styles.actionDescription}>사진 여러 장 선택 가능</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.38)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: text,
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 18,
  },
  actionButton: {
    minHeight: 118,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  actionButtonPressed: {
    borderColor: "#9FD8D2",
    backgroundColor: "#EFFAF8",
  },
  iconFrame: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#E7F6F3",
  },
  actionTitle: {
    color: text,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
  },
  actionDescription: {
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    textAlign: "center",
  },
});
