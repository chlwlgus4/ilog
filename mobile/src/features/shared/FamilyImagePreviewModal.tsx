import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT_FAMILY } from "../../typography";
import { RecordIcon } from "./RecordIcon";

type FamilyImagePreviewModalProps = {
  visible: boolean;
  imageUrl: string | null;
  title?: string;
  subtitle?: string | null;
  onClose: () => void;
  testID: string;
};

export function FamilyImagePreviewModal({
  visible,
  imageUrl,
  title,
  subtitle,
  onClose,
  testID,
}: FamilyImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const isVisible = visible && Boolean(imageUrl);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay} testID={testID} accessibilityViewIsModal>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="사진 전체보기 닫기"
          testID={`${testID}-backdrop`}
        />
        <View
          style={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={styles.header}>
            <View style={styles.copy}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              testID={`${testID}-close`}>
              <RecordIcon name="close" size={22} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.imageFrame}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
                testID={`${testID}-image`}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: "#D6E2F0",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "600",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  imageFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
