import assert from "node:assert/strict";
import test from "node:test";

import { photoDownloadFileName } from "../src/features/shared/photoDownloadUtils";

test("사진 다운로드 파일명은 URL 쿼리를 제외한 확장자와 사진 식별자를 유지한다", () => {
  assert.equal(
    photoDownloadFileName(
      {
        id: "record-attachment-12",
        imageUrl: "https://example.com/family/photo.webp?token=signed",
        createdAt: "2026-07-18T09:08:07.000Z",
      },
      1,
    ),
    "ilog-20260718090807-record-attachment-12-2.webp",
  );
});

test("사진 URL에 확장자가 없으면 안전한 JPEG 확장자를 사용한다", () => {
  assert.match(
    photoDownloadFileName(
      {
        id: "family photo/1",
        imageUrl: "https://example.com/file",
        createdAt: "invalid",
      },
      0,
    ),
    /^ilog-photo-family-photo-1-1\.jpg$/,
  );
});
