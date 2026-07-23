import assert from "node:assert/strict";
import test from "node:test";

import { familyChatMessagePhoto } from "../src/features/chat/familyChatUtils";
import { visibleTaskDescription } from "../src/features/dashboard/dashboardTaskUtils";
import {
  duplicateFamilyNicknameMessage,
  duplicateNicknameErrorMessage,
} from "../src/features/shared/caregiverErrorMessages";
import { imageMimeType, isLocalImageUri } from "../src/features/shared/photoShareUtils";

test("가족 안에서 중복된 닉네임은 DB 오류 대신 안내 문구로 변환한다", () => {
  assert.equal(
    duplicateNicknameErrorMessage(
      new Error('duplicate key value violates unique constraint "caregivers_family_name_ci_key"'),
    ),
    duplicateFamilyNicknameMessage,
  );
  assert.equal(duplicateNicknameErrorMessage(new Error("network request failed")), null);
});

test("오늘 분담의 추가 메모는 내용이 있을 때만 표시한다", () => {
  assert.equal(visibleTaskDescription(null), null);
  assert.equal(visibleTaskDescription("   "), null);
  assert.equal(visibleTaskDescription("  기저귀 챙기기  "), "기저귀 챙기기");
});

test("채팅 이미지는 다운로드와 공유에 필요한 사진 정보로 변환한다", () => {
  const photo = familyChatMessagePhoto({
    id: 17,
    senderId: 3,
    senderName: "엄마",
    senderRole: "MOM",
    senderImageUrl: null,
    body: "오늘 사진",
    imageUrl: "https://example.com/family/photo.webp",
    createdAt: "2026-07-22T12:30:00.000Z",
  });

  assert.deepEqual(photo, {
    id: "chat-17",
    source: "ALBUM",
    sourceId: 17,
    imageUrl: "https://example.com/family/photo.webp",
    caption: "오늘 사진",
    createdAt: "2026-07-22T12:30:00.000Z",
    createdById: 3,
    createdByName: "엄마",
  });
  assert.equal(imageMimeType(photo?.imageUrl ?? ""), "image/webp");
  assert.equal(isLocalImageUri("file:///tmp/chat-photo.png"), true);
  assert.equal(isLocalImageUri("content://media/external/images/17"), true);
  assert.equal(isLocalImageUri(photo?.imageUrl ?? ""), false);
});
