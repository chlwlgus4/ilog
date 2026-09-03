import * as ImagePicker from "expo-image-picker";

import { createFamilyPhoto, fetchPhotoAlbum, type FamilyPhotoCard } from "../../api";
import { imagePickerAssetToUpload } from "./imageUpload";
import {
  MAX_FAMILY_ALBUM_UPLOADS,
  PHOTO_ALBUM_OPERATION_CONCURRENCY,
  runPhotoAlbumOperations,
} from "./photoAlbumUtils";

export type FamilyPhotoPickerSource = "camera" | "library";

export async function pickFamilyPhotoAssets(source: FamilyPhotoPickerSource) {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      throw new Error("사진 촬영을 위해 카메라 권한을 허용해 주세요.");
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    return result.canceled ? [] : result.assets?.slice(0, 1) ?? [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: MAX_FAMILY_ALBUM_UPLOADS,
    orderedSelection: true,
    quality: 0.85,
  });

  return result.canceled ? [] : result.assets?.slice(0, MAX_FAMILY_ALBUM_UPLOADS) ?? [];
}

export async function uploadFamilyPhotoAssets(
  familyId: number,
  assets: readonly ImagePicker.ImagePickerAsset[],
) {
  const results = await runPhotoAlbumOperations<
    ImagePicker.ImagePickerAsset,
    Awaited<ReturnType<typeof createFamilyPhoto>>
  >(
    assets,
    async (asset) =>
      createFamilyPhoto(familyId, {
        image: await imagePickerAssetToUpload(asset),
      }),
    PHOTO_ALBUM_OPERATION_CONCURRENCY,
  );

  const uploadedPhotos: FamilyPhotoCard[] = [];
  const committedPhotoIds: number[] = [];
  const failedMessages: string[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      failedMessages.push(result.reason instanceof Error ? result.reason.message : "사진을 업로드하지 못했어요.");
      continue;
    }

    if (result.value.kind === "ready") {
      uploadedPhotos.push(result.value.photo);
    } else {
      committedPhotoIds.push(result.value.photoId);
    }
  }

  let previewRefreshRequired = committedPhotoIds.length;

  if (committedPhotoIds.length > 0) {
    try {
      const refreshedPhotos = await fetchPhotoAlbum(familyId, { force: true });
      const committedPhotoIdSet = new Set(committedPhotoIds);
      const recoveredPhotos = refreshedPhotos.filter(
        (photo) => photo.source === "ALBUM" && committedPhotoIdSet.has(photo.sourceId),
      );
      const uploadedPhotoIdSet = new Set(
        uploadedPhotos
          .filter((photo) => photo.source === "ALBUM")
          .map((photo) => photo.sourceId),
      );

      for (const photo of recoveredPhotos) {
        if (!uploadedPhotoIdSet.has(photo.sourceId)) {
          uploadedPhotos.push(photo);
          uploadedPhotoIdSet.add(photo.sourceId);
        }
      }

      const recoveredPhotoIdSet = new Set(recoveredPhotos.map((photo) => photo.sourceId));
      previewRefreshRequired = committedPhotoIds.filter((photoId) => !recoveredPhotoIdSet.has(photoId)).length;
    } catch {
      // The database rows and Storage objects are already committed. Keep them
      // counted as saved and let the album's normal reload recover previews.
    }
  }

  return {
    uploadedPhotos,
    failedMessages,
    savedPhotoCount: results.length - failedMessages.length,
    previewRefreshRequired,
  };
}
