import type { FamilyPhotoCard } from "../../api";

export const MAX_FAMILY_ALBUM_UPLOADS = 10;
export const PHOTO_ALBUM_OPERATION_CONCURRENCY = 3;

export type PhotoAlbumGrouping = "year" | "month" | "day";

export type PhotoAlbumPhotoGroup = {
  key: string;
  label: string;
  photos: FamilyPhotoCard[];
};

export function isDirectFamilyAlbumPhoto(photo: FamilyPhotoCard, caregiverId: number | null) {
  return photo.source === "ALBUM" && photo.createdById != null && photo.createdById === caregiverId;
}

export function togglePhotoSelection<T extends string | number>(selectedPhotoIds: readonly T[], photoId: T): T[] {
  return selectedPhotoIds.includes(photoId)
    ? selectedPhotoIds.filter((selectedPhotoId) => selectedPhotoId !== photoId)
    : [...selectedPhotoIds, photoId];
}

export function removeDeletedAlbumPhotos(photos: FamilyPhotoCard[], deletedPhotoIds: number[]) {
  return photos.filter((photo) => photo.source !== "ALBUM" || !deletedPhotoIds.includes(photo.sourceId));
}

export function groupPhotoAlbumPhotos(photos: FamilyPhotoCard[], grouping: PhotoAlbumGrouping) {
  const groups = new Map<string, PhotoAlbumPhotoGroup>();

  for (const photo of photos) {
    const bucket = photoAlbumDateBucket(photo.createdAt, grouping);
    const group = groups.get(bucket.key);

    if (group) {
      group.photos.push(photo);
      continue;
    }

    groups.set(bucket.key, {
      ...bucket,
      photos: [photo],
    });
  }

  return [...groups.values()];
}

function photoAlbumDateBucket(value: string, grouping: PhotoAlbumGrouping) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { key: `${grouping}-unknown`, label: "날짜 없음" };
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (grouping === "year") {
    return { key: `year-${year}`, label: `${year}년` };
  }

  if (grouping === "month") {
    return { key: `month-${year}-${`${month}`.padStart(2, "0")}`, label: `${year}년 ${month}월` };
  }

  return {
    key: `day-${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`,
    label: `${year}년 ${month}월 ${day}일`,
  };
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
