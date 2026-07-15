import { File } from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";

import type { UploadImageRequest } from "../../api";

export const MAX_FAMILY_MEDIA_BYTES = 6 * 1024 * 1024;

export async function imagePickerAssetToUpload(asset: ImagePickerAsset): Promise<UploadImageRequest> {
  if (asset.fileSize != null && asset.fileSize > MAX_FAMILY_MEDIA_BYTES) {
    throw new Error("사진은 6MB 이하만 업로드할 수 있어요.");
  }

  const file = asset.file ?? new File(asset.uri);
  const bytes = await file.arrayBuffer();

  if (bytes.byteLength === 0) {
    throw new Error("선택한 사진 파일을 읽지 못했어요.");
  }
  if (bytes.byteLength > MAX_FAMILY_MEDIA_BYTES) {
    throw new Error("사진은 6MB 이하만 업로드할 수 있어요.");
  }

  return {
    bytes,
    fileName: asset.fileName ?? file.name ?? filenameFromUri(asset.uri),
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

function filenameFromUri(uri: string) {
  const name = uri.split("/").pop()?.split("?")[0]?.trim();
  return name || "family-photo.jpg";
}
