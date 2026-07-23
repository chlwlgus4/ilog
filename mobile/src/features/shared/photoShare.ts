import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

import type { FamilyPhotoCard } from "../../api";
import { photoDownloadFileName } from "./photoDownloadUtils";
import { imageMimeType, isLocalImageUri } from "./photoShareUtils";

type ShareablePhoto = Pick<FamilyPhotoCard, "id" | "imageUrl" | "createdAt">;

export async function shareFamilyPhoto(photo: ShareablePhoto) {
  if (Platform.OS === "web") {
    await Share.share({
      title: "아이로그 사진",
      message: photo.imageUrl,
      url: photo.imageUrl,
    });
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("이 기기에서는 사진 공유 기능을 사용할 수 없어요.");
  }

  if (isLocalImageUri(photo.imageUrl)) {
    await Sharing.shareAsync(photo.imageUrl, {
      dialogTitle: "사진 공유",
      mimeType: imageMimeType(photo.imageUrl),
    });
    return;
  }

  const directory = new Directory(Paths.cache, "ilog-photo-sharing");
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, photoDownloadFileName(photo, 0));

  if (destination.exists) {
    destination.delete();
  }

  let sharedFile: File | null = null;

  try {
    sharedFile = await File.downloadFileAsync(photo.imageUrl, destination);
    await Sharing.shareAsync(sharedFile.uri, {
      dialogTitle: "사진 공유",
      mimeType: imageMimeType(sharedFile.name),
    });
  } finally {
    if (sharedFile?.exists) {
      sharedFile.delete();
    }
  }
}
