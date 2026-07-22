import * as ImagePicker from "expo-image-picker";

import { createFamilyPhoto, type FamilyPhotoCard } from "../../api";
import { imagePickerAssetToUpload } from "./imageUpload";
import {
  MAX_FAMILY_ALBUM_UPLOADS,
  PHOTO_ALBUM_OPERATION_CONCURRENCY,
  runPhotoAlbumOperations,
  summarizePhotoAlbumUploadResults,
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

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("사진 접근 권한을 허용해 주세요.");
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
  const results = await runPhotoAlbumOperations(
    assets,
    async (asset) =>
      createFamilyPhoto(familyId, {
        image: await imagePickerAssetToUpload(asset),
      }),
    PHOTO_ALBUM_OPERATION_CONCURRENCY,
  );

  return summarizePhotoAlbumUploadResults<FamilyPhotoCard>(results);
}
