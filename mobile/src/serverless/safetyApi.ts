import { getBabyBossSupabaseClient } from "./supabase";
import { createSafetyRequestEpoch } from "../features/safety/safetyRequestPolicy";
import {
  contentSafetyErrorMessage,
  safetyTargetTypes,
  validateSafetyReport,
  type ContentSafetyData,
  type HiddenSafetyTarget,
  type SafetyReportReason,
  type SafetyTargetType,
} from "../features/safety/safetyPolicy";

export { contentSafetyErrorMessage } from "../features/safety/safetyPolicy";
export type SafetyChange = { kind: "report" | "block" | "unblock" | "auth-reset" | "server-refresh" };
export type BlockedCaregiver = { caregiverId: number; name: string; blockedAt: string };
export type ContentSafetySnapshot = ContentSafetyData & {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const emptyState = (): ContentSafetySnapshot => ({
  status: "idle", error: null, blockedCaregiverIds: [], hiddenTargets: [],
});
let snapshot = emptyState();
let activeAuthUserId: string | null = null;
const requestEpoch = createSafetyRequestEpoch();
let pendingRefresh: Promise<ContentSafetySnapshot> | null = null;
let authObserverStarted = false;
let hasAuthoritativeState = false;
const stateListeners = new Set<() => void>();
const changeListeners = new Set<(change: SafetyChange) => void>();

function publish(next: ContentSafetySnapshot) {
  snapshot = next;
  stateListeners.forEach((listener) => listener());
}
function notifySafetyChanges(kind: SafetyChange["kind"]) {
  changeListeners.forEach((listener) => listener({ kind }));
}
export function subscribeSafetyChanges(listener: (change: SafetyChange) => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}
export function subscribeContentSafetyState(listener: () => void) {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}
export function getContentSafetySnapshot() { return snapshot; }

function setAuthUser(nextUserId: string | null) {
  if (nextUserId === activeAuthUserId) return;
  activeAuthUserId = nextUserId;
  requestEpoch.resetAuth();
  pendingRefresh = null;
  hasAuthoritativeState = false;
  publish(emptyState());
  notifySafetyChanges("auth-reset");
}

async function authenticatedClient() {
  const client = getBabyBossSupabaseClient();
  if (!client) throw new Error("안전 기능을 불러올 수 없어요. 앱 연결 설정을 확인해 주세요.");
  if (!authObserverStarted) {
    authObserverStarted = true;
    client.auth.onAuthStateChange((_event, session) => setAuthUser(session?.user.id ?? null));
  }
  const authRequest = requestEpoch.capture();
  const { data, error } = await client.auth.getSession();
  if (!requestEpoch.acceptsMutation(authRequest) && (data.session?.user.id ?? null) !== activeAuthUserId) throw new Error("로그인 상태가 바뀌었어요. 다시 시도해 주세요.");
  if (error || !data.session) {
    setAuthUser(null);
    throw new Error("로그인 상태를 확인한 뒤 다시 시도해 주세요.");
  }
  setAuthUser(data.session.user.id);
  return client;
}

function parseSafetyData(data: unknown): ContentSafetyData {
  if (typeof data !== "object" || data === null) throw new Error("Invalid safety state");
  const row = data as Record<string, unknown>;
  if (!Array.isArray(row.blocked_caregiver_ids) || !Array.isArray(row.hidden_targets)) throw new Error("Invalid safety state");
  const blockedCaregiverIds = row.blocked_caregiver_ids;
  if (!blockedCaregiverIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0)) throw new Error("Invalid safety state");
  const hiddenTargets = row.hidden_targets.map((target): HiddenSafetyTarget => {
    if (typeof target !== "object" || target === null) throw new Error("Invalid safety target");
    const value = target as Record<string, unknown>;
    if (!safetyTargetTypes.includes(value.target_type as SafetyTargetType) || !Number.isSafeInteger(value.target_id) || Number(value.target_id) <= 0) throw new Error("Invalid safety target");
    return { target_type: value.target_type as SafetyTargetType, target_id: Number(value.target_id) };
  });
  return { blockedCaregiverIds: blockedCaregiverIds as number[], hiddenTargets };
}

export async function refreshContentSafetyState(): Promise<ContentSafetySnapshot> {
  let client;
  const authenticationRequest = requestEpoch.capture();
  try {
    client = await authenticatedClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "안전 설정을 불러오지 못했어요.";
    if (requestEpoch.acceptsMutation(authenticationRequest)) publish({ ...snapshot, status: "error", error: message });
    throw new Error(message);
  }
  if (pendingRefresh) return pendingRefresh;
  const requestGeneration = requestEpoch.capture();
  // A background check must not unmount a report draft or an open photo every 30 s.
  // First load / failed checks remain fail-closed; changed authoritative data is atomic.
  if (snapshot.status !== "ready") publish({ ...snapshot, status: "loading", error: null });
  const request = (async () => {
    try {
      const { data, error } = await client.rpc("get_my_content_safety_state_checked");
      if (!requestEpoch.acceptsRead(requestGeneration)) throw new Error("CONTENT_SAFETY_STATE_STALE");
      if (error) throw error;
      const parsed = parseSafetyData(data);
      if (requestEpoch.acceptsRead(requestGeneration)) {
        const sameData = safetyStateKey(parsed) === safetyStateKey(snapshot);
        const changed = hasAuthoritativeState && !sameData;
        hasAuthoritativeState = true;
        if (!sameData || snapshot.status !== "ready") publish({ ...(sameData ? snapshot : parsed), status: "ready", error: null });
        if (changed) notifySafetyChanges("server-refresh");
      }
      return snapshot;
    } catch (error) {
      if (!requestEpoch.acceptsRead(requestGeneration)) throw new Error("안전 설정이나 로그인 상태가 바뀌었어요. 다시 시도해 주세요.");
      const message = contentSafetyErrorMessage(error, "신고·차단 설정을 확인하지 못했어요. 대화를 표시하려면 다시 시도해 주세요.");
      if (requestEpoch.acceptsRead(requestGeneration)) publish({ ...snapshot, status: "error", error: message });
      throw new Error(message);
    } finally {
      if (requestEpoch.acceptsRead(requestGeneration)) pendingRefresh = null;
    }
  })();
  pendingRefresh = request;
  return request;
}

function safetyStateKey(state: ContentSafetyData) {
  return JSON.stringify([
    [...state.blockedCaregiverIds].sort((left, right) => left - right),
    state.hiddenTargets.map((target) => `${target.target_type}:${target.target_id}`).sort(),
  ]);
}

function invalidateSafetyReads() {
  requestEpoch.invalidateReads();
  pendingRefresh = null;
}

async function mutationClient() {
  const client = await authenticatedClient();
  const request = requestEpoch.capture();
  if (snapshot.status !== "ready") await refreshContentSafetyState();
  if (!requestEpoch.acceptsMutation(request) || snapshot.status !== "ready") throw new Error("안전 설정을 확인한 뒤 다시 시도해 주세요.");
  return client;
}

export async function reportSafetyContent(targetType: SafetyTargetType, targetId: number, reason: SafetyReportReason, details: string) {
  const validation = validateSafetyReport(reason, details);
  if (validation) throw new Error(validation);
  const client = await mutationClient();
  const requestGeneration = requestEpoch.capture();
  const { data, error } = await client.rpc("report_safety_content_checked", {
    p_target_type: targetType, p_target_id: targetId, p_reason: reason,
    p_details: details.trim() || null,
  });
  if (!requestEpoch.acceptsMutation(requestGeneration)) throw new Error("로그인 상태가 바뀌었어요. 현재 계정에서 다시 확인해 주세요.");
  if (error) throw new Error(contentSafetyErrorMessage(error));
  if (!data || typeof data.report_id !== "number") throw new Error("신고 접수 결과를 확인하지 못했어요. 같은 항목을 다시 시도해 주세요.");
  if (requestEpoch.acceptsMutation(requestGeneration)) {
    invalidateSafetyReads();
    publish({ ...snapshot, status: "ready", error: null, hiddenTargets: [...snapshot.hiddenTargets.filter((target) => target.target_type !== targetType || target.target_id !== targetId), { target_type: targetType, target_id: targetId }] });
    notifySafetyChanges("report");
    void refreshContentSafetyState().catch(() => undefined);
  }
  return { reportId: data.report_id as number, alreadyReported: data.already_reported === true };
}

export async function blockCaregiver(caregiverId: number) {
  const client = await mutationClient();
  const requestGeneration = requestEpoch.capture();
  const { error } = await client.rpc("block_caregiver_checked", { p_target_caregiver_id: caregiverId });
  if (!requestEpoch.acceptsMutation(requestGeneration)) throw new Error("로그인 상태가 바뀌었어요. 현재 계정에서 다시 확인해 주세요.");
  if (error) throw new Error(contentSafetyErrorMessage(error));
  if (requestEpoch.acceptsMutation(requestGeneration)) {
    invalidateSafetyReads();
    publish({ ...snapshot, status: "ready", error: null, blockedCaregiverIds: [...new Set([...snapshot.blockedCaregiverIds, caregiverId])] });
    notifySafetyChanges("block");
    void refreshContentSafetyState().catch(() => undefined);
  }
}

export async function unblockCaregiver(caregiverId: number) {
  const client = await mutationClient();
  const requestGeneration = requestEpoch.capture();
  const { error } = await client.rpc("unblock_caregiver_checked", { p_target_caregiver_id: caregiverId });
  if (!requestEpoch.acceptsMutation(requestGeneration)) throw new Error("로그인 상태가 바뀌었어요. 현재 계정에서 다시 확인해 주세요.");
  if (error) throw new Error(contentSafetyErrorMessage(error));
  if (requestEpoch.acceptsMutation(requestGeneration)) {
    invalidateSafetyReads();
    // Do not remove the ID optimistically: the other caregiver may still block us.
    notifySafetyChanges("unblock");
    await refreshContentSafetyState();
  }
}

export async function listBlockedCaregivers(): Promise<BlockedCaregiver[]> {
  const client = await authenticatedClient();
  const requestGeneration = requestEpoch.capture();
  const { data, error } = await client.rpc("list_blocked_caregivers_checked");
  if (!requestEpoch.acceptsMutation(requestGeneration)) throw new Error("로그인 상태가 바뀌었어요. 목록을 다시 확인해 주세요.");
  if (error) throw new Error(contentSafetyErrorMessage(error, "차단 목록을 불러오지 못했어요. 다시 시도해 주세요."));
  if (!Array.isArray(data)) throw new Error("차단 목록을 확인하지 못했어요. 다시 시도해 주세요.");
  return data.map((row) => {
    if (!Number.isSafeInteger(row.caregiver_id) || typeof row.name !== "string" || typeof row.blocked_at !== "string") throw new Error("차단 목록을 확인하지 못했어요.");
    return { caregiverId: row.caregiver_id, name: row.name, blockedAt: row.blocked_at };
  });
}
