import assert from "node:assert/strict";
import test from "node:test";

import {
  recordAlarmRoute,
  resolveNotificationDestination,
  resolveNotificationRoute,
} from "../src/notifications/notificationNavigation";

test("기록 알림은 기록 종류별 입력 화면으로 이동한다", () => {
  assert.equal(recordAlarmRoute("FEEDING"), "/feeding-add");
  assert.equal(recordAlarmRoute("SLEEP"), "/sleep-add");
  assert.equal(recordAlarmRoute("GROWTH"), "/growth-add");
});

test("업무와 대화 알림은 검증된 대상 ID를 이동 파라미터로 보존한다", () => {
  assert.deepEqual(resolveNotificationDestination({ taskId: 11 }), {
    pathname: "/task-assignments",
    params: { taskId: "11" },
  });
  assert.deepEqual(resolveNotificationDestination({ familyChatMessageId: " 12 " }), {
    pathname: "/family-chat",
    params: { familyChatMessageId: "12" },
  });
  assert.deepEqual(
    resolveNotificationDestination({ chatMessageId: 9, commentId: "10", parentCommentId: 8 }),
    {
      pathname: "/timeline",
      params: { chatMessageId: "9", commentId: "10", parentCommentId: "8" },
    },
  );

  assert.equal(resolveNotificationRoute({ taskId: 11 }), "/task-assignments");
  assert.equal(resolveNotificationRoute({ chatMessageId: 9 }), "/timeline");
  assert.equal(resolveNotificationRoute({ familyChatMessageId: 12 }), "/family-chat");
});

test("공유 기록은 종류와 ID를 기록 상세 목적지에 함께 전달한다", () => {
  assert.deepEqual(resolveNotificationDestination({ recordType: "feeding", recordId: "42" }), {
    pathname: "/timeline-detail",
    params: { recordType: "FEEDING", recordId: "42" },
  });
  assert.deepEqual(resolveNotificationDestination({ recordType: "vaccination", recordId: 7 }), {
    pathname: "/timeline-detail",
    params: { recordType: "VACCINATION", recordId: "7" },
  });
  assert.deepEqual(
    resolveNotificationDestination({ recordType: "growth", recordId: 8, recordSource: "log" }),
    {
      pathname: "/timeline-detail",
      params: { recordType: "GROWTH", recordId: "8", recordSource: "LOG" },
    },
  );
  assert.deepEqual(
    resolveNotificationDestination({ recordType: "growth", recordId: 8, recordSource: "unknown" }),
    {
      pathname: "/timeline-detail",
      params: { recordType: "GROWTH", recordId: "8" },
    },
  );

  assert.equal(resolveNotificationRoute({ recordType: "vaccination" }), "/vaccinations");
  assert.equal(resolveNotificationRoute({ recordType: "HOSPITAL" }), "/hospital-visits");
  assert.equal(resolveNotificationRoute({ recordType: "feeding" }), "/timeline");
});

test("기록 리마인더는 입력 화면을 유지하고 유효한 일정 ID만 보존한다", () => {
  assert.deepEqual(
    resolveNotificationDestination({
      recordAlarmScheduleId: "31",
      sourceLogId: 14,
      logType: "feeding",
      route: "/timeline",
    }),
    {
      pathname: "/feeding-add",
      params: { recordAlarmScheduleId: "31", sourceLogId: "14" },
    },
  );
  assert.deepEqual(resolveNotificationDestination({ kind: "record-alarm", logType: "MOMENT" }), {
    pathname: "/quick-add",
  });
});

test("0, 음수, 소수, 범위 초과 ID는 이동 파라미터로 사용하지 않는다", () => {
  assert.deepEqual(resolveNotificationDestination({ familyChatMessageId: 0, route: "/home" }), {
    pathname: "/home",
  });
  assert.deepEqual(resolveNotificationDestination({ chatMessageId: "1e3", route: "/timeline" }), {
    pathname: "/timeline",
  });
  assert.deepEqual(
    resolveNotificationDestination({
      chatMessageId: 9,
      commentId: -1,
      parentCommentId: Number.MAX_SAFE_INTEGER + 1,
    }),
    {
      pathname: "/timeline",
      params: { chatMessageId: "9" },
    },
  );
  assert.deepEqual(
    resolveNotificationDestination({
      recordType: "feeding",
      recordId: 1.5,
    }),
    { pathname: "/timeline" },
  );
});

test("허용되지 않은 알림 route는 알림 목록으로 제한한다", () => {
  assert.equal(resolveNotificationRoute({ route: "/settings" }), "/settings");
  assert.equal(resolveNotificationRoute({ route: "/delete-account" }), "/notifications");
  assert.equal(resolveNotificationRoute({ route: "/timeline" }), "/timeline");
  assert.equal(resolveNotificationRoute({ route: "/timeline-detail" }), "/timeline-detail");
  assert.equal(resolveNotificationRoute(null), "/notifications");
});
