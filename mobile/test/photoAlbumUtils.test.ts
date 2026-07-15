import assert from "node:assert/strict";
import test from "node:test";

import type { FamilyPhotoCard } from "../src/api";
import {
  isDirectFamilyAlbumPhoto,
  removeDeletedAlbumPhotos,
  togglePhotoSelection,
} from "../src/features/shared/photoAlbumUtils";

function familyPhoto(overrides: Partial<FamilyPhotoCard> = {}): FamilyPhotoCard {
  return {
    id: "family-photo-1",
    source: "ALBUM",
    sourceId: 1,
    imageUrl: "https://example.com/photo.jpg",
    caption: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    createdById: 10,
    createdByName: "엄마",
    ...overrides,
  };
}

test("직접 올린 앨범 사진은 업로더만 삭제 대상으로 선택할 수 있다", () => {
  const ownPhoto = familyPhoto();
  const otherPhoto = familyPhoto({ id: "family-photo-2", sourceId: 2, createdById: 11, createdByName: "아빠" });
  const recordAttachment = familyPhoto({
    id: "record-attachment-3",
    source: "RECORD_ATTACHMENT",
    sourceId: 3,
    createdById: 10,
  });

  assert.equal(isDirectFamilyAlbumPhoto(ownPhoto, 10), true);
  assert.equal(isDirectFamilyAlbumPhoto(otherPhoto, 10), false);
  assert.equal(isDirectFamilyAlbumPhoto(recordAttachment, 10), false);
});

test("사진 선택은 다시 누르면 해제되고 중복 선택되지 않는다", () => {
  assert.deepEqual(togglePhotoSelection([], 4), [4]);
  assert.deepEqual(togglePhotoSelection([4], 4), []);
  assert.deepEqual(togglePhotoSelection([2, 4], 6), [2, 4, 6]);
});

test("삭제된 직접 앨범 사진만 목록에서 제거하고 같은 숫자 ID의 기록 첨부 사진은 유지한다", () => {
  const directPhoto = familyPhoto({ id: "family-photo-5", sourceId: 5 });
  const recordAttachment = familyPhoto({
    id: "record-attachment-5",
    source: "RECORD_ATTACHMENT",
    sourceId: 5,
  });

  const remaining = removeDeletedAlbumPhotos([directPhoto, recordAttachment], [5]);

  assert.deepEqual(remaining.map((photo) => photo.id), ["record-attachment-5"]);
});
