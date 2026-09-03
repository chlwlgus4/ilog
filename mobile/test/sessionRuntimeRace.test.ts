import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { BootstrapResponse, FamilyChatMessageCard, SessionResponse } from "../src/api";
import * as familyChatUtils from "../src/features/chat/familyChatUtils";
import * as sessionErrorPolicy from "../src/serverless/sessionErrorPolicy";

type Runtime = ReturnType<typeof import("../src/hooks/useBabyBossRuntime").useBabyBossRuntime>;
type RuntimeModule = { useBabyBossRuntime: () => Runtime };
type StateUpdate = unknown | ((previous: unknown) => unknown);
type Slot = { value: unknown };

const source = readFileSync(join(import.meta.dirname, "../src/hooks/useBabyBossRuntime.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function sessionFor(id: number): SessionResponse {
  return {
    token: `test-session-${id}`,
    family: { id: id * 10, name: `Family ${id}`, inviteCode: `TEST-${id}`, ownerCaregiverId: id, deletionScheduledFor: null },
    caregiver: { id, email: null, name: `Caregiver ${id}`, role: "GUARDIAN", availabilityScore: 7, fatigueScore: 4 },
    child: { id: id * 100, name: `Child ${id}`, birthDate: "2026-01-01", stage: "INFANT", ageLabel: "8개월" },
    settings: { subscriptionPlan: "FREE", pushNotificationsEnabled: true, chatNotificationsEnabled: true, morningBriefingEnabled: true },
  };
}

function previewFor(session: SessionResponse): BootstrapResponse {
  return { family: session.family, child: session.child, caregivers: [session.caregiver], settings: session.settings };
}

function messageFor(session: SessionResponse, id = session.caregiver.id * 1000): FamilyChatMessageCard {
  return {
    id, senderId: session.caregiver.id, senderName: session.caregiver.name, senderRole: "GUARDIAN",
    senderImageUrl: null, body: `Message for account ${session.caregiver.id}`, imageUrl: null, createdAt: "2026-09-03T00:00:00Z",
  };
}

function harness() {
  const accountA = sessionFor(1);
  const accountB = sessionFor(2);
  const sessions = new Map([accountA, accountB].map((session) => [session.family.id, session]));
  let authenticatedSession = accountA;
  let hookCursor = 0;
  let deferFunctionalUpdates = false;
  const slots: Slot[] = [];
  const pendingUpdaters: (() => void)[] = [];
  const pendingConsents: ReturnType<typeof deferred<boolean>>[] = [];
  const pendingRestores: ReturnType<typeof deferred<SessionResponse>>[] = [];
  const consentCalls: number[] = [];
  const dataCalls: { method: string; familyId: number }[] = [];
  const pushRegistrations: number[] = [];
  const restoreCalls: number[] = [];
  let prependCalls = 0;
  let clearedSessions = 0;

  function useState(initial: unknown) {
    const index = hookCursor++;
    if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
    const update = (next: StateUpdate) => {
      const apply = () => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; };
      if (typeof next === "function" && deferFunctionalUpdates) pendingUpdaters.push(apply);
      else apply();
    };
    return [slots[index].value, update];
  }

  function useRef(initial: unknown) {
    const index = hookCursor++;
    if (!(index in slots)) slots[index] = { value: { current: initial } };
    return slots[index].value;
  }

  function data(method: string, familyId: number) {
    dataCalls.push({ method, familyId });
    const value = sessions.get(familyId);
    assert.ok(value, `Unknown fixture family ${familyId}`);
    return value;
  }

  const api = {
    hasCurrentLegalConsent: () => { consentCalls.push(authenticatedSession.caregiver.id); return pendingConsents.shift()?.promise ?? Promise.resolve(true); },
    restoreSession: () => { restoreCalls.push(authenticatedSession.caregiver.id); return pendingRestores.shift()?.promise ?? Promise.resolve(authenticatedSession); },
    fetchBootstrap: async () => previewFor(authenticatedSession),
    fetchDashboard: async (id: number) => { const value = data("dashboard", id); return { family: value.family, child: value.child, tasksToday: [], recentLogs: [], notifications: [] }; },
    fetchChat: async (id: number) => ({ family: data("chat", id).family, messages: [] }),
    fetchFamilyChat: async (id: number) => { const value = data("family-chat", id); return { family: value.family, messages: [messageFor(value)] }; },
    fetchNotebook: async (id: number) => { const value = data("notebook", id); return { family: value.family, child: value.child, schedules: [], memories: [] }; },
    fetchSettings: async (id: number) => { const value = data("settings", id); return { family: value.family, settings: value.settings, caregivers: [value.caregiver] }; },
    fetchGrowthMeasurements: async (id: number) => { const value = data("growth", id); return [{ id: value.child!.id, caregiverId: value.caregiver.id }]; },
    acceptCurrentLegalConsent: async () => undefined,
  };
  const exports: Partial<RuntimeModule> = {};
  // Execute the real hook body. Effects (boot restore, subscriptions, AppState)
  // are intentionally disabled; each race explicitly invokes its public action.
  runInNewContext(compiled, {
    exports, Error, console,
    require: (name: string) => {
      if (name === "react") return { useState, useRef, useEffect: () => undefined, useTransition: () => [false, (action: () => void) => action()] };
      if (name === "react-native") return { AppState: { addEventListener: () => ({ remove: () => undefined }) } };
      if (name === "../api") return api;
      if (name.endsWith("familyChatUtils")) return { ...familyChatUtils, prependFamilyChatMessage: (...args: Parameters<typeof familyChatUtils.prependFamilyChatMessage>) => { prependCalls += 1; return familyChatUtils.prependFamilyChatMessage(...args); } };
      if (name.endsWith("familyChatRealtime")) return { subscribeFamilyChatMessages: () => () => undefined };
      if (name.endsWith("pushNotifications")) return { registerPushDeviceToken: async (value: SessionResponse) => { pushRegistrations.push(value.caregiver.id); }, resumePushRegistrationForAuthenticatedSession: () => undefined };
      if (name.endsWith("sessionErrorPolicy")) return sessionErrorPolicy;
      if (name.endsWith("babyBossSupabaseApi")) return { invalidateFamilyMediaCache: () => undefined };
      if (name.endsWith("safetyApi")) return { refreshContentSafetyState: async () => undefined, subscribeSafetyChanges: () => () => undefined };
      if (name === "../storage") return { clearLegacyPreferences: async () => undefined, clearSessionToken: async () => { clearedSessions += 1; } };
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  const module = exports as RuntimeModule;
  let runtime: Runtime;
  function render() { hookCursor = 0; runtime = module.useBabyBossRuntime(); return runtime; }
  render();
  return {
    accountA, accountB, render,
    get runtime() { return runtime; },
    consentCalls, dataCalls, pushRegistrations, restoreCalls,
    get prependCalls() { return prependCalls; },
    get clearedSessions() { return clearedSessions; },
    setAuthenticatedSession: (value: SessionResponse) => { authenticatedSession = value; },
    delayConsent: () => { const value = deferred<boolean>(); pendingConsents.push(value); return value; },
    delayRestore: () => { const value = deferred<SessionResponse>(); pendingRestores.push(value); return value; },
    setDeferFunctionalUpdates: (value: boolean) => { deferFunctionalUpdates = value; },
    flushFunctionalUpdates: () => { for (const apply of pendingUpdaters.splice(0)) apply(); },
  };
}

function assertAccount(runtime: Runtime, expected: SessionResponse) {
  assert.equal(runtime.session?.caregiver.id, expected.caregiver.id);
  for (const payload of [runtime.bootstrap, runtime.dashboard, runtime.chat, runtime.familyChat, runtime.notebook, runtime.settings]) {
    assert.equal(payload?.family.id, expected.family.id);
  }
  assert.equal(runtime.growthMeasurements[0]?.caregiverId, expected.caregiver.id);
  assert.equal(runtime.legalConsentRequired, false);
  assert.equal(runtime.sessionRecoveryRequired, false);
  assert.equal(runtime.error, null);
}

test("A hydrate 동의 응답이 B hydrate 완료 뒤 도착해도 B 데이터·동의 상태를 덮어쓰지 않는다", async () => {
  const h = harness();
  const slowConsent = h.delayConsent();
  const hydrateA = h.runtime.hydrate(h.accountA, previewFor(h.accountA));
  assert.deepEqual(h.consentCalls, [1]);
  h.setAuthenticatedSession(h.accountB);
  await h.runtime.hydrate(h.accountB, previewFor(h.accountB));
  assertAccount(h.render(), h.accountB);
  slowConsent.resolve(false);
  await hydrateA;
  assertAccount(h.render(), h.accountB);
  assert.ok(h.dataCalls.every((call) => call.familyId === h.accountB.family.id));
  assert.deepEqual(h.pushRegistrations, [2]);
});

test("A refreshAll의 지연 restore 응답은 B 로그인 뒤 hydrate와 finally 상태 변경을 실행하지 않는다", async () => {
  const h = harness();
  await h.runtime.hydrate(h.accountA, previewFor(h.accountA));
  assertAccount(h.render(), h.accountA);
  const slowRestore = h.delayRestore();
  const refreshA = h.runtime.refreshAll();
  await setImmediate();
  assert.deepEqual(h.restoreCalls, [1]);
  h.setAuthenticatedSession(h.accountB);
  await h.runtime.hydrate(h.accountB, previewFor(h.accountB));
  assertAccount(h.render(), h.accountB);
  h.runtime.setBusyAction("account-b-action");
  slowRestore.resolve(h.accountA);
  await refreshA;
  const after = h.render();
  assertAccount(after, h.accountB);
  assert.equal(after.busyAction, "account-b-action");
  assert.deepEqual(h.consentCalls, [1, 2], "Stale restore must not start another hydrate");
  assert.deepEqual(h.pushRegistrations, [1, 2]);
  assert.equal(h.clearedSessions, 0);
});

test("A의 오래된 채팅 callback과 지연 React updater는 B 세션에 메시지를 prepend하지 않는다", async () => {
  const h = harness();
  await h.runtime.hydrate(h.accountA, previewFor(h.accountA));
  h.render();
  const applyFromA = h.runtime.applyFamilyChatMessage;
  const scopeA = { caregiverId: h.accountA.caregiver.id, familyId: h.accountA.family.id };
  h.setDeferFunctionalUpdates(true);
  applyFromA(messageFor(h.accountA, 1001), scopeA);
  h.setDeferFunctionalUpdates(false);
  h.setAuthenticatedSession(h.accountB);
  await h.runtime.hydrate(h.accountB, previewFor(h.accountB));
  const before = h.render().familyChat;
  h.flushFunctionalUpdates();
  applyFromA(messageFor(h.accountA, 1002), scopeA);
  assert.equal(h.render().familyChat, before);
  assert.equal(h.prependCalls, 0);
  assert.deepEqual(h.runtime.familyChat?.messages.map((message) => message.id), [2000]);

  // Positive control: the same real action still accepts the current account.
  h.runtime.applyFamilyChatMessage(messageFor(h.accountB, 2001), { caregiverId: 2, familyId: 20 });
  assert.deepEqual(h.render().familyChat?.messages.map((message) => message.id), [2001, 2000]);
  assert.equal(h.prependCalls, 1);
});
