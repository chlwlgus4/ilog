import { Image as CachedImage, type ImageLoadEventData } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT_FAMILY } from "../../typography";
import { RecordIcon } from "./RecordIcon";

type FamilyImagePreviewModalProps = {
  visible: boolean;
  imageUrl: string | null;
  title?: string;
  subtitle?: string | null;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  isDownloading?: boolean;
  isSharing?: boolean;
  testID: string;
};

type ImageSize = {
  width: number;
  height: number;
};

const EMPTY_IMAGE_SIZE: ImageSize = { width: 0, height: 0 };
const MAX_IMAGE_SCALE = 4;

function clamp(value: number, minimum: number, maximum: number) {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
}

function fitImageSize(frameSize: ImageSize, sourceSize: ImageSize) {
  if (
    frameSize.width <= 0 ||
    frameSize.height <= 0 ||
    sourceSize.width <= 0 ||
    sourceSize.height <= 0
  ) {
    return frameSize;
  }

  const ratio = Math.min(frameSize.width / sourceSize.width, frameSize.height / sourceSize.height);

  return {
    width: sourceSize.width * ratio,
    height: sourceSize.height * ratio,
  };
}

export function FamilyImagePreviewModal({
  visible,
  imageUrl,
  title,
  subtitle,
  onClose,
  onDownload,
  onShare,
  isDownloading = false,
  isSharing = false,
  testID,
}: FamilyImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const isVisible = visible && Boolean(imageUrl);
  const [frameSize, setFrameSize] = useState<ImageSize>(EMPTY_IMAGE_SIZE);
  const [sourceSize, setSourceSize] = useState<ImageSize>(EMPTY_IMAGE_SIZE);
  const fittedImageSize = useMemo(() => fitImageSize(frameSize, sourceSize), [frameSize, sourceSize]);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);
  const imageWidth = useSharedValue(0);
  const imageHeight = useSharedValue(0);

  useEffect(() => {
    frameWidth.value = frameSize.width;
    frameHeight.value = frameSize.height;
  }, [frameHeight, frameSize.height, frameSize.width, frameWidth]);

  useEffect(() => {
    imageWidth.value = fittedImageSize.width;
    imageHeight.value = fittedImageSize.height;
  }, [fittedImageSize.height, fittedImageSize.width, imageHeight, imageWidth]);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setSourceSize(EMPTY_IMAGE_SIZE);
  }, [
    imageUrl,
    isVisible,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = clamp(savedScale.value * event.scale, 1, MAX_IMAGE_SCALE);
      const maximumX = Math.max(0, (imageWidth.value * nextScale - frameWidth.value) / 2);
      const maximumY = Math.max(0, (imageHeight.value * nextScale - frameHeight.value) / 2);

      scale.value = nextScale;
      translateX.value = clamp(translateX.value, -maximumX, maximumX);
      translateY.value = clamp(translateY.value, -maximumY, maximumY);
    })
    .onEnd(() => {
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }

      const maximumX = Math.max(0, (imageWidth.value * scale.value - frameWidth.value) / 2);
      const maximumY = Math.max(0, (imageHeight.value * scale.value - frameHeight.value) / 2);

      translateX.value = clamp(savedTranslateX.value + event.translationX, -maximumX, maximumX);
      translateY.value = clamp(savedTranslateY.value + event.translationY, -maximumY, maximumY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const imageGesture = Gesture.Simultaneous(pinchGesture, panGesture);
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleImageFrameLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrameSize({ width, height });
  };

  const handleImageLoad = (event: ImageLoadEventData) => {
    setSourceSize({
      width: event.source.width,
      height: event.source.height,
    });
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
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

            <View style={styles.imageFrame} onLayout={handleImageFrameLayout}>
              {imageUrl && fittedImageSize.width > 0 && fittedImageSize.height > 0 ? (
                <GestureDetector gesture={imageGesture}>
                  <Animated.View
                    style={[
                      styles.zoomSurface,
                      {
                        width: fittedImageSize.width,
                        height: fittedImageSize.height,
                      },
                      animatedImageStyle,
                    ]}>
                    <Pressable
                      style={styles.imagePressTarget}
                      onPress={() => undefined}
                      accessibilityRole="image"
                      accessibilityLabel={title ? `${title} 사진` : "확대된 사진"}
                      testID={`${testID}-image-surface`}>
                      <CachedImage
                        source={imageUrl}
                        style={styles.image}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={0}
                        recyclingKey={imageUrl}
                        onLoad={handleImageLoad}
                        testID={`${testID}-image`}
                      />
                    </Pressable>
                  </Animated.View>
                </GestureDetector>
              ) : null}
            </View>

            {onDownload || onShare ? (
              <View style={styles.footer}>
                {onDownload ? (
                  <Pressable
                    style={[styles.actionButton, isDownloading && styles.actionButtonDisabled]}
                    onPress={onDownload}
                    disabled={isDownloading || isSharing}
                    accessibilityRole="button"
                    accessibilityLabel={isDownloading ? "사진 저장 중" : "사진 다운로드"}
                    testID={`${testID}-download`}>
                    <RecordIcon name="download" size={19} color="#FFFFFF" strokeWidth={2.4} />
                    <Text style={styles.actionButtonText}>
                      {isDownloading ? "저장 중" : "다운로드"}
                    </Text>
                  </Pressable>
                ) : null}
                {onShare ? (
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.shareButton,
                      isSharing && styles.actionButtonDisabled,
                    ]}
                    onPress={onShare}
                    disabled={isDownloading || isSharing}
                    accessibilityRole="button"
                    accessibilityLabel={isSharing ? "사진 공유 준비 중" : "사진 공유"}
                    testID={`${testID}-share`}>
                    <RecordIcon name="share" size={19} color="#FFFFFF" strokeWidth={2.3} />
                    <Text style={styles.actionButtonText}>{isSharing ? "준비 중" : "공유"}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
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
    pointerEvents: "box-none",
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    pointerEvents: "box-none",
  },
  copy: {
    flex: 1,
    gap: 3,
    pointerEvents: "none",
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
    pointerEvents: "box-none",
  },
  zoomSurface: {
    alignItems: "center",
    justifyContent: "center",
  },
  imagePressTarget: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  footer: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    pointerEvents: "box-none",
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "#4DB6AC",
  },
  shareButton: {
    backgroundColor: "#334155",
  },
  actionButtonDisabled: {
    backgroundColor: "#8BCFC8",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
  },
});
