import type { FamilyPhotoCard } from "../../api";

export const MAX_FAMILY_ALBUM_UPLOADS = 10;
export const PHOTO_ALBUM_OPERATION_CONCURRENCY = 3;

export function isDirectFamilyAlbumPhoto(photo: FamilyPhotoCard, caregiverId: number | null) {
  return photo.source === "ALBUM" && photo.createdById != null && photo.createdById === caregiverId;
}

export function togglePhotoSelection(selectedPhotoIds: number[], photoId: number) {
  return selectedPhotoIds.includes(photoId)
    ? selectedPhotoIds.filter((selectedPhotoId) => selectedPhotoId !== photoId)
    : [...selectedPhotoIds, photoId];
}

export function removeDeletedAlbumPhotos(photos: FamilyPhotoCard[], deletedPhotoIds: number[]) {
  return photos.filter((photo) => photo.source !== "ALBUM" || !deletedPhotoIds.includes(photo.sourceId));
}

export async function runPhotoAlbumOperations<T, Result>(
  items: readonly T[],
  operation: (item: T, index: number) => Promise<Result>,
  concurrency = PHOTO_ALBUM_OPERATION_CONCURRENCY,
) {
  const results = new Array<PromiseSettledResult<Result>>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          status: "fulfilled",
          value: await operation(items[index], index),
        };
      } catch (reason) {
        results[index] = {
          status: "rejected",
          reason,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
