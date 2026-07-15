import type { FamilyPhotoCard } from "../../api";

export const MAX_FAMILY_ALBUM_UPLOADS = 10;

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
