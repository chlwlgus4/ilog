import { useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ProfileAvatar } from "./ProfileAvatar";
import { RecordIcon } from "./RecordIcon";

export function ProfileImageField({
  imageUrl,
  size = 88,
  editable = true,
  onChangeImage,
  testID,
}: {
  imageUrl?: string | null;
  size?: number;
  editable?: boolean;
  onChangeImage?: (imageUrl: string | null) => void;
  testID?: string;
}) {
  const trimmedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pickImage() {
    if (!editable || !onChangeImage) {
      return;
    }

    try {
      const nextImageUrl = await pickOptimizedWebImage();

      if (nextImageUrl) {
        onChangeImage(nextImageUrl);
        setMessage(null);
      } else if (Platform.OS !== "web") {
        setMessage("현재 환경에서는 이미지 선택을 지원하지 않아요.");
      }
    } catch {
      setMessage("이미지를 불러오지 못했어요.");
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.avatarWrap, { width: size, height: size }]}>
        <Pressable
          onPress={() => {
            if (trimmedImageUrl) {
              setPreviewOpen(true);
            }
          }}
          accessibilityRole="imagebutton"
          accessibilityLabel="프로필 이미지 크게 보기"
          testID={testID ? `${testID}-preview` : undefined}
        >
          <ProfileAvatar size={size} imageUrl={trimmedImageUrl} />
        </Pressable>
        {editable ? (
          <Pressable
            style={styles.cameraButton}
            onPress={pickImage}
            accessibilityRole="button"
            accessibilityLabel="프로필 이미지 등록"
            testID={testID ? `${testID}-pick` : undefined}
          >
            <RecordIcon name="camera" size={15} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)} testID={testID ? `${testID}-modal` : undefined}>
          <Image source={{ uri: trimmedImageUrl }} style={styles.previewImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </View>
  );
}

async function pickOptimizedWebImage() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return null;
  }

  const file = await pickFile();

  if (!file) {
    return null;
  }

  return optimizeImageFile(file);
}

function pickFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function optimizeImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("Failed to load image"));
      image.onload = () => {
        const maxSize = 512;
        const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const width = Math.max(Math.round(image.width * ratio), 1);
        const height = Math.max(Math.round(image.height * ratio), 1);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Canvas is not supported"));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const webp = canvas.toDataURL("image/webp", 0.78);

        if (webp.startsWith("data:image/webp")) {
          resolve(webp);
          return;
        }

        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 8,
  },
  avatarWrap: {
    position: "relative",
  },
  cameraButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#4DB6AC",
  },
  message: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  previewBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    padding: 24,
  },
  previewImage: {
    width: "100%",
    maxWidth: 360,
    height: "70%",
    borderRadius: 18,
  },
});
