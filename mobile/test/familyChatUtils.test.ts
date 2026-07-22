import assert from "node:assert/strict";
import test from "node:test";

import {
  newestFirstFamilyChatMessages,
  messagePreview,
  prependFamilyChatMessage,
  shouldShowFamilyChatMessageTime,
} from "../src/features/chat/familyChatUtils";

test("사진만 보낸 메시지는 사진 미리보기 문구를 사용한다", () => {
  assert.equal(messagePreview("", true), "사진을 보냈어요.");
  assert.equal(messagePreview("확인해 주세요", true), "확인해 주세요");
});

test("전송 중인 메시지는 역방향 채팅 목록의 맨 앞에 표시한다", () => {
  const existing = [
    {
      id: 2,
      senderId: 10,
      senderName: "엄마",
      senderRole: "MOM" as const,
      body: "가장 최근 서버 메시지",
      imageUrl: null,
      createdAt: "2026-07-21T10:01:00.000Z",
    },
    {
      id: 1,
      senderId: 11,
      senderName: "아빠",
      senderRole: "DAD" as const,
      body: "이전 서버 메시지",
      imageUrl: null,
      createdAt: "2026-07-21T10:00:00.000Z",
    },
  ];
  const pending = [
    {
      ...existing[0],
      id: -1,
      body: "방금 보낸 메시지",
      createdAt: "2026-07-21T10:02:00.000Z",
    },
  ];

  assert.deepEqual(
    newestFirstFamilyChatMessages(existing, pending).map((message) => message.id),
    [-1, 2, 1],
  );
});

test("여러 전송 대기 메시지도 가장 최근 메시지부터 정렬한다", () => {
  const pending = [
    {
      id: -1,
      senderId: 10,
      senderName: "엄마",
      senderRole: "MOM" as const,
      body: "먼저 보낸 메시지",
      imageUrl: null,
      createdAt: "2026-07-21T10:02:00.000Z",
    },
    {
      id: -2,
      senderId: 10,
      senderName: "엄마",
      senderRole: "MOM" as const,
      body: "나중에 보낸 메시지",
      imageUrl: null,
      createdAt: "2026-07-21T10:03:00.000Z",
    },
  ];

  assert.deepEqual(
    newestFirstFamilyChatMessages([], pending).map((message) => message.id),
    [-2, -1],
  );
});

test("같은 사람이 같은 분에 연속으로 보낸 메시지는 마지막 메시지에만 시간을 표시한다", () => {
  const firstMessage = {
    id: 1,
    senderId: 10,
    senderName: "엄마",
    senderRole: "MOM" as const,
    body: "첫 번째 메시지",
    imageUrl: null,
    createdAt: "2026-07-14T10:00:05.000Z",
  };
  const secondMessage = {
    ...firstMessage,
    id: 2,
    body: "두 번째 메시지",
    createdAt: "2026-07-14T10:00:40.000Z",
  };
  const nextMinuteMessage = {
    ...secondMessage,
    id: 3,
    createdAt: "2026-07-14T10:01:00.000Z",
  };
  const otherCaregiverMessage = {
    ...secondMessage,
    id: 4,
    senderId: 11,
    senderName: "아빠",
    senderRole: "DAD" as const,
  };

  assert.equal(shouldShowFamilyChatMessageTime(firstMessage, secondMessage), false);
  assert.equal(shouldShowFamilyChatMessageTime(secondMessage, undefined), true);
  assert.equal(shouldShowFamilyChatMessageTime(secondMessage, nextMinuteMessage), true);
  assert.equal(shouldShowFamilyChatMessageTime(secondMessage, otherCaregiverMessage), true);
});

test("저장한 가족 메시지는 재조회 전에 목록 맨 앞에 즉시 반영한다", () => {
  const family = { id: 1, name: "우리 가족", inviteCode: "ABCD", childName: "아이" };
  const existing = {
    id: 1,
    senderId: 2,
    senderName: "엄마",
    senderRole: "MOM" as const,
    body: "기존 메시지",
    imageUrl: null,
    createdAt: "2026-07-14T00:00:00.000Z",
  };
  const created = {
    ...existing,
    id: 2,
    body: "새 메시지",
  };

  const result = prependFamilyChatMessage({ family, messages: [existing] }, family, created);

  assert.deepEqual(result.messages.map((item) => item.id), [2, 1]);
  assert.equal(result.messages[0].body, "새 메시지");
});
