import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { resolveTaskListRequestOutcome } from "../src/features/dashboard/taskListRequestPolicy";

const mobileRoot = join(import.meta.dirname, "..");
const screen = readFileSync(join(mobileRoot, "src", "screens", "BabyBossScreen.tsx"), "utf8");
const taskList = readFileSync(join(mobileRoot, "src", "features", "dashboard", "TaskListView.tsx"), "utf8");
const api = readFileSync(join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"), "utf8");

test("할 일 알림은 가족 범위에서 대상의 날짜를 조회한다", () => {
  assert.match(api, /export async function fetchTask\(familyId: number, taskId: number\)/);
  assert.match(api, /\.eq\("family_id", familyId\)[\s\S]*\.eq\("id", taskId\)/);
  assert.match(screen, /fetchTask\(familyId, targetTaskId\)/);
  assert.match(screen, /setSelectedDate\(startOfLocalDay\(dueAt\)\)/);
});

test("대상 할 일을 강조하고 반복 알림 탭도 다시 스크롤한다", () => {
  assert.match(screen, /notificationTap/);
  assert.match(screen, /targetActivationKey/);
  assert.match(taskList, /taskRowTarget/);
  assert.match(taskList, /onTargetOffset\?\.\(taskListOffsetY \+ targetRowOffsetY\)/);
});

test("늦게 끝난 이전 날짜 요청은 알림 대상 날짜 목록을 덮지 않는다", () => {
  const todayTasks = [{ id: 1 }];
  const targetDayTasks = [{ id: 2 }];
  let renderedTasks: Array<{ id: number }> = [];
  let error: string | null = null;
  let isLoading = true;

  const targetOutcome = resolveTaskListRequestOutcome(2, {
    version: 2,
    kind: "success",
    tasks: targetDayTasks,
  });
  if (targetOutcome?.kind === "success") {
    renderedTasks = targetOutcome.tasks;
    isLoading = false;
  }

  const staleSuccess = resolveTaskListRequestOutcome(2, {
    version: 1,
    kind: "success",
    tasks: todayTasks,
  });
  const staleError = resolveTaskListRequestOutcome<{ id: number }>(2, {
    version: 1,
    kind: "error",
    message: "이전 요청 실패",
  });
  if (staleSuccess?.kind === "success") {
    renderedTasks = staleSuccess.tasks;
  }
  if (staleError?.kind === "error") {
    error = staleError.message;
    isLoading = false;
  }

  assert.deepEqual(renderedTasks, targetDayTasks);
  assert.equal(error, null);
  assert.equal(isLoading, false);
});

test("현재 날짜 요청의 오류만 화면 상태에 반영한다", () => {
  assert.deepEqual(resolveTaskListRequestOutcome<{ id: number }>(3, {
    version: 3,
    kind: "error",
    message: "현재 요청 실패",
  }), {
    version: 3,
    kind: "error",
    message: "현재 요청 실패",
  });
});
