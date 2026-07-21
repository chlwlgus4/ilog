import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

import type { FamilyPhotoCard } from "../../api";
import { PHOTO_ALBUM_OPERATION_CONCURRENCY, runPhotoAlbumOperations } from "./photoAlbumUtils";
import { photoDownloadFileName } from "./photoDownloadUtils";

type PhotoDownloadFailure = {
  photo: FamilyPhotoCard;
  message: string;
};

export type PhotoDownloadResult = {
  downloadedCount: number;
  failures: PhotoDownloadFailure[];
};

export async function downloadFamilyPhotos(photos: readonly FamilyPhotoCard[]): Promise<PhotoDownloadResult> {
  if (photos.length === 0) {
    return { downloadedCount: 0, failures: [] };
  }

  if (Platform.OS === "web") {
    return downloadPhotosOnWeb(photos);
  }

  const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);

  if (!permission.granted) {
    throw new Error("사진을 저장하려면 사진 보관함 접근 권한을 허용해 주세요.");
  }

  const directory = new Directory(Paths.cache, "ilog-photo-downloads");
  directory.create({ idempotent: true, intermediates: true });
  const results = await runPhotoAlbumOperations(
    photos,
    async (photo, index) => {
      const destination = new File(directory, photoDownloadFileName(photo, index));

      if (destination.exists) {
        destination.delete();
      }

      let downloadedFile: File | null = null;

      try {
        downloadedFile = await File.downloadFileAsync(photo.imageUrl, destination);
        await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      } finally {
        if (downloadedFile?.exists) {
          downloadedFile.delete();
        }
      }
    },
    PHOTO_ALBUM_OPERATION_CONCURRENCY,
  );

  return summarizePhotoDownloads(photos, results);
}

async function downloadPhotosOnWeb(photos: readonly FamilyPhotoCard[]): Promise<PhotoDownloadResult> {
  const results = await runPhotoAlbumOperations(
    photos,
    async (photo, index) => {
      const response = await fetch(photo.imageUrl);

      if (!response.ok) {
        throw new Error("사진 파일을 내려받지 못했어요.");
      }

      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = photoDownloadFileName(photo, index);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    },
    PHOTO_ALBUM_OPERATION_CONCURRENCY,
  );

  return summarizePhotoDownloads(photos, results);
}

function summarizePhotoDownloads(
  photos: readonly FamilyPhotoCard[],
  results: readonly PromiseSettledResult<void>[],
): PhotoDownloadResult {
  const failures: PhotoDownloadFailure[] = [];
  let downloadedCount = 0;

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      downloadedCount += 1;
      continue;
    }

    failures.push({
      photo: photos[index],
      message: result.reason instanceof Error ? result.reason.message : "사진을 저장하지 못했어요.",
    });
  }

  return { downloadedCount, failures };
}
