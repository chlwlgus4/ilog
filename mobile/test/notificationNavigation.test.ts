import assert from "node:assert/strict";
import test from "node:test";

import { recordAlarmRoute, resolveNotificationRoute } from "../src/notifications/notificationNavigation";

test("기록 알림은 기록 종류별 입력 화면으로 이동한다", () => {
  assert.equal(recordAlarmRoute("FEEDING"), "/feeding-add");
  assert.equal(recordAlarmRoute("SLEEP"), "/sleep-add");
  assert.equal(recordAlarmRoute("GROWTH"), "/growth-add");
});

test("업무, 기록 공유, 대화 알림은 해당 기능의 목록으로 이동한다", () => {
  assert.equal(resolveNotificationRoute({ taskId: 11 }), "/task-assignments");
  assert.equal(resolveNotificationRoute({ recordType: "vaccination" }), "/vaccinations");
  assert.equal(resolveNotificationRoute({ recordType: "HOSPITAL" }), "/hospital-visits");
  assert.equal(resolveNotificationRoute({ recordType: "feeding" }), "/timeline");
  assert.equal(resolveNotificationRoute({ chatMessageId: 9 }), "/timeline");
  assert.equal(resolveNotificationRoute({ familyChatMessageId: 12 }), "/family-chat");
});

test("허용되지 않은 알림 route는 알림 목록으로 제한한다", () => {
  assert.equal(resolveNotificationRoute({ route: "/settings" }), "/notifications");
  assert.equal(resolveNotificationRoute({ route: "/timeline" }), "/timeline");
  assert.equal(resolveNotificationRoute(null), "/notifications");
});
