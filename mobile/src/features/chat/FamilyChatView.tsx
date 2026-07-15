import { useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CaregiverSummary, CreateFamilyChatMessageRequest, FamilyChatMessageCard } from "../../api";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import { FamilyImagePreviewModal } from "../shared/FamilyImagePreviewModal";
import { imagePickerAssetToUpload } from "../shared/imageUpload";
import { RecordIcon } from "../shared/RecordIcon";
import { familyChatComposerContentPaddingBottom, resolveFamilyChatComposerBottom } from "./familyChatComposerLayout";
import { appendFamilyChatMention, messagePreview, shouldShowFamilyChatMessageTime } from "./familyChatUtils";
import { FONT_FAMILY } from "../../typography";

const primary = "#4DB6AC";
const text = "#111827";
const muted = "#64748B";
const border = "#E3EAF2";
const soft = "#F8FAFC";

type FamilyChatViewProps = {
  messages: FamilyChatMessageCard[] | null;
  caregivers: CaregiverSummary[];
  currentCaregiverId: number | null;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (payload: CreateFamilyChatMessageRequest) => Promise<void>;
};

export function FamilyChatView({
  messages,
  caregivers,
  currentCaregiverId,
  sending,
  error,
  onBack,
  onSend,
}: FamilyChatViewProps) {
  const [body, setBody] = useState("");
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<FamilyChatMessageCard | null>(null);
  const keyboardInset = useKeyboardInset();
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const orderedMessages = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const mentionableCaregivers = caregivers.filter((caregiver) => caregiver.id !== currentCaregiverId);
  const canSend = Boolean(body.trim() || image) && !sending;
  const composerBottom = resolveFamilyChatComposerBottom({ keyboardInset, bottomSafeAreaInset });

  async function pickImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setLocalError("사진 접근 권한을 허용해 주세요.");
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
        setLocalError(null);
      }
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : "사진을 선택하지 못했어요.");
    }
  }

  async function send() {
    if (!canSend) {
      return;
    }

    try {
      setLocalError(null);
      await onSend({
        body,
        image: image ? await imagePickerAssetToUpload(image) : null,
      });
      setBody("");
      setImage(null);
    } catch (sendError) {
      setLocalError(sendError instanceof Error ? sendError.message : "가족 메시지를 보내지 못했어요.");
    }
  }

  return (
    <View style={styles.screen} testID="screen-family-chat">
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack} accessibilityRole="button" testID="family-chat-back">
          <RecordIcon name="back-arrow" size={22} color="#1F2937" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} pointerEvents="none">가족 대화</Text>
        <View style={styles.headerButton} />
      </View>

      {mentionableCaregivers.length > 0 ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.mentionList}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          testID="family-chat-mentions">
          {mentionableCaregivers.map((caregiver) => (
            <Pressable
              key={caregiver.id}
              style={styles.mentionChip}
              onPress={() => setBody((current) => appendFamilyChatMention(current, caregiver.name))}
              accessibilityRole="button"
              testID={`family-chat-mention-${caregiver.id}`}>
              <Text style={styles.mentionChipText}>@{caregiver.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        style={styles.messageScroll}
        contentContainerStyle={[
          styles.messageContent,
          { paddingBottom: familyChatComposerContentPaddingBottom(composerBottom) },
        ]}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="family-chat-messages">
        {messages == null ? (
          <Text style={styles.emptyText}>가족 대화를 준비하는 중이에요.</Text>
        ) : orderedMessages.length === 0 ? (
          <Text style={styles.emptyText}>첫 번째 가족 메시지를 남겨 보세요.</Text>
        ) : (
          orderedMessages.map((message, index) => {
            const isMine = message.senderId === currentCaregiverId;
            const shouldShowTime = shouldShowFamilyChatMessageTime(message, orderedMessages[index + 1]);

            return (
              <View key={message.id} style={[styles.messageRow, isMine && styles.messageRowMine]} testID={`family-chat-message-${message.id}`}>
                {!isMine ? <Avatar name={message.senderName} /> : null}
                <View style={[styles.messageColumn, isMine && styles.messageColumnMine]}>
                  {!isMine ? <Text style={styles.senderName}>{message.senderName}</Text> : null}
                  <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleFamily]}>
                    {message.imageUrl ? (
                      <Pressable
                        onPress={() => setPreviewMessage(message)}
                        accessibilityRole="button"
                        accessibilityLabel={`${message.senderName}님이 보낸 사진 전체보기`}
                        testID={`family-chat-image-${message.id}`}>
                        <Image source={{ uri: message.imageUrl }} style={styles.messageImage} resizeMode="cover" />
                      </Pressable>
                    ) : null}
                    {message.body ? <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{message.body}</Text> : null}
                  </View>
                  {shouldShowTime ? (
                    <Text style={[styles.messageMeta, isMine && styles.messageMetaMine]} testID={`family-chat-time-${message.id}`}>
                      {formatMessageTime(message.createdAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.composerFrame, { bottom: composerBottom }]} testID="family-chat-composer">
        {image ? (
          <View style={styles.selectedImageRow}>
            <Image source={{ uri: image.uri }} style={styles.selectedImage} resizeMode="cover" />
            <Text style={styles.selectedImageText}>{messagePreview("", true)}</Text>
            <Pressable style={styles.removeImageButton} onPress={() => setImage(null)} accessibilityRole="button" testID="family-chat-remove-image">
              <Text style={styles.removeImageText}>취소</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <Pressable style={styles.composerIconButton} onPress={() => void pickImage()} accessibilityRole="button" testID="family-chat-pick-image">
            <RecordIcon name="photo-album" size={22} color={primary} strokeWidth={2} />
          </Pressable>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="가족에게 메시지 보내기"
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
            testID="family-chat-send">
            <RecordIcon name="send" size={20} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        </View>
        {localError ?? error ? <Text style={styles.errorText}>{localError ?? error}</Text> : null}
      </View>

      <FamilyImagePreviewModal
        visible={Boolean(previewMessage)}
        imageUrl={previewMessage?.imageUrl ?? null}
        title={previewMessage ? `${previewMessage.senderName}님의 사진` : undefined}
        subtitle={previewMessage?.body || "사진을 보냈어요."}
        onClose={() => setPreviewMessage(null)}
        testID="family-chat-image-preview"
      />
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.trim().slice(0, 1) || "가"}</Text>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: "100%",
    maxWidth: 390,
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
  mentionList: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mentionChip: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFE4DF",
    backgroundColor: "#F4FBFA",
    paddingHorizontal: 10,
  },
  mentionChipText: {
    color: "#16877D",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
  },
  messageScroll: {
    flex: 1,
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
    alignItems: "flex-end",
    gap: 8,
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#E7F6F3",
  },
  avatarText: {
    color: "#16877D",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "800",
  },
  messageColumn: {
    maxWidth: "78%",
    gap: 4,
  },
  messageColumnMine: {
    alignItems: "flex-end",
  },
  senderName: {
    color: muted,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
  },
  messageBubble: {
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
    position: "absolute",
    right: 0,
    left: 0,
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
    backgroundColor: primary,
  },
  sendButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  errorText: {
    color: "#DC2626",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "600",
  },
});
