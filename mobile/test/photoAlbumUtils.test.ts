import assert from "node:assert/strict";
import test from "node:test";

import type { FamilyPhotoCard } from "../src/api";
import {
  groupPhotoAlbumPhotos,
  isDirectFamilyAlbumPhoto,
  removeDeletedAlbumPhotos,
  runPhotoAlbumOperations,
  summarizePhotoAlbumUploadResults,
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
  assert.deepEqual(togglePhotoSelection(["family-photo-4"], "record-attachment-4"), ["family-photo-4", "record-attachment-4"]);
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

test("사진 앨범은 기본 일 단위와 월, 년 단위로 사진을 분류한다", () => {
  const photos = [
    familyPhoto({ id: "family-photo-3", sourceId: 3, createdAt: "2026-07-17T10:00:00" }),
    familyPhoto({ id: "family-photo-2", sourceId: 2, createdAt: "2026-07-16T21:00:00" }),
    familyPhoto({ id: "family-photo-1", sourceId: 1, createdAt: "2026-06-30T08:00:00" }),
  ];

  assert.deepEqual(
    groupPhotoAlbumPhotos(photos, "day").map((group) => [group.label, group.photos.map((photo) => photo.id)]),
    [
      ["2026년 7월 17일", ["family-photo-3"]],
      ["2026년 7월 16일", ["family-photo-2"]],
      ["2026년 6월 30일", ["family-photo-1"]],
    ],
  );
  assert.deepEqual(
    groupPhotoAlbumPhotos(photos, "month").map((group) => [group.label, group.photos.map((photo) => photo.id)]),
    [
      ["2026년 7월", ["family-photo-3", "family-photo-2"]],
      ["2026년 6월", ["family-photo-1"]],
    ],
  );
  assert.deepEqual(
    groupPhotoAlbumPhotos(photos, "year").map((group) => [group.label, group.photos.map((photo) => photo.id)]),
    [["2026년", ["family-photo-3", "family-photo-2", "family-photo-1"]]],
  );
});

test("사진 업로드와 삭제 작업은 제한된 동시성으로 처리하고 입력 순서대로 결과를 반환한다", async () => {
  let activeCount = 0;
  let maximumActiveCount = 0;

  const results = await runPhotoAlbumOperations(
    ["first", "second", "third", "fourth"],
    async (item) => {
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      await new Promise((resolve) => setTimeout(resolve, item === "first" ? 20 : 5));
      activeCount -= 1;
      return item.toUpperCase();
    },
    2,
  );

  assert.equal(maximumActiveCount, 2);
  assert.deepEqual(
    results.map((result) => (result.status === "fulfilled" ? result.value : "failed")),
    ["FIRST", "SECOND", "THIRD", "FOURTH"],
  );
});

test("사진 업로드 결과는 성공 사진과 실패 사유를 분리한다", () => {
  const uploadedPhoto = familyPhoto();
  const summary = summarizePhotoAlbumUploadResults<FamilyPhotoCard>([
    { status: "fulfilled", value: uploadedPhoto },
    { status: "rejected", reason: new Error("업로드 제한 초과") },
    { status: "rejected", reason: "unknown" },
  ]);

  assert.deepEqual(summary.uploadedPhotos, [uploadedPhoto]);
  assert.deepEqual(summary.failedMessages, ["업로드 제한 초과", "사진을 업로드하지 못했어요."]);
});
