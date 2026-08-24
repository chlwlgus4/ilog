import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import type { CaregiverSummary, CreateFamilyChatMessageRequest, FamilyChatMessageCard } from "../../api";
import { showAppAlert } from "../shared/appAlerts";
import { FamilyImagePreviewModal } from "../shared/FamilyImagePreviewModal";
import { imagePickerAssetToUpload } from "../shared/imageUpload";
import { downloadFamilyPhotos } from "../shared/photoDownload";
import { shareFamilyPhoto } from "../shared/photoShare";
import { ProfileAvatar } from "../shared/ProfileAvatar";
import { RecordIcon } from "../shared/RecordIcon";
import {
  familyChatMessagePhoto,
  newestFirstFamilyChatMessages,
  messagePreview,
  shouldShowFamilyChatMessageTime,
} from "./familyChatUtils";
import { FONT_FAMILY } from "../../typography";
import { brandColors } from "../../theme";

const primary = brandColors.primary;
const text = brandColors.ink;
const muted = brandColors.muted;
const border = brandColors.border;
const soft = brandColors.surface;
const targetScrollMaxRetries = 8;
const targetScrollRetryDelayMs = 150;
const webTargetScrollStabilizationRetries = 8;
const webTargetScrollStabilizationDelayMs = 150;

type ScrollToIndexFailedInfo = {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
};

type WebScrollIntoViewNode = {
  scrollIntoView?: (options?: { block?: "center"; inline?: "nearest" }) => void;
};

type FamilyChatViewProps = {
  messages: FamilyChatMessageCard[] | null;
  currentCaregiver: Pick<CaregiverSummary, "id" | "name" | "role" | "imageUrl"> | null;
  sending: boolean;
  targetMessageId?: number | null;
  targetActivationKey?: string | null;
  targetMessage?: FamilyChatMessageCard | null;
  targetLoadError?: string | null;
  onBack: () => void;
  onRetryTarget?: () => void;
  onSend: (payload: CreateFamilyChatMessageRequest) => Promise<FamilyChatMessageCard>;
};

export function FamilyChatView({
  messages,
  currentCaregiver,
  sending,
  targetMessageId = null,
  targetActivationKey = null,
  targetMessage = null,
  targetLoadError = null,
  onBack,
  onRetryTarget,
  onSend,
}: FamilyChatViewProps) {
  const [body, setBody] = useState("");
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pendingMessages, setPendingMessages] = useState<FamilyChatMessageCard[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<FamilyChatMessageCard | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const messageListRef = useRef<FlatList<FamilyChatMessageCard>>(null);
  const targetMessageRowRef = useRef<View>(null);
  const nextPendingMessageIdRef = useRef(-1);
  const targetMessageIndexRef = useRef(-1);
  const targetScrollRetryCountRef = useRef(0);
  const targetScrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webTargetScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedTargetMessageId = targetMessageId ?? targetMessage?.id ?? null;
  const messagesWithTarget = useMemo(
    () => mergeTargetFamilyChatMessage(messages ?? [], targetMessage),
    [messages, targetMessage],
  );
  const newestFirstMessages = useMemo(
    () => newestFirstFamilyChatMessages(messagesWithTarget, pendingMessages),
    [messagesWithTarget, pendingMessages],
  );
  const targetMessageIndex = useMemo(
    () => resolvedTargetMessageId == null
      ? -1
      : newestFirstMessages.findIndex((message) => message.id === resolvedTargetMessageId),
    [newestFirstMessages, resolvedTargetMessageId],
  );
  const canSend = Boolean(body.trim() || image) && !sending && !isSubmitting;
  const scrollToLatest = useCallback((animated: boolean) => {
    messageListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);
  const scheduleScrollToLatest = useCallback(() => {
    requestAnimationFrame(() => scrollToLatest(false));
  }, [scrollToLatest]);
  const scrollToTarget = useCallback((animated: boolean) => {
    const index = targetMessageIndexRef.current;
    if (index < 0) {
      return;
    }

    messageListRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0.5,
    });
  }, []);
  const scrollTargetRowIntoViewOnWeb = useCallback(() => {
    if (Platform.OS !== "web") {
      return false;
    }

    const targetNode = targetMessageRowRef.current as unknown as WebScrollIntoViewNode | null;
    if (typeof targetNode?.scrollIntoView !== "function") {
      return false;
    }

    targetNode.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  }, []);
  const handleTargetScrollFailure = useCallback((info: ScrollToIndexFailedInfo) => {
    const targetIndex = targetMessageIndexRef.current;
    if (targetIndex < 0 || info.index !== targetIndex) {
      return;
    }

    if (targetIndex === newestFirstMessages.length - 1) {
      messageListRef.current?.scrollToEnd({ animated: false });
    } else {
      const approximateOffset = Math.max(0, info.averageItemLength * targetIndex);
      messageListRef.current?.scrollToOffset({ offset: approximateOffset, animated: false });
    }

    if (targetScrollRetryCountRef.current >= targetScrollMaxRetries) {
      return;
    }

    targetScrollRetryCountRef.current += 1;
    if (targetScrollRetryTimerRef.current) {
      clearTimeout(targetScrollRetryTimerRef.current);
    }
    targetScrollRetryTimerRef.current = setTimeout(() => {
      targetScrollRetryTimerRef.current = null;
      if (!scrollTargetRowIntoViewOnWeb()) {
        scrollToTarget(false);
      }
    }, targetScrollRetryDelayMs);
  }, [newestFirstMessages.length, scrollTargetRowIntoViewOnWeb, scrollToTarget]);

  useEffect(() => {
    if (resolvedTargetMessageId == null && newestFirstMessages.length > 0) {
      scheduleScrollToLatest();
    }
  }, [newestFirstMessages.length, resolvedTargetMessageId, scheduleScrollToLatest]);

  useEffect(() => {
    targetMessageIndexRef.current = targetMessageIndex;
    targetScrollRetryCountRef.current = 0;
    if (targetScrollRetryTimerRef.current) {
      clearTimeout(targetScrollRetryTimerRef.current);
      targetScrollRetryTimerRef.current = null;
    }

    if (resolvedTargetMessageId == null || targetMessageIndex < 0) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => scrollToTarget(false));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTargetMessageId, scrollToTarget, targetActivationKey, targetMessageIndex]);

  useEffect(() => {
    if (Platform.OS !== "web" || resolvedTargetMessageId == null || targetMessageIndex < 0) {
      return undefined;
    }

    let cancelled = false;
    let retryCount = 0;
    const stabilizeTargetPosition = () => {
      if (cancelled) {
        return;
      }

      scrollTargetRowIntoViewOnWeb();
      if (retryCount >= webTargetScrollStabilizationRetries) {
        return;
      }

      retryCount += 1;
      webTargetScrollTimerRef.current = setTimeout(
        stabilizeTargetPosition,
        webTargetScrollStabilizationDelayMs,
      );
    };

    const frame = requestAnimationFrame(stabilizeTargetPosition);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (webTargetScrollTimerRef.current) {
        clearTimeout(webTargetScrollTimerRef.current);
        webTargetScrollTimerRef.current = null;
      }
    };
  }, [
    resolvedTargetMessageId,
    scrollTargetRowIntoViewOnWeb,
    targetActivationKey,
    targetMessageIndex,
  ]);

  useEffect(() => () => {
    if (targetScrollRetryTimerRef.current) {
      clearTimeout(targetScrollRetryTimerRef.current);
    }
    if (webTargetScrollTimerRef.current) {
      clearTimeout(webTargetScrollTimerRef.current);
    }
  }, []);

  async function pickImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAppAlert("채팅에 사진을 보내려면 사진 접근 권한을 허용해 주세요.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      const asset = result.assets?.[0];

      if (!result.canceled && asset) {
        setImage(asset);
      }
    } catch (pickError) {
      showAppAlert(pickError instanceof Error ? pickError.message : "사진을 선택하지 못했어요.");
    }
  }

  async function send() {
    if (!canSend) {
      return;
    }

    const draftBody = body.trim();
    const draftImage = image;
    const pendingMessageId = nextPendingMessageIdRef.current;
    const pendingMessage: FamilyChatMessageCard = {
      id: pendingMessageId,
      senderId: currentCaregiver?.id ?? 0,
      senderName: currentCaregiver?.name ?? "나",
      senderRole: currentCaregiver?.role ?? "GUARDIAN",
      senderImageUrl: currentCaregiver?.imageUrl ?? null,
      body: draftBody,
      imageUrl: draftImage?.uri ?? null,
      createdAt: new Date().toISOString(),
    };
    nextPendingMessageIdRef.current -= 1;
    const uploadPromise = draftImage ? imagePickerAssetToUpload(draftImage) : Promise.resolve(null);

    setIsSubmitting(true);
    setPendingMessages((current) => [...current, pendingMessage]);
    setBody("");
    setImage(null);
    inputRef.current?.blur();
    Keyboard.dismiss();

    try {
      await onSend({
        body: draftBody,
        image: await uploadPromise,
      });
      setPendingMessages((current) => current.filter((message) => message.id !== pendingMessageId));
      scrollToLatest(false);
    } catch (sendError) {
      setPendingMessages((current) => current.filter((message) => message.id !== pendingMessageId));
      setBody((current) => current || draftBody);
      setImage((current) => current ?? draftImage);
      showAppAlert(sendError instanceof Error ? sendError.message : "가족 메시지를 보내지 못했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const previewPhoto = previewMessage ? familyChatMessagePhoto(previewMessage) : null;

  async function downloadPreviewPhoto() {
    if (!previewPhoto || isDownloading || isSharing) {
      return;
    }

    setIsDownloading(true);
    try {
      const result = await downloadFamilyPhotos([previewPhoto]);
      if (result.downloadedCount === 1) {
        showAppAlert("사진을 기기에 저장했어요.", "저장 완료");
      } else {
        showAppAlert(result.failures[0]?.message ?? "사진을 저장하지 못했어요.");
      }
    } catch (downloadError) {
      showAppAlert(downloadError instanceof Error ? downloadError.message : "사진을 저장하지 못했어요.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function sharePreviewPhoto() {
    if (!previewPhoto || isDownloading || isSharing) {
      return;
    }

    setIsSharing(true);
    try {
      await shareFamilyPhoto(previewPhoto);
    } catch (shareError) {
      showAppAlert(shareError instanceof Error ? shareError.message : "사진을 공유하지 못했어요.");
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <View style={styles.screen} testID="screen-family-chat">
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 화면" testID="family-chat-back">
          <RecordIcon name="back-arrow" size={22} color="#1F2937" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} pointerEvents="none">가족 대화</Text>
        <View style={styles.headerButton} />
      </View>

      {targetLoadError ? (
        <View style={styles.targetErrorBanner} testID="family-chat-target-error">
          <Text style={styles.targetErrorText}>{targetLoadError}</Text>
          {onRetryTarget ? (
            <Pressable
              style={styles.targetRetryButton}
              onPress={onRetryTarget}
              accessibilityRole="button"
              testID="family-chat-target-retry">
              <Text style={styles.targetRetryText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.chatViewportClip} testID="family-chat-keyboard-viewport">
        <KeyboardStickyView style={styles.chatViewport} testID="family-chat-keyboard-content">
          <FlatList
            ref={messageListRef}
            style={styles.messageScroll}
            contentContainerStyle={styles.messageContent}
            data={newestFirstMessages}
            inverted={newestFirstMessages.length > 0}
            keyExtractor={(message) => String(message.id)}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={handleTargetScrollFailure}
            showsVerticalScrollIndicator={false}
            testID="family-chat-messages"
            ListEmptyComponent={(
              <Text style={styles.emptyText}>
                {messages == null && pendingMessages.length === 0
                  ? "가족 대화를 준비하는 중이에요."
                  : "첫 번째 가족 메시지를 남겨 보세요."}
              </Text>
            )}
            renderItem={({ item: message, index }) => {
              const isMine = message.senderId === currentCaregiver?.id;
              const isTarget = message.id === resolvedTargetMessageId;
              const shouldShowTime = shouldShowFamilyChatMessageTime(message, newestFirstMessages[index - 1]);
              const messageBubble = (
                <View
                  style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleFamily]}>
                  {message.imageUrl ? (
                    <Pressable
                      onPress={() => setPreviewMessage(message)}
                      accessibilityRole="button"
                      accessibilityLabel={isTarget
                        ? `${message.senderName}님의 알림 메시지 사진 전체보기`
                        : `${message.senderName}님이 보낸 사진 전체보기`}
                      accessibilityState={isTarget ? { selected: true } : undefined}
                      testID={`family-chat-image-${message.id}`}>
                      <Image source={{ uri: message.imageUrl }} style={styles.messageImage} resizeMode="cover" />
                    </Pressable>
                  ) : null}
                  {message.body ? <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{message.body}</Text> : null}
                </View>
              );
              const messageTime = shouldShowTime ? (
                <Text style={[styles.messageMeta, isMine && styles.messageMetaMine]} testID={`family-chat-time-${message.id}`}>
                  {formatMessageTime(message.createdAt)}
                </Text>
              ) : null;

              return (
                <View
                  key={message.id}
                  ref={isTarget ? targetMessageRowRef : undefined}
                  style={[styles.messageRow, isMine && styles.messageRowMine, isTarget && styles.messageRowTarget]}
                  accessible={isTarget && !message.imageUrl}
                  accessibilityLabel={isTarget && !message.imageUrl ? `${message.senderName}님의 알림 메시지. ${message.body}` : undefined}
                  accessibilityState={isTarget && !message.imageUrl ? { selected: true } : undefined}
                  aria-selected={isTarget || undefined}
                  testID={`family-chat-message-${message.id}`}>
                  {isMine ? (
                    <View style={[styles.messageColumn, styles.messageColumnMine]}>
                      {messageBubble}
                      {messageTime}
                    </View>
                  ) : (
                    <View style={styles.messageColumn}>
                      <Text style={styles.senderName}>{message.senderName}</Text>
                      <View style={styles.incomingMessageBody}>
                        <ProfileAvatar
                          size={30}
                          imageUrl={message.senderImageUrl}
                          testID={`family-chat-avatar-${message.senderId}`}
                        />
                        <View style={styles.incomingMessageContent}>
                          {messageBubble}
                          {messageTime}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
          />

          <View style={styles.composerFrame} testID="family-chat-composer">
            {image ? (
              <View style={styles.selectedImageRow}>
                <Image source={{ uri: image.uri }} style={styles.selectedImage} resizeMode="cover" />
                <Text style={styles.selectedImageText}>{messagePreview("", true)}</Text>
                <Pressable style={styles.removeImageButton} onPress={() => setImage(null)} accessibilityRole="button" accessibilityLabel="선택한 사진 취소" testID="family-chat-remove-image">
                  <Text style={styles.removeImageText}>취소</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <Pressable style={styles.composerIconButton} onPress={() => void pickImage()} accessibilityRole="button" accessibilityLabel="채팅 사진 추가" testID="family-chat-pick-image">
                <RecordIcon name="photo-album" size={22} color={primary} strokeWidth={2} />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={body}
                onChangeText={setBody}
                onFocus={scheduleScrollToLatest}
                placeholder="메시지 입력 (@닉네임 태그)"
                placeholderTextColor="#94A3B8"
                style={styles.composerInput}
                multiline
                maxLength={800}
                testID="family-chat-input"
              />
              <Pressable
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                onPress={() => void send()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="메시지 전송"
                testID="family-chat-send">
                <RecordIcon name="send" size={20} color={brandColors.onAction} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>
        </KeyboardStickyView>
      </View>

      <FamilyImagePreviewModal
        visible={Boolean(previewMessage)}
        imageUrl={previewMessage?.imageUrl ?? null}
        title={previewMessage ? `${previewMessage.senderName}님의 사진` : undefined}
        subtitle={previewMessage?.body || "사진을 보냈어요."}
        onClose={() => setPreviewMessage(null)}
        onDownload={() => void downloadPreviewPhoto()}
        onShare={() => void sharePreviewPhoto()}
        isDownloading={isDownloading}
        isSharing={isSharing}
        testID="family-chat-image-preview"
      />
    </View>
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date);
}

function mergeTargetFamilyChatMessage(
  messages: FamilyChatMessageCard[],
  targetMessage: FamilyChatMessageCard | null,
) {
  if (!targetMessage) {
    return messages;
  }

  return [...messages.filter((message) => message.id !== targetMessage.id), targetMessage]
    .sort(compareNewestFamilyChatMessage);
}

function compareNewestFamilyChatMessage(left: FamilyChatMessageCard, right: FamilyChatMessageCard) {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.id - left.id;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 390 : undefined,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: border,
    paddingHorizontal: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: text,
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: "800",
  },
  messageScroll: {
    flex: 1,
  },
  chatViewportClip: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  chatViewport: {
    flex: 1,
    minHeight: 0,
  },
  messageContent: {
    flexGrow: 1,
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: {
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingTop: 34,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowTarget: {
    borderWidth: 1,
    borderColor: primary,
    borderRadius: 12,
    backgroundColor: brandColors.tint,
    padding: 8,
  },
  targetErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3C96B",
    backgroundColor: "#FFF8E8",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  targetErrorText: {
    flex: 1,
    color: text,
    fontSize: 12,
    lineHeight: 17,
  },
  targetRetryButton: {
    borderRadius: 999,
    backgroundColor: primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  targetRetryText: {
    color: brandColors.onAction,
    fontSize: 12,
    fontWeight: "700",
  },
  messageColumn: {
    maxWidth: "86%",
    gap: 4,
  },
  messageColumnMine: {
    alignItems: "flex-end",
  },
  senderName: {
    marginLeft: 38,
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
  },
  incomingMessageBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  incomingMessageContent: {
    flexShrink: 1,
    gap: 4,
  },
  messageBubble: {
    alignSelf: "flex-start",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageBubbleFamily: {
    backgroundColor: soft,
  },
  messageBubbleMine: {
    backgroundColor: primary,
  },
  messageText: {
    color: "#334155",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  messageTextMine: {
    color: "#FFFFFF",
  },
  messageImage: {
    width: 190,
    height: 160,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
  },
  messageMeta: {
    color: "#94A3B8",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "600",
  },
  messageMetaMine: {
    textAlign: "right",
  },
  composerFrame: {
    flexShrink: 0,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 10,
    elevation: 10,
  },
  selectedImageRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 8,
    backgroundColor: soft,
    padding: 6,
  },
  selectedImage: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
  },
  selectedImageText: {
    flex: 1,
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
  },
  removeImageButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  removeImageText: {
    color: "#E11D48",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
  },
  composerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerIconButton: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F4FBFA",
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 104,
    borderRadius: 8,
    backgroundColor: soft,
    color: text,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: brandColors.action,
  },
  sendButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
});
