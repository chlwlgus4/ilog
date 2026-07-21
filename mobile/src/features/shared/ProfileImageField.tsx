import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FamilyImagePreviewModal } from "./FamilyImagePreviewModal";
import { ProfileAvatar } from "./ProfileAvatar";
import { RecordIcon } from "./RecordIcon";

const PROFILE_IMAGE_MAX_EDGE = 512;

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
  const [picking, setPicking] = useState(false);

  async function pickImage() {
    if (!editable || !onChangeImage || picking) {
      return;
    }

    try {
      setPicking(true);
      const nextImageUrl = await pickProfileImage();

      if (nextImageUrl) {
        onChangeImage(nextImageUrl);
        setMessage(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이미지를 불러오지 못했어요.");
    } finally {
      setPicking(false);
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
            disabled={picking}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={picking ? "프로필 이미지 준비 중" : "프로필 이미지 등록"}
            testID={testID ? `${testID}-pick` : undefined}
          >
            <RecordIcon name="camera" size={15} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FamilyImagePreviewModal
        visible={previewOpen}
        imageUrl={trimmedImageUrl || null}
        title="프로필 사진"
        onClose={() => setPreviewOpen(false)}
        testID={testID ? `${testID}-modal` : "profile-image-modal"}
      />
    </View>
  );
}

async function pickProfileImage() {
  if (Platform.OS === "web") {
    return pickOptimizedWebImage();
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("사진 접근 권한을 허용해 주세요.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });
  const asset = result.assets?.[0];

  if (result.canceled || !asset) {
    return null;
  }

  return optimizeNativeImage(asset.uri, asset.width, asset.height);
}

async function optimizeNativeImage(uri: string, width: number, height: number) {
  const context = ImageManipulator.manipulate(uri);
  const longestEdge = Math.max(width, height);

  try {
    if (longestEdge > PROFILE_IMAGE_MAX_EDGE) {
      context.resize(width >= height ? { width: PROFILE_IMAGE_MAX_EDGE } : { height: PROFILE_IMAGE_MAX_EDGE });
    }

    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        base64: true,
        compress: 0.78,
        format: SaveFormat.JPEG,
      });

      if (!saved.base64) {
        throw new Error("이미지를 준비하지 못했어요.");
      }

      return `data:image/jpeg;base64,${saved.base64}`;
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

async function pickOptimizedWebImage() {
  if (typeof document === "undefined") {
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
    overflow: "visible",
  },
  cameraButton: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#4DB6AC",
    elevation: 3,
    zIndex: 1,
  },
  message: {
    color: "#64748B",
    maxWidth: 180,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
});
