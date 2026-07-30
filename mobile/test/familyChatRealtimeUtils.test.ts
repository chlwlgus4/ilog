import assert from "node:assert/strict";
import test from "node:test";

import {
  familyChatRealtimeFilter,
  parseFamilyChatRealtimeInsert,
} from "../src/serverless/familyChatRealtimeUtils";

test("가족 채팅 Realtime 구독은 대상 가족 ID로만 필터링한다", () => {
  assert.equal(familyChatRealtimeFilter(42), "family_id=eq.42");
});

test("대상 가족의 정상적인 Realtime INSERT만 메시지로 수용한다", () => {
  const row = { id: 11, family_id: 42, sender_caregiver_id: 7 };

  assert.deepEqual(parseFamilyChatRealtimeInsert(42, row), row);
});

test("다른 가족 또는 손상된 Realtime payload는 채팅 목록에 반영하지 않는다", () => {
  assert.equal(parseFamilyChatRealtimeInsert(42, { id: 11, family_id: 43, sender_caregiver_id: 7 }), null);
  assert.equal(parseFamilyChatRealtimeInsert(42, { id: "11", family_id: 42, sender_caregiver_id: 7 }), null);
  assert.equal(parseFamilyChatRealtimeInsert(42, { id: 11, family_id: 42, sender_caregiver_id: 7.5 }), null);
  assert.equal(parseFamilyChatRealtimeInsert(42, null), null);
});
