import assert from "node:assert/strict";
import test from "node:test";

import { PushRegistrationLifecycle } from "../src/serverless/pushRegistrationLifecycle";

test("로그아웃은 진행 중 푸시 등록을 무효화하고 완료될 때까지 기다린다", async () => {
  const lifecycle = new PushRegistrationLifecycle();
  assert.equal(lifecycle.resumeForAuthenticatedSession(), true);
  const generation = lifecycle.beginRegistration();
  assert.notEqual(generation, null);

  let finishRegistration!: () => void;
  const registration = new Promise<void>((resolve) => {
    finishRegistration = resolve;
  });
  lifecycle.track(registration);

  let logoutReady = false;
  const logoutBarrier = lifecycle.blockForLogoutAndWait().then(() => {
    logoutReady = true;
  });

  await Promise.resolve();
  assert.equal(logoutReady, false);
  assert.equal(lifecycle.isRegistrationCurrent(generation!), false);
  assert.equal(lifecycle.beginRegistration(), null);

  finishRegistration();
  await logoutBarrier;
  assert.equal(logoutReady, true);
});

test("로그아웃 완료 전에는 재개할 수 없고 새 인증 세션만 등록을 다시 연다", async () => {
  const lifecycle = new PushRegistrationLifecycle();
  await lifecycle.blockForLogoutAndWait();

  assert.equal(lifecycle.resumeForAuthenticatedSession(), false);
  assert.equal(lifecycle.beginRegistration(), null);

  lifecycle.finishLogout();
  assert.equal(lifecycle.beginRegistration(), null);
  assert.equal(lifecycle.resumeForAuthenticatedSession(), true);

  const nextGeneration = lifecycle.beginRegistration();
  assert.notEqual(nextGeneration, null);
  assert.equal(lifecycle.isRegistrationCurrent(nextGeneration!), true);
});

test("동시 로그아웃은 마지막 작업이 끝나기 전까지 등록 재개를 차단한다", async () => {
  const lifecycle = new PushRegistrationLifecycle();
  await Promise.all([
    lifecycle.blockForLogoutAndWait(),
    lifecycle.blockForLogoutAndWait(),
  ]);

  lifecycle.finishLogout();
  assert.equal(lifecycle.resumeForAuthenticatedSession(), false);
  assert.equal(lifecycle.beginRegistration(), null);

  lifecycle.finishLogout();
  assert.equal(lifecycle.resumeForAuthenticatedSession(), true);
  assert.notEqual(lifecycle.beginRegistration(), null);
});
