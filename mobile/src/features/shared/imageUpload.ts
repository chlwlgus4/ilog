import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

import type { UploadImageRequest } from "../../api";

export const MAX_FAMILY_MEDIA_BYTES = 6 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_EDGE = 1600;
const IMAGE_UPLOAD_REENCODE_THRESHOLD_BYTES = 1_200_000;

export async function imagePickerAssetToUpload(asset: ImagePickerAsset): Promise<UploadImageRequest> {
  const sourceFile = isWebRuntime() ? asset.file ?? null : asset.file ?? new File(asset.uri);
  const sourceSize = asset.fileSize ?? sourceFile?.size ?? 0;

  if (sourceSize > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("사진은 24MB 이하만 선택해 주세요.");
  }

  const optimized = !isWebRuntime() && shouldOptimizeImage(asset, sourceSize)
    ? await optimizeImage(asset)
    : {
        bytes: await readSourceImageBytes(asset, sourceFile),
        fileName: asset.fileName ?? sourceFile?.name ?? filenameFromUri(asset.uri),
        mimeType: asset.mimeType ?? "image/jpeg",
      };
  const bytes = optimized.bytes;

  if (bytes.byteLength === 0) {
    throw new Error("선택한 사진 파일을 읽지 못했어요.");
  }
  if (bytes.byteLength > MAX_FAMILY_MEDIA_BYTES) {
    throw new Error("사진은 6MB 이하만 업로드할 수 있어요.");
  }

  return {
    bytes,
    fileName: optimized.fileName,
    mimeType: optimized.mimeType,
  };
}

async function readSourceImageBytes(asset: ImagePickerAsset, sourceFile: ImagePickerAsset["file"] | File | null) {
  if (sourceFile) {
    return sourceFile.arrayBuffer();
  }

  return readWebImageBytes(asset.uri);
}

function shouldOptimizeImage(asset: ImagePickerAsset, sourceSize: number) {
  const longestEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const mimeType = asset.mimeType?.toLowerCase() ?? "";

  return longestEdge > IMAGE_UPLOAD_MAX_EDGE || sourceSize > IMAGE_UPLOAD_REENCODE_THRESHOLD_BYTES || mimeType === "image/heic" || mimeType === "image/heif";
}

async function optimizeImage(asset: ImagePickerAsset) {
  const longestEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const context = ImageManipulator.manipulate(asset.uri);

  try {
    if (longestEdge > IMAGE_UPLOAD_MAX_EDGE) {
      context.resize(
        asset.width >= asset.height
          ? { width: IMAGE_UPLOAD_MAX_EDGE }
          : { height: IMAGE_UPLOAD_MAX_EDGE },
      );
    }

    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        compress: 0.78,
        format: SaveFormat.JPEG,
      });

      return {
        bytes: await readOptimizedImageBytes(saved.uri),
        fileName: withJpegExtension(asset.fileName ?? filenameFromUri(asset.uri)),
        mimeType: "image/jpeg",
      };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

async function readOptimizedImageBytes(uri: string) {
  if (isWebRuntime()) {
    return readWebImageBytes(uri);
  }

  return new File(uri).arrayBuffer();
}

function isWebRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function readWebImageBytes(uri: string) {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error("선택한 사진 파일을 읽지 못했어요.");
  }

  return response.arrayBuffer();
}

function filenameFromUri(uri: string) {
  const name = uri.split("/").pop()?.split("?")[0]?.trim();
  return name || "family-photo.jpg";
}

function withJpegExtension(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return `${stem || "family-photo"}.jpg`;
}
