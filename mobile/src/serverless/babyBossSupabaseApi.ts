import type { Session, SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import type {
  BootstrapResponse,
  CaregiverRole,
  CaregiverSummary,
  ChatMessageCard,
  ChatMessageType,
  ChatResponse,
  ChildStage,
  ChildSummary,
  CreateChatMessageRequest,
  CreateChildProfileRequest,
  CreateFamilyChatMessageRequest,
  CreateFamilyInvitationRequest,
  CreateFamilyPhotoRequest,
  CreateGrowthMeasurementRequest,
  CreateHospitalVisitRequest,
  CreateLogRequest,
  CreateMemoryRequest,
  CreateScheduleRequest,
  CreateTaskRequest,
  CreateTimelineCommentRequest,
  CreateVaccinationRequest,
  DashboardResponse,
  ExportFormat,
  ExportJobCard,
  FamilySettingsSummary,
  FetchChatOptions,
  FetchLogsOptions,
  FetchTasksOptions,
  FamilyInvitationCard,
  FamilyChatMessageCard,
  FamilyChatResponse,
  FamilyPhotoCard,
  FamilySummary,
  GrowthMeasurementCard,
  HospitalVisitCard,
  LogCard,
  LogType,
  MemoryCard,
  NotebookResponse,
  NotificationCard,
  NotificationPreferencesSummary,
  RecordAlarmRuleCard,
  RecordAlarmScheduleCard,
  RecordSharePreference,
  RequestDataExportRequest,
  ScheduleCard,
  ScheduleCategory,
  SearchResultCard,
  SessionResponse,
  SettingsResponse,
  SubscriptionPlan,
  TaskCard,
  TaskPriority,
  TaskStatus,
  TimelineCommentCard,
  UpdateRecordAlarmRuleRequest,
  UpdateCaregiverPersonalInfoRequest,
  UpdateCaregiverProfileRequest,
  UpdateChildProfileRequest,
  UpdateFamilySettingsRequest,
  UpdateLogRequest,
  UpdateNotificationPreferencesRequest,
  UploadImageRequest,
  VaccinationCard,
  AlarmNotifyScope,
} from "../api";
import { getSupabaseConfig } from "./config";
import { getBabyBossSupabaseClient } from "./supabase";

type BabyBossSupabaseClient = SupabaseClient;

interface FamilyRow {
  id: number;
  name: string;
  invite_code: string;
  subscription_plan: SubscriptionPlan;
  push_notifications_enabled: boolean;
  chat_notifications_enabled: boolean;
  morning_briefing_enabled: boolean;
}

interface ChildRow {
  id: number;
  family_id: number;
  name: string;
  birth_date: string;
  stage: ChildStage;
  image_url: string | null;
}

interface CaregiverRow {
  id: number;
  family_id: number;
  auth_user_id: string | null;
  email: string | null;
  name: string;
  role: CaregiverRole;
  availability_score: number;
  fatigue_score: number;
  image_url: string | null;
  contact_phone: string | null;
}

const caregiverSelectFields = "id,family_id,auth_user_id,email,name,role,availability_score,fatigue_score,image_url,contact_phone";

interface TaskRow {
  id: number;
  family_id: number;
  child_id: number | null;
  assignee_id: number | null;
  created_by_id: number | null;
  title: string;
  description: string | null;
  due_at: string;
  priority: TaskPriority;
  status: TaskStatus;
  auto_assigned: boolean;
  completed_at: string | null;
  reminder_minutes_before: number | null;
  reminder_after_minutes: number | null;
  reminder_at: string | null;
  created_at: string;
}

interface ScheduleRow {
  id: number;
  family_id: number;
  child_id: number | null;
  title: string;
  category: ScheduleCategory;
  start_at: string;
  end_at: string;
  note: string | null;
}

interface LogRow {
  id: number;
  family_id: number;
  child_id: number | null;
  caregiver_id: number | null;
  type: LogType;
  entry_value: string;
  note: string | null;
  recorded_at: string;
  recorded_end_at: string | null;
  record_subtype: string | null;
  details: Record<string, unknown> | null;
}

interface ChatMessageRow {
  id: number;
  family_id: number;
  sender_id: number;
  message_type: ChatMessageType;
  body: string;
  linked_task_id: number | null;
  created_at: string;
}

interface TimelineCommentRow {
  id: number;
  family_id: number;
  chat_message_id: number;
  parent_comment_id: number | null;
  author_caregiver_id: number;
  body: string;
  created_at: string;
}

interface MemoryRow {
  id: number;
  family_id: number;
  child_id: number | null;
  created_by_id: number | null;
  title: string;
  note: string | null;
  image_url: string | null;
  tag: string | null;
  happened_at: string;
}

interface FamilyPhotoRow {
  id: number;
  family_id: number;
  created_by_id: number;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

interface RecordAttachmentRow {
  id: number;
  family_id: number;
  child_id: number | null;
  log_id: number | null;
  memory_entry_id: number | null;
  created_by_id: number | null;
  image_url: string;
  caption: string | null;
  created_at: string;
}

interface FamilyChatMessageRow {
  id: number;
  family_id: number;
  sender_caregiver_id: number;
  body: string;
  image_storage_path: string | null;
  created_at: string;
}

interface GrowthMeasurementRow {
  id: number;
  family_id: number;
  child_id: number;
  caregiver_id: number | null;
  measured_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  head_circumference_cm: number | null;
  note: string | null;
}

interface NotificationPreferencesRow {
  family_id: number;
  feeding_enabled: boolean;
  medicine_enabled: boolean;
  vaccination_enabled: boolean;
  growth_enabled: boolean;
  briefing_enabled: boolean;
  health_alerts_enabled: boolean;
  daily_time: string;
}

interface RecordAlarmRuleRow {
  id: number;
  family_id: number;
  log_type: LogType;
  enabled: boolean;
  interval_minutes: number;
  notify_scope: AlarmNotifyScope;
  updated_at: string | null;
}

interface RecordSharePreferenceRow {
  family_id: number;
  caregiver_id: number;
  share_enabled: boolean;
  excluded_caregiver_ids: number[] | null;
  updated_at: string | null;
}

interface RecordAlarmScheduleRow {
  id: number;
  family_id: number;
  child_id: number | null;
  source_log_id: number | null;
  log_type: LogType;
  interval_minutes: number;
  scheduled_for: string;
  status: RecordAlarmScheduleCard["status"];
  notify_scope: AlarmNotifyScope;
}

interface FamilyInvitationRow {
  id: number;
  family_id: number;
  email: string;
  contact_phone: string | null;
  role: CaregiverRole;
  note: string | null;
  status: FamilyInvitationCard["status"];
  invited_by_id: number | null;
  created_at: string;
}

interface VaccinationRow {
  id: number;
  family_id: number;
  child_id: number;
  name: string;
  dose_label: string | null;
  status: VaccinationCard["status"];
  due_at: string;
  completed_at: string | null;
  note: string | null;
}

interface HospitalVisitRow {
  id: number;
  family_id: number;
  child_id: number;
  hospital_name: string;
  reason: string | null;
  visited_at: string;
  diagnosis: string | null;
  note: string | null;
}

interface ExportJobRow {
  id: number;
  family_id: number;
  requested_by_id: number | null;
  format: ExportFormat;
  sections: string[] | Record<string, unknown> | null;
  status: ExportJobCard["status"];
  requested_at: string;
  completed_at: string | null;
  download_url: string | null;
}

interface CurrentContext {
  supabase: BabyBossSupabaseClient;
  session: Session;
  family: FamilyRow;
  child: ChildRow | null;
  caregiver: CaregiverRow;
  caregivers: CaregiverRow[];
}

interface OAuthCallbackParams {
  inviteCode: string | null;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

const supabaseConfigErrorMessage =
  "서버 연결 설정이 비어 있어요. mobile/.env에 앱 연결 값을 넣어 주세요.";

const anonymousAuthErrorMessage =
  "로그인 서버 설정을 확인해 주세요. 익명 세션 로그인이 꺼져 있습니다.";

const recordAlarmTypes: LogType[] = ["FEEDING", "SLEEP", "DIAPER", "TEMPERATURE", "MEDICINE", "PUMPING", "GROWTH", "MEMO"];

const defaultRecordAlarmIntervals: Record<LogType, number> = {
  FEEDING: 180,
  SLEEP: 120,
  GROWTH: 10080,
  MOMENT: 180,
  MEDICINE: 480,
  CHECKLIST: 180,
  DIAPER: 240,
  TEMPERATURE: 30,
  PUMPING: 180,
  MEMO: 180,
};

const familyMediaBucket = "family-media";
const maxFamilyMediaBytes = 6 * 1024 * 1024;
const familyMediaMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function requireSupabaseClient() {
  const client = getBabyBossSupabaseClient();

  if (!client) {
    throw new Error(supabaseConfigErrorMessage);
  }

  return client as BabyBossSupabaseClient;
}

function toUserFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("Current caregiver password is invalid")) {
    return "현재 비밀번호가 맞지 않습니다.";
  }

  if (message.includes("Current password is required") || message.includes("Current password and new password are both required")) {
    return "비밀번호를 바꾸려면 현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.";
  }

  if (message.includes("Invalid caregiver password")) {
    return "로그인 정보가 맞지 않습니다.";
  }

  if (message.includes("Caregiver password is not set")) {
    return "비밀번호가 아직 설정되지 않았어요. 회원가입 화면에서 비밀번호를 먼저 설정해 주세요.";
  }

  if (message.includes("Password must be")) {
    return "비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.";
  }

  if (message.includes("Caregiver name is required")) {
    return "닉네임을 입력해 주세요.";
  }

  if (message.includes("Invalid caregiver role")) {
    return "역할을 다시 선택해 주세요.";
  }

  if (message.includes("Invitation role is invalid")) {
    return "초대 역할을 다시 선택해 주세요.";
  }

  if (message.includes("Invalid contact phone")) {
    return "연락처 형식을 확인해 주세요.";
  }

  if (message.includes("Only your own profile can be updated")) {
    return "본인 개인정보만 수정할 수 있어요.";
  }

  if (message.includes("Anonymous") || message.includes("anonymous")) {
    return anonymousAuthErrorMessage;
  }

  if (message.includes("Google OAuth session is required")) {
    return "Google 계정 인증을 먼저 완료해 주세요.";
  }

  if (message.includes("access_denied")) {
    return "Google 로그인이 취소되었어요.";
  }

  if (message.includes("provider is not enabled") || message.includes("Unsupported provider")) {
    return "Supabase에서 Google 로그인 제공자가 아직 활성화되지 않았어요.";
  }

  if (message.includes("OAuth") || message.includes("oauth")) {
    return "Google 로그인 인증을 완료하지 못했어요. Supabase Google 제공자와 리디렉션 URL 설정을 확인해 주세요.";
  }

  if (message.includes("Family invite code was not found")) {
    return "초대 코드를 찾을 수 없습니다.";
  }

  if (message.includes("Caregiver email is required") || message.includes("Invalid caregiver email")) {
    return "이메일 형식을 확인해 주세요.";
  }

  if (message.includes("Caregiver was not found")) {
    return "가입된 이메일을 찾지 못했어요.";
  }

  if (message.includes("create_timeline_comment_checked") || message.includes("timeline_comments")) {
    return "댓글 기능의 서버 변경이 아직 적용되지 않았어요.";
  }

  if (
    message.includes("create_family_chat_message_checked") ||
    message.includes("create_family_photo_checked") ||
    message.includes("family_chat_messages") ||
    message.includes("family_photos") ||
    message.includes("family-media")
  ) {
    return "가족 대화와 사진 앨범 서버 변경을 먼저 적용해 주세요.";
  }

  if (message.includes("permission denied")) {
    return "서버 권한 설정을 확인해 주세요.";
  }

  return message || fallback;
}

async function runSupabase<T>(work: () => Promise<T>, fallback: string) {
  try {
    return await work();
  } catch (error) {
    throw new Error(toUserFacingError(error, fallback));
  }
}

async function readOne<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, fallback: string) {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(fallback);
  }

  return data;
}

async function readRpcRow<T>(query: PromiseLike<{ data: T | T[] | null; error: { message: string } | null }>, fallback: string) {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(fallback);
  }

  return row;
}

async function readMany<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function isMissingTimelineCommentsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("timeline_comments") && (message.includes("does not exist") || message.includes("Could not find"));
}

function isMissingFamilyMediaSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const missingObject = message.includes("does not exist") || message.includes("Could not find");

  return missingObject && (message.includes("family_chat_messages") || message.includes("family_photos"));
}

async function ensureAuthSession() {
  const supabase = requireSupabaseClient();
  const current = await supabase.auth.getSession();

  if (current.error) {
    throw new Error(current.error.message);
  }

  if (current.data.session) {
    return { supabase, session: current.data.session };
  }

  const created = await supabase.auth.signInAnonymously();

  if (created.error) {
    throw new Error(created.error.message);
  }

  if (!created.data.session) {
    throw new Error(anonymousAuthErrorMessage);
  }

  return { supabase, session: created.data.session };
}

async function readExistingSession() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    throw new Error("저장된 로그인 세션이 없어요. 다시 로그인해 주세요.");
  }

  return { supabase, session: data.session };
}

async function joinByInvite(
  supabase: BabyBossSupabaseClient,
  payload: {
    inviteCode?: string;
    email: string;
    caregiverName: string;
    password: string;
    role?: CaregiverRole;
  },
) {
  const { error } = await supabase.rpc("register_caregiver", {
    p_invite_code: blankToNull(payload.inviteCode),
    p_email: payload.email.trim().toLowerCase(),
    p_caregiver_name: payload.caregiverName,
    p_role: payload.role ?? null,
    p_password: payload.password,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function loginByEmail(
  supabase: BabyBossSupabaseClient,
  payload: {
    email: string;
    password: string;
  },
) {
  const { error } = await supabase.rpc("login_caregiver_by_email", {
    p_email: payload.email.trim().toLowerCase(),
    p_password: payload.password,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function loadCurrentContext(supabase: BabyBossSupabaseClient, session: Session): Promise<CurrentContext> {
  const caregiver = await readOne<CaregiverRow>(
    supabase
      .from("caregivers")
      .select(caregiverSelectFields)
      .eq("auth_user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "현재 보호자 정보를 찾지 못했어요.",
  );

  const [family, child, caregivers] = await Promise.all([
    readOne<FamilyRow>(
      supabase.from("families").select("*").eq("id", caregiver.family_id).single(),
      "가족 정보를 찾지 못했어요.",
    ),
    readMany<ChildRow>(
      supabase.from("children").select("*").eq("family_id", caregiver.family_id).order("id", { ascending: true }).limit(1),
    ).then((rows) => rows[0] ?? null),
    readMany<CaregiverRow>(
      supabase.from("caregivers").select(caregiverSelectFields).eq("family_id", caregiver.family_id).order("id", { ascending: true }),
    ),
  ]);

  return { supabase, session, family, child, caregiver, caregivers };
}

function assertFamilyAccess(context: CurrentContext, familyId: number) {
  if (context.family.id !== familyId) {
    throw new Error("현재 로그인한 가족 보드와 요청한 가족 보드가 달라요.");
  }
}

function requireContextChild(context: CurrentContext) {
  if (!context.child) {
    throw new Error("아이 정보를 먼저 입력해 주세요.");
  }

  return context.child;
}

function mapFamily(row: FamilyRow): FamilySummary {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
  };
}

function mapChild(row: ChildRow): ChildSummary {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    stage: row.stage,
    ageLabel: toAgeLabel(row.birth_date),
    imageUrl: row.image_url,
  };
}

function mapCaregiver(row: CaregiverRow): CaregiverSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    availabilityScore: row.availability_score,
    fatigueScore: row.fatigue_score,
    imageUrl: row.image_url,
    contactPhone: row.contact_phone,
  };
}

function mapSettings(row: FamilyRow): FamilySettingsSummary {
  return {
    subscriptionPlan: row.subscription_plan,
    pushNotificationsEnabled: row.push_notifications_enabled,
    chatNotificationsEnabled: row.chat_notifications_enabled,
    morningBriefingEnabled: row.morning_briefing_enabled,
  };
}

function mapNotificationPreferences(row: NotificationPreferencesRow | null | undefined): NotificationPreferencesSummary {
  return {
    feedingEnabled: row?.feeding_enabled ?? true,
    medicineEnabled: row?.medicine_enabled ?? true,
    vaccinationEnabled: row?.vaccination_enabled ?? true,
    growthEnabled: row?.growth_enabled ?? false,
    briefingEnabled: row?.briefing_enabled ?? true,
    healthAlertsEnabled: row?.health_alerts_enabled ?? true,
    dailyTime: row?.daily_time?.slice(0, 5) ?? "08:00",
  };
}

function mapRecordAlarmRule(row: RecordAlarmRuleRow): RecordAlarmRuleCard {
  return {
    id: row.id,
    familyId: row.family_id,
    logType: row.log_type,
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    notifyScope: row.notify_scope,
    updatedAt: row.updated_at,
  };
}

function mapRecordSharePreference(row: RecordSharePreferenceRow): RecordSharePreference {
  return {
    familyId: row.family_id,
    caregiverId: row.caregiver_id,
    shareEnabled: row.share_enabled,
    excludedCaregiverIds: row.excluded_caregiver_ids ?? [],
    updatedAt: row.updated_at,
  };
}

function fallbackRecordSharePreference(familyId: number, caregiverId: number): RecordSharePreference {
  return {
    familyId,
    caregiverId,
    shareEnabled: false,
    excludedCaregiverIds: [],
    updatedAt: null,
  };
}

function mapRecordAlarmSchedule(row: RecordAlarmScheduleRow): RecordAlarmScheduleCard {
  return {
    id: row.id,
    familyId: row.family_id,
    childId: row.child_id,
    sourceLogId: row.source_log_id,
    logType: row.log_type,
    intervalMinutes: row.interval_minutes,
    scheduledFor: row.scheduled_for,
    status: row.status,
    notifyScope: row.notify_scope,
  };
}

function fallbackRecordAlarmRule(familyId: number, logType: LogType): RecordAlarmRuleCard {
  return {
    id: null,
    familyId,
    logType,
    enabled: false,
    intervalMinutes: defaultRecordAlarmIntervals[logType],
    notifyScope: "FAMILY",
    updatedAt: null,
  };
}

function mergeRecordAlarmRules(familyId: number, rows: RecordAlarmRuleRow[]) {
  const rulesByType = new Map(rows.map((row) => [row.log_type, row]));
  return recordAlarmTypes.map((logType) => {
    const row = rulesByType.get(logType);
    return row ? mapRecordAlarmRule(row) : fallbackRecordAlarmRule(familyId, logType);
  });
}

function mapBootstrap(context: CurrentContext): BootstrapResponse {
  return {
    family: mapFamily(context.family),
    child: context.child ? mapChild(context.child) : null,
    caregivers: context.caregivers.map(mapCaregiver),
    settings: mapSettings(context.family),
  };
}

function mapSession(context: CurrentContext): SessionResponse {
  return {
    token: context.session.access_token,
    family: mapFamily(context.family),
    child: context.child ? mapChild(context.child) : null,
    caregiver: mapCaregiver(context.caregiver),
    settings: mapSettings(context.family),
  };
}

function caregiverMap(caregivers: CaregiverRow[]) {
  return new Map(caregivers.map((caregiver) => [caregiver.id, caregiver]));
}

function mapTask(row: TaskRow, caregiversById: Map<number, CaregiverRow>): TaskCard {
  const assignee = row.assignee_id ? caregiversById.get(row.assignee_id) : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status,
    autoAssigned: row.auto_assigned,
    assigneeName: assignee?.name ?? "미배정",
    assigneeRole: assignee?.role ?? "GUARDIAN",
    reminderMinutesBefore: row.reminder_minutes_before,
    reminderAfterMinutes: row.reminder_after_minutes ?? null,
    reminderAt: row.reminder_at ?? null,
  };
}

function mapSchedule(row: ScheduleRow): ScheduleCard {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note,
  };
}

function mapLog(row: LogRow, caregiversById: Map<number, CaregiverRow>): LogCard {
  const caregiver = row.caregiver_id ? caregiversById.get(row.caregiver_id) : null;

  return {
    id: row.id,
    type: row.type,
    value: row.entry_value,
    note: row.note,
    caregiverName: caregiver?.name ?? "가족 기록",
    caregiverRole: caregiver?.role ?? null,
    recordedAt: row.recorded_at,
    recordedEndAt: row.recorded_end_at,
    recordSubtype: row.record_subtype,
    details: row.details ?? {},
  };
}

function mapGrowthMeasurement(row: GrowthMeasurementRow, caregiversById: Map<number, CaregiverRow>): GrowthMeasurementCard {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    headCircumferenceCm: row.head_circumference_cm,
    note: row.note,
    caregiverName: row.caregiver_id ? caregiversById.get(row.caregiver_id)?.name ?? "가족 기록" : "가족 기록",
  };
}

function mapMemory(row: MemoryRow, caregiversById: Map<number, CaregiverRow>): MemoryCard {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    imageUrl: row.image_url,
    tag: row.tag,
    caregiverName: row.created_by_id ? caregiversById.get(row.created_by_id)?.name ?? "가족 수첩" : "가족 수첩",
    happenedAt: row.happened_at,
  };
}

async function createFamilyMediaSignedUrl(supabase: BabyBossSupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage.from(familyMediaBucket).createSignedUrl(storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "가족 사진을 불러오지 못했어요.");
  }

  return data.signedUrl;
}

function mapFamilyPhoto(row: FamilyPhotoRow, imageUrl: string, caregiversById: Map<number, CaregiverRow>): FamilyPhotoCard {
  return {
    id: `family-photo-${row.id}`,
    imageUrl,
    caption: row.caption,
    createdAt: row.created_at,
    createdByName: caregiversById.get(row.created_by_id)?.name ?? "가족",
  };
}

function mapRecordAttachmentAsFamilyPhoto(row: RecordAttachmentRow, caregiversById: Map<number, CaregiverRow>): FamilyPhotoCard {
  return {
    id: `record-attachment-${row.id}`,
    imageUrl: row.image_url,
    caption: row.caption,
    createdAt: row.created_at,
    createdByName: row.created_by_id ? caregiversById.get(row.created_by_id)?.name ?? "가족" : "가족",
  };
}

function mapFamilyChatMessage(
  row: FamilyChatMessageRow,
  imageUrl: string | null,
  caregiversById: Map<number, CaregiverRow>,
): FamilyChatMessageCard {
  const sender = caregiversById.get(row.sender_caregiver_id);

  return {
    id: row.id,
    senderId: row.sender_caregiver_id,
    senderName: sender?.name ?? "가족",
    senderRole: sender?.role ?? "GUARDIAN",
    body: row.body,
    imageUrl,
    createdAt: row.created_at,
  };
}

function normalizeFamilyMediaUpload(image: UploadImageRequest) {
  if (!image.bytes || image.bytes.byteLength === 0) {
    throw new Error("사진 파일을 읽지 못했어요.");
  }
  if (image.bytes.byteLength > maxFamilyMediaBytes) {
    throw new Error("사진은 6MB 이하만 업로드할 수 있어요.");
  }

  const requestedMimeType = image.mimeType?.trim().toLowerCase() || "image/jpeg";
  const mimeType = requestedMimeType === "image/jpg" ? "image/jpeg" : requestedMimeType;

  if (!familyMediaMimeTypes.has(mimeType)) {
    throw new Error("JPG, PNG, WEBP, HEIC 사진만 업로드할 수 있어요.");
  }

  return {
    bytes: image.bytes,
    mimeType,
    extension: familyMediaExtension(mimeType),
  };
}

function familyMediaExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "jpg";
  }
}

async function uploadFamilyMedia(
  supabase: BabyBossSupabaseClient,
  folder: "photos" | "chat",
  familyId: number,
  image: UploadImageRequest,
) {
  const upload = normalizeFamilyMediaUpload(image);
  const objectName = `${folder}/${familyId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${upload.extension}`;
  const { data, error } = await supabase.storage.from(familyMediaBucket).upload(objectName, upload.bytes, {
    contentType: upload.mimeType,
    upsert: false,
  });

  if (error || !data?.path) {
    throw new Error(error?.message ?? "사진을 업로드하지 못했어요.");
  }

  return data.path;
}

async function removeFamilyMedia(supabase: BabyBossSupabaseClient, storagePath: string) {
  await supabase.storage.from(familyMediaBucket).remove([storagePath]).catch(() => undefined);
}

function mapFamilyInvitation(row: FamilyInvitationRow, caregiversById: Map<number, CaregiverRow>): FamilyInvitationCard {
  return {
    id: row.id,
    email: row.email,
    contactPhone: row.contact_phone ?? null,
    role: row.role,
    note: row.note,
    status: row.status,
    invitedByName: row.invited_by_id ? caregiversById.get(row.invited_by_id)?.name ?? null : null,
    createdAt: row.created_at,
  };
}

function mapVaccination(row: VaccinationRow): VaccinationCard {
  return {
    id: row.id,
    name: row.name,
    doseLabel: row.dose_label,
    status: row.status,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    note: row.note,
  };
}

function mapHospitalVisit(row: HospitalVisitRow): HospitalVisitCard {
  return {
    id: row.id,
    hospitalName: row.hospital_name,
    reason: row.reason,
    visitedAt: row.visited_at,
    diagnosis: row.diagnosis,
    note: row.note,
  };
}

function mapExportJob(row: ExportJobRow): ExportJobCard {
  return {
    id: row.id,
    format: row.format,
    sections: Array.isArray(row.sections) ? row.sections.map(String) : [],
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    downloadUrl: row.download_url,
  };
}

function mapChatMessage(
  row: ChatMessageRow,
  caregiversById: Map<number, CaregiverRow>,
  taskTitlesById: Map<number, string>,
  commentsByMessageId = new Map<number, TimelineCommentCard[]>(),
): ChatMessageCard {
  const sender = caregiversById.get(row.sender_id);

  return {
    id: row.id,
    senderName: sender?.name ?? "가족",
    senderRole: sender?.role ?? "GUARDIAN",
    body: row.body,
    createdAt: row.created_at,
    messageType: row.message_type,
    linkedTaskTitle: row.linked_task_id ? taskTitlesById.get(row.linked_task_id) ?? null : null,
    comments: commentsByMessageId.get(row.id) ?? [],
  };
}

function mapTimelineComment(
  row: TimelineCommentRow,
  caregiversById: Map<number, CaregiverRow>,
  replies: TimelineCommentCard[] = [],
): TimelineCommentCard {
  const author = caregiversById.get(row.author_caregiver_id);

  return {
    id: row.id,
    messageId: row.chat_message_id,
    parentCommentId: row.parent_comment_id,
    authorName: author?.name ?? "가족",
    authorRole: author?.role ?? "GUARDIAN",
    body: row.body,
    createdAt: row.created_at,
    replies,
  };
}

function groupTimelineComments(rows: TimelineCommentRow[], caregiversById: Map<number, CaregiverRow>) {
  const repliesByParentId = new Map<number, TimelineCommentCard[]>();

  for (const row of rows) {
    if (row.parent_comment_id == null) {
      continue;
    }

    const current = repliesByParentId.get(row.parent_comment_id) ?? [];
    current.push(mapTimelineComment(row, caregiversById));
    repliesByParentId.set(row.parent_comment_id, current);
  }

  const commentsByMessageId = new Map<number, TimelineCommentCard[]>();

  for (const row of rows) {
    if (row.parent_comment_id != null) {
      continue;
    }

    const current = commentsByMessageId.get(row.chat_message_id) ?? [];
    current.push(mapTimelineComment(row, caregiversById, repliesByParentId.get(row.id) ?? []));
    commentsByMessageId.set(row.chat_message_id, current);
  }

  return commentsByMessageId;
}

function flushPendingPushNotifications(supabase: BabyBossSupabaseClient, familyId: number) {
  void supabase.functions.invoke("send-push-notifications", {
    body: { familyId },
  }).catch((error) => {
    console.warn("Failed to flush pending push notifications.", error);
  });
}

async function loadTaskTitleMap(supabase: BabyBossSupabaseClient, familyId: number, linkedTaskIds: Array<number | null>) {
  const ids = Array.from(new Set(linkedTaskIds.filter((id): id is number => typeof id === "number")));

  if (ids.length === 0) {
    return new Map<number, string>();
  }

  const rows = await readMany<Pick<TaskRow, "id" | "title">>(
    supabase.from("tasks").select("id,title").eq("family_id", familyId).in("id", ids),
  );
  return new Map(rows.map((row) => [row.id, row.title]));
}

function toAgeLabel(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());

  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }

  months = Math.max(months, 0);

  if (months < 24) {
    return `${months}개월`;
  }

  return `${Math.floor(months / 12)}세 ${months % 12}개월`;
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfTodayIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function normalizeTaskRangeBoundary(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : new Date(timestamp).toISOString();
}

function toDbDateTime(value: string) {
  return new Date(value).toISOString();
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeInviteCode(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.toUpperCase() : null;
}

function getGoogleOAuthRedirectUrl(inviteCode?: string | null) {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  const queryParams = normalizedInviteCode ? { invite_code: normalizedInviteCode } : undefined;

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    const url = new URL("/auth/callback", window.location.origin);

    if (normalizedInviteCode) {
      url.searchParams.set("invite_code", normalizedInviteCode);
    }

    return url.toString();
  }

  return Linking.createURL("auth/callback", { queryParams });
}

function searchParamsFrom(value: string) {
  return new URLSearchParams(value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value);
}

function parseOAuthCallbackUrl(url: string): OAuthCallbackParams {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
  const query = queryIndex >= 0 ? url.slice(queryIndex, queryEnd) : "";
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const queryParams = searchParamsFrom(query);
  const hashParams = searchParamsFrom(hash);
  const read = (key: string) => hashParams.get(key) ?? queryParams.get(key);

  return {
    inviteCode: normalizeInviteCode(queryParams.get("invite_code") ?? hashParams.get("invite_code")),
    code: read("code"),
    accessToken: read("access_token"),
    refreshToken: read("refresh_token"),
    errorCode: read("error_code") ?? read("error"),
    errorDescription: read("error_description"),
  };
}

function getCurrentUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.href) {
    return window.location.href;
  }

  return Linking.getLinkingURL();
}

function redirectBrowserTo(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    window.location.assign(url);
    return Promise.resolve();
  }

  return Linking.openURL(url);
}

async function assertGoogleProviderEnabled() {
  const config = getSupabaseConfig();

  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: config.supabaseAnonKey,
      },
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { external?: { google?: boolean } };

    if (payload.external?.google === false) {
      throw new Error("Google provider is not enabled");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Google provider is not enabled")) {
      throw error;
    }
  }
}

function logTypeTitle(type: LogType) {
  switch (type) {
    case "FEEDING":
      return "수유";
    case "SLEEP":
      return "수면";
    case "GROWTH":
      return "성장";
    case "MOMENT":
      return "메모";
    case "MEDICINE":
      return "복약";
    case "CHECKLIST":
      return "체크리스트";
    case "DIAPER":
      return "배변";
    case "TEMPERATURE":
      return "체온";
    case "PUMPING":
      return "유축";
    case "MEMO":
      return "메모";
  }
}

function matchesQuery(query: string, values: Array<unknown>) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");

  if (!normalized) {
    return true;
  }

  return values.some((value) => String(value ?? "").toLocaleLowerCase("ko-KR").includes(normalized));
}

function newestFirst(a: SearchResultCard, b: SearchResultCard) {
  return Date.parse(b.happenedAt) - Date.parse(a.happenedAt);
}

function buildNotifications(
  family: FamilyRow,
  currentCaregiver: CaregiverRow,
  tasksToday: TaskRow[],
  recentCreatedTasks: TaskRow[],
  upcomingPendingTasks: TaskRow[],
  schedules: ScheduleRow[],
  recentMessages: ChatMessageRow[],
  upcomingRecordAlarms: RecordAlarmScheduleRow[],
  caregiversById: Map<number, CaregiverRow>,
) {
  const notifications: NotificationCard[] = [];
  const pendingTasks = tasksToday.filter((task) => task.status !== "DONE").length;

  if (pendingTasks > 0) {
    notifications.push({
      title: "오늘 남은 육아 작업",
      body: `아직 ${pendingTasks}개의 할 일이 남아 있어요.`,
      tone: "warning",
    });
  }

  const otherCreatedTask = recentCreatedTasks.find(
    (task) => task.created_by_id && task.created_by_id !== currentCaregiver.id && task.status !== "DONE",
  );

  if (otherCreatedTask) {
    const creator = caregiversById.get(otherCreatedTask.created_by_id ?? 0);
    const assignee = otherCreatedTask.assignee_id ? caregiversById.get(otherCreatedTask.assignee_id) : null;
    notifications.push({
      title: "새 할 일 도착",
      body: `${creator?.name ?? "가족"}님이 ${otherCreatedTask.title} 일을 등록했어요. 담당은 ${assignee?.name ?? "가족"}님이에요.`,
      tone: "positive",
    });
  }

  const reminderTask = upcomingPendingTasks.find(
    (task) => task.reminder_minutes_before != null && task.created_by_id !== currentCaregiver.id && isReminderDue(task),
  );

  if (reminderTask) {
    const assignee = reminderTask.assignee_id ? caregiversById.get(reminderTask.assignee_id) : null;
    notifications.push({
      title: "할 일 리마인더",
      body: `${reminderTask.title} 일을 ${formatReminderWindow(reminderTask.due_at)} 전까지 챙겨야 해요. 담당은 ${assignee?.name ?? "가족"}님이에요.`,
      tone: "warning",
    });
  }

  if (upcomingRecordAlarms[0] && family.push_notifications_enabled) {
    notifications.push({
      title: `${logTypeTitle(upcomingRecordAlarms[0].log_type)} 알람 예정`,
      body: `${formatReminderWindow(upcomingRecordAlarms[0].scheduled_for)} 뒤 다음 기록 알람이 도착해요.`,
      tone: "info",
    });
  }

  if (schedules[0] && Date.parse(schedules[0].start_at) < Date.now() + 24 * 60 * 60 * 1000) {
    notifications.push({
      title: "다가오는 일정",
      body: `${schedules[0].title} 일정이 곧 시작돼요.`,
      tone: "info",
    });
  }

  if (recentMessages[0] && family.chat_notifications_enabled) {
    const sender = caregiversById.get(recentMessages[0].sender_id);
    notifications.push({
      title: "가족 채팅 업데이트",
      body: `${sender?.name ?? "가족"}님이 새 메시지를 남겼어요.`,
      tone: "positive",
    });
  }

  if (!family.push_notifications_enabled) {
    notifications.push({
      title: "푸시 알림 꺼짐",
      body: "중요한 할 일과 채팅 알림을 놓칠 수 있어요.",
      tone: "muted",
    });
  }

  return notifications.slice(0, 4);
}

function isReminderDue(task: TaskRow) {
  if (task.reminder_minutes_before == null) {
    return false;
  }

  const reminderAt = Date.parse(task.due_at) - task.reminder_minutes_before * 60 * 1000;
  const dueAt = Date.parse(task.due_at);
  const now = Date.now();
  return now >= reminderAt && now < dueAt;
}

function formatReminderWindow(dueAt: string) {
  const minutesUntilDue = Math.max(Math.floor((Date.parse(dueAt) - Date.now()) / 60000), 0);

  if (minutesUntilDue < 60) {
    return `${minutesUntilDue}분`;
  }

  const hours = Math.floor(minutesUntilDue / 60);
  const minutes = minutesUntilDue % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

async function describeAssignment(context: CurrentContext, caregiver: CaregiverRow) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [recentCompleted, pendingToday] = await Promise.all([
    readMany<Pick<TaskRow, "id">>(
      context.supabase
        .from("tasks")
        .select("id")
        .eq("family_id", context.family.id)
        .eq("assignee_id", caregiver.id)
        .eq("status", "DONE")
        .gte("completed_at", oneWeekAgo),
    ),
    readMany<Pick<TaskRow, "id">>(
      context.supabase
        .from("tasks")
        .select("id")
        .eq("family_id", context.family.id)
        .eq("assignee_id", caregiver.id)
        .neq("status", "DONE")
        .gte("due_at", startOfTodayIso())
        .lte("due_at", endOfTodayIso()),
    ),
  ]);

  const recentCompletedTasks = recentCompleted.length;
  const pendingTasksToday = pendingToday.length;
  const assignmentScore = roundScore(recentCompletedTasks * 0.45 + pendingTasksToday * 0.8);

  return {
    recentCompletedTasks,
    pendingTasksToday,
    assignmentScore,
    scoreReason: `최근 완료 ${recentCompletedTasks}건 · 오늘 남은 ${pendingTasksToday}건`,
  };
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

export async function fetchBootstrap() {
  return runSupabase(async () => {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session) {
      return null;
    }

    try {
      const context = await loadCurrentContext(supabase, data.session);
      return mapBootstrap(context);
    } catch {
      await supabase.auth.signOut();
      return null;
    }
  }, "초기 정보를 불러오지 못했어요.");
}

export async function joinFamily(payload: {
  inviteCode: string;
  email: string;
  caregiverName: string;
  role: CaregiverRole;
  password: string;
}) {
  return runSupabase(async () => {
    const { supabase, session } = await ensureAuthSession();
    try {
      await joinByInvite(supabase, payload);
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
    const context = await loadCurrentContext(supabase, session);
    return mapSession(context);
  }, "보호자 등록에 실패했어요.");
}

export async function login(payload: { email: string; password: string }) {
  return runSupabase(async () => {
    const { supabase, session } = await ensureAuthSession();
    try {
      await loginByEmail(supabase, payload);
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
    const context = await loadCurrentContext(supabase, session);
    return mapSession(context);
  }, "로그인에 실패했어요.");
}

export async function startGoogleAuth(payload: { inviteCode?: string } = {}) {
  return runSupabase(async () => {
    const supabase = requireSupabaseClient();
    await assertGoogleProviderEnabled();
    const redirectTo = getGoogleOAuthRedirectUrl(payload.inviteCode);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.url) {
      throw new Error("Google OAuth authorization URL was not returned");
    }

    await redirectBrowserTo(data.url);
  }, "Google 로그인에 실패했어요.");
}

export async function completeGoogleAuth(callbackUrl?: string | null) {
  return runSupabase(async () => {
    const supabase = requireSupabaseClient();
    const url = callbackUrl ?? getCurrentUrl();

    if (!url) {
      throw new Error("Google OAuth callback URL was not found");
    }

    const params = parseOAuthCallbackUrl(url);

    if (params.errorCode) {
      throw new Error(params.errorDescription ?? params.errorCode);
    }

    let session: Session | null = null;

    if (params.accessToken && params.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });

      if (error) {
        throw new Error(error.message);
      }

      session = data.session;
    } else if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);

      if (error) {
        throw new Error(error.message);
      }

      session = data.session;
    } else {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw new Error(error.message);
      }

      session = data.session;
    }

    if (!session) {
      throw new Error("Google OAuth session was not created");
    }

    const { error } = await supabase.rpc("complete_google_oauth_caregiver", {
      p_invite_code: params.inviteCode,
    });

    if (error) {
      await supabase.auth.signOut();
      throw new Error(error.message);
    }

    const context = await loadCurrentContext(supabase, session);
    return mapSession(context);
  }, "Google 로그인에 실패했어요.");
}

export async function restoreSession() {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    return mapSession(context);
  }, "세션을 복원하지 못했어요.");
}

export async function logout() {
  return runSupabase(async () => {
    const supabase = requireSupabaseClient();
    await supabase.auth.signOut();
  }, "로그아웃하지 못했어요.");
}

export async function fetchDashboard(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const child = requireContextChild(context);

    const now = new Date();
    const caregiversById = caregiverMap(context.caregivers);
    const [
      tasksTodayInitial,
      recentCreatedTasks,
      upcomingPendingTasks,
      schedules,
      recentLogs,
      recentMessages,
      upcomingRecordAlarms,
      caregiverLoads,
    ] = await Promise.all([
      readMany<TaskRow>(
        supabase
          .from("tasks")
          .select("*")
          .eq("family_id", familyId)
          .gte("due_at", startOfTodayIso())
          .lte("due_at", endOfTodayIso())
          .order("due_at", { ascending: true }),
      ),
      readMany<TaskRow>(
        supabase
          .from("tasks")
          .select("*")
          .eq("family_id", familyId)
          .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(8),
      ),
      readMany<TaskRow>(
        supabase
          .from("tasks")
          .select("*")
          .eq("family_id", familyId)
          .neq("status", "DONE")
          .gt("due_at", now.toISOString())
          .order("due_at", { ascending: true })
          .limit(12),
      ),
      readMany<ScheduleRow>(
        supabase
          .from("schedules")
          .select("*")
          .eq("family_id", familyId)
          .gt("start_at", now.toISOString())
          .order("start_at", { ascending: true })
          .limit(6),
      ),
      readMany<LogRow>(
        supabase.from("logs").select("*").eq("family_id", familyId).order("recorded_at", { ascending: false }).limit(8),
      ),
      readMany<ChatMessageRow>(
        supabase.from("chat_messages").select("*").eq("family_id", familyId).order("created_at", { ascending: false }).limit(4),
      ),
      readMany<RecordAlarmScheduleRow>(
        supabase
          .from("record_alarm_schedules")
          .select("*")
          .eq("family_id", familyId)
          .eq("status", "SCHEDULED")
          .gte("scheduled_for", now.toISOString())
          .order("scheduled_for", { ascending: true })
          .limit(4),
      ),
      Promise.all(
        context.caregivers.map(async (caregiver) => ({
          ...mapCaregiver(caregiver),
          ...(await describeAssignment(context, caregiver)),
        })),
      ),
    ]);

    const tasksToday = tasksTodayInitial;
    const taskTitlesById = await loadTaskTitleMap(supabase, familyId, recentMessages.map((message) => message.linked_task_id));
    const pendingTasks = tasksToday.filter((task) => task.status !== "DONE").length;
    const completedToday = tasksToday.filter((task) => task.status === "DONE").length;
    const notifications = buildNotifications(
      context.family,
      context.caregiver,
      tasksToday,
      recentCreatedTasks,
      upcomingPendingTasks,
      schedules,
      recentMessages,
      upcomingRecordAlarms,
      caregiversById,
    );

    const dashboard: DashboardResponse = {
      generatedAt: now.toISOString(),
      family: mapFamily(context.family),
      child: mapChild(child),
      stats: {
        pendingTasks,
        completedToday,
        upcomingSchedules: schedules.length,
        unreadHighlights: notifications.length,
      },
      caregiverLoad: caregiverLoads,
      tasksToday: tasksToday.map((task) => mapTask(task, caregiversById)),
      upcomingSchedules: schedules.map(mapSchedule),
      recentLogs: recentLogs.map((log) => mapLog(log, caregiversById)),
      recentMessages: recentMessages.map((message) => mapChatMessage(message, caregiversById, taskTitlesById)),
      notifications,
    };

    return dashboard;
  }, "대시보드를 불러오지 못했어요.");
}

export async function fetchChat(familyId: number, options: FetchChatOptions = {}) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    let query = supabase.from("chat_messages").select("*").eq("family_id", familyId);
    if (options.startAt) {
      query = query.gte("created_at", options.startAt);
    }
    if (options.endAt) {
      query = query.lt("created_at", options.endAt);
    }

    const messages = await readMany<ChatMessageRow>(query.order("created_at", { ascending: false }).limit(options.limit ?? 80));
    const caregiversById = caregiverMap(context.caregivers);
    const messageIds = messages.map((message) => message.id);
    let comments: TimelineCommentRow[] = [];
    if (messageIds.length > 0) {
      try {
        comments = await readMany<TimelineCommentRow>(
          supabase
            .from("timeline_comments")
            .select("*")
            .eq("family_id", familyId)
            .in("chat_message_id", messageIds)
            .order("created_at", { ascending: true }),
        );
      } catch (commentError) {
        if (!isMissingTimelineCommentsTable(commentError)) {
          throw commentError;
        }
      }
    }
    const taskTitlesById = await loadTaskTitleMap(supabase, familyId, messages.map((message) => message.linked_task_id));
    const commentsByMessageId = groupTimelineComments(comments, caregiversById);
    const response: ChatResponse = {
      family: mapFamily(context.family),
      messages: messages.map((message) => mapChatMessage(message, caregiversById, taskTitlesById, commentsByMessageId)),
    };

    return response;
  }, "채팅을 불러오지 못했어요.");
}

export async function createChatMessage(familyId: number, payload: CreateChatMessageRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<ChatMessageRow>(
      supabase.rpc("create_chat_message_checked", {
        p_family_id: familyId,
        p_body: payload.body.trim(),
        p_message_type: payload.messageType ?? "TEXT",
        p_linked_task_id: payload.linkedTaskId ?? null,
      }),
      "메시지를 저장하지 못했어요.",
    );
    const taskTitlesById = await loadTaskTitleMap(supabase, familyId, [row.linked_task_id]);

    flushPendingPushNotifications(supabase, familyId);

    return mapChatMessage(row, caregiverMap(context.caregivers), taskTitlesById);
  }, "메시지를 보내지 못했어요.");
}

export async function fetchFamilyChat(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    let rows: FamilyChatMessageRow[];
    try {
      rows = await readMany<FamilyChatMessageRow>(
        supabase
          .from("family_chat_messages")
          .select("*")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false })
          .limit(120),
      );
    } catch (error) {
      if (!isMissingFamilyMediaSchema(error)) {
        throw error;
      }

      return {
        family: mapFamily(context.family),
        messages: [],
      } satisfies FamilyChatResponse;
    }
    const caregiversById = caregiverMap(context.caregivers);
    const messages = await Promise.all(
      rows.map(async (row) =>
        mapFamilyChatMessage(
          row,
          row.image_storage_path ? await createFamilyMediaSignedUrl(supabase, row.image_storage_path) : null,
          caregiversById,
        ),
      ),
    );

    return {
      family: mapFamily(context.family),
      messages,
    } satisfies FamilyChatResponse;
  }, "가족 대화를 불러오지 못했어요.");
}

export async function createFamilyChatMessage(familyId: number, payload: CreateFamilyChatMessageRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const body = payload.body?.trim() ?? "";
    let imageStoragePath: string | null = null;

    if (payload.image) {
      imageStoragePath = await uploadFamilyMedia(supabase, "chat", familyId, payload.image);
    }

    try {
      const row = await readRpcRow<FamilyChatMessageRow>(
        supabase.rpc("create_family_chat_message_checked", {
          p_family_id: familyId,
          p_body: body,
          p_image_storage_path: imageStoragePath,
        }),
        "가족 메시지를 저장하지 못했어요.",
      );

      flushPendingPushNotifications(supabase, familyId);

      return mapFamilyChatMessage(
        row,
        imageStoragePath ? await createFamilyMediaSignedUrl(supabase, imageStoragePath) : null,
        caregiverMap(context.caregivers),
      );
    } catch (error) {
      if (imageStoragePath) {
        await removeFamilyMedia(supabase, imageStoragePath);
      }
      throw error;
    }
  }, "가족 메시지를 보내지 못했어요.");
}

export async function createTimelineComment(familyId: number, payload: CreateTimelineCommentRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);
    const row = await readRpcRow<TimelineCommentRow>(
      supabase.rpc("create_timeline_comment_checked", {
        p_family_id: familyId,
        p_chat_message_id: payload.messageId,
        p_parent_comment_id: payload.parentCommentId ?? null,
        p_body: payload.body.trim(),
      }),
      "댓글을 저장하지 못했어요.",
    );

    flushPendingPushNotifications(supabase, familyId);

    return mapTimelineComment(row, caregiverMap(context.caregivers));
  }, "댓글을 저장하지 못했어요.");
}

export async function fetchSettings(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);
    const [preferences, recordAlarmRules, recordSharePreferences] = await Promise.all([
      readMany<NotificationPreferencesRow>(supabase.from("notification_preferences").select("*").eq("family_id", familyId).limit(1)),
      readMany<RecordAlarmRuleRow>(
        supabase
          .from("record_alarm_rules")
          .select("*")
          .eq("family_id", familyId)
          .order("log_type", { ascending: true }),
      ),
      readMany<RecordSharePreferenceRow>(
        supabase
          .from("record_share_preferences")
          .select("*")
          .eq("family_id", familyId)
          .eq("caregiver_id", context.caregiver.id)
          .limit(1),
      ),
    ]);

    const response: SettingsResponse = {
      family: mapFamily(context.family),
      child: context.child ? mapChild(context.child) : null,
      settings: mapSettings(context.family),
      notificationPreferences: mapNotificationPreferences(preferences[0]),
      recordAlarmRules: mergeRecordAlarmRules(familyId, recordAlarmRules),
      recordSharePreference: recordSharePreferences[0]
        ? mapRecordSharePreference(recordSharePreferences[0])
        : fallbackRecordSharePreference(familyId, context.caregiver.id),
      caregivers: context.caregivers.map(mapCaregiver),
    };

    return response;
  }, "설정을 불러오지 못했어요.");
}

export async function fetchNotebook(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const [schedules, memories] = await Promise.all([
      readMany<ScheduleRow>(
        supabase
          .from("schedules")
          .select("*")
          .eq("family_id", familyId)
          .gt("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(6),
      ),
      readMany<MemoryRow>(
        supabase.from("memory_entries").select("*").eq("family_id", familyId).order("happened_at", { ascending: false }).limit(20),
      ),
    ]);

    const response: NotebookResponse = {
      family: mapFamily(context.family),
      child: context.child ? mapChild(context.child) : null,
      schedules: schedules.map(mapSchedule),
      memories: memories.map((memory) => mapMemory(memory, caregiverMap(context.caregivers))),
    };

    return response;
  }, "수첩을 불러오지 못했어요.");
}

export async function updateSettings(familyId: number, payload: UpdateFamilySettingsRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const patch: Partial<FamilyRow> = {};

    if (payload.pushNotificationsEnabled != null) {
      patch.push_notifications_enabled = payload.pushNotificationsEnabled;
    }
    if (payload.chatNotificationsEnabled != null) {
      patch.chat_notifications_enabled = payload.chatNotificationsEnabled;
    }
    if (payload.morningBriefingEnabled != null) {
      patch.morning_briefing_enabled = payload.morningBriefingEnabled;
    }
    if (payload.subscriptionPlan != null) {
      patch.subscription_plan = payload.subscriptionPlan;
    }

    await readOne<FamilyRow>(supabase.from("families").update(patch).eq("id", familyId).select("*").single(), "설정을 저장하지 못했어요.");
    return fetchSettings(familyId);
  }, "설정을 바꾸지 못했어요.");
}

export async function updateChildProfile(childId: number, payload: UpdateChildProfileRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);

    if (!context.child || context.child.id !== childId) {
      throw new Error("현재 가족 보드의 아이 정보만 수정할 수 있어요.");
    }

    const patch: Record<string, string | null> = {};

    if (payload.name != null) {
      patch.name = payload.name.trim();
    }
    if (payload.birthDate != null) {
      patch.birth_date = payload.birthDate;
    }
    if (payload.stage != null) {
      patch.stage = payload.stage;
    }
    if (payload.imageUrl !== undefined) {
      patch.image_url = payload.imageUrl;
    }

    const row = await readOne<ChildRow>(
      supabase.from("children").update(patch).eq("id", childId).eq("family_id", context.family.id).select("*").single(),
      "아이 정보를 저장하지 못했어요.",
    );

    return mapChild(row);
  }, "아이 정보를 바꾸지 못했어요.");
}

export async function createChildProfile(familyId: number, payload: CreateChildProfileRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readOne<ChildRow>(
      supabase
        .from("children")
        .insert({
          family_id: familyId,
          name: payload.name.trim(),
          birth_date: payload.birthDate,
          stage: payload.stage,
          image_url: payload.imageUrl ?? null,
        })
        .select("*")
        .single(),
      "아이 정보를 저장하지 못했어요.",
    );

    return mapChild(row);
  }, "아이 정보를 저장하지 못했어요.");
}

export async function updateCaregiverProfile(caregiverId: number, payload: UpdateCaregiverProfileRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);

    if (context.caregiver.id !== caregiverId) {
      throw new Error("본인 프로필만 수정할 수 있어요.");
    }

    const patch: Record<string, string | null> = {};

    if (payload.name != null) {
      patch.name = payload.name.trim();
    }
    if (payload.imageUrl !== undefined) {
      patch.image_url = payload.imageUrl;
    }

    const row = await readOne<CaregiverRow>(
      supabase.from("caregivers").update(patch).eq("id", caregiverId).eq("family_id", context.family.id).select(caregiverSelectFields).single(),
      "프로필을 저장하지 못했어요.",
    );

    return mapCaregiver(row);
  }, "프로필을 바꾸지 못했어요.");
}

export async function updateCaregiverPersonalInfo(caregiverId: number, payload: UpdateCaregiverPersonalInfoRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);

    if (context.caregiver.id !== caregiverId) {
      throw new Error("Only your own profile can be updated");
    }

    const updatedCaregiverId = await readRpcRow<number>(
      supabase.rpc("update_caregiver_personal_info_checked", {
        p_caregiver_id: caregiverId,
        p_name: payload.name.trim(),
        p_role: payload.role,
        p_contact_phone: payload.contactPhone?.trim() || null,
        p_current_password: payload.currentPassword?.trim() || null,
        p_new_password: payload.newPassword || null,
      }),
      "개인정보를 저장하지 못했어요.",
    );

    if (updatedCaregiverId !== caregiverId) {
      throw new Error("개인정보를 저장하지 못했어요.");
    }

    const refreshedContext = await loadCurrentContext(supabase, session);
    return mapCaregiver(refreshedContext.caregiver);
  }, "개인정보를 저장하지 못했어요.");
}

export async function createSchedule(familyId: number, payload: CreateScheduleRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<ScheduleRow>(
      supabase.rpc("create_schedule_with_chat", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_title: payload.title.trim(),
        p_category: payload.category,
        p_start_at: toDbDateTime(payload.startAt),
        p_end_at: toDbDateTime(payload.endAt),
        p_note: blankToNull(payload.note),
      }),
      "일정을 저장하지 못했어요.",
    );
    return mapSchedule(row);
  }, "일정을 저장하지 못했어요.");
}

export async function createMemory(familyId: number, payload: CreateMemoryRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<MemoryRow>(
      supabase.rpc("create_memory_with_chat", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_title: payload.title.trim(),
        p_note: blankToNull(payload.note),
        p_image_url: blankToNull(payload.imageUrl),
        p_tag: blankToNull(payload.tag),
        p_happened_at: toDbDateTime(payload.happenedAt),
      }),
      "기억을 저장하지 못했어요.",
    );
    return mapMemory(row, caregiverMap(context.caregivers));
  }, "기억을 저장하지 못했어요.");
}

export async function createTask(familyId: number, payload: CreateTaskRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    if (payload.assigneeId != null && !context.caregivers.some((caregiver) => caregiver.id === payload.assigneeId)) {
      throw new Error("담당 보호자를 찾지 못했어요.");
    }

    const notificationRecipientIds = Array.from(new Set(payload.notificationRecipientIds ?? []));

    if (notificationRecipientIds.some((id) => !context.caregivers.some((caregiver) => caregiver.id === id))) {
      throw new Error("알림 대상 보호자를 찾지 못했어요.");
    }

    const row = await readRpcRow<TaskRow>(
      supabase.rpc("create_task_with_chat", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_assignee_id: payload.assigneeId ?? null,
        p_title: payload.title.trim(),
        p_description: blankToNull(payload.description),
        p_due_at: toDbDateTime(payload.dueAt),
        p_priority: payload.priority ?? "MEDIUM",
        p_reminder_minutes_before: payload.reminderMinutesBefore ?? null,
        p_reminder_after_minutes: payload.reminderAfterMinutes ?? null,
        p_reminder_recipient_ids: notificationRecipientIds,
      }),
      "할 일을 저장하지 못했어요.",
    );
    flushPendingPushNotifications(supabase, familyId);
    return mapTask(row, caregiverMap(context.caregivers));
  }, "할 일을 저장하지 못했어요.");
}

export async function fetchTasks(familyId: number, options: FetchTasksOptions = {}) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const startAt = normalizeTaskRangeBoundary(options.startAt, startOfTodayIso());
    const endAt = normalizeTaskRangeBoundary(options.endAt, endOfTodayIso());

    if (Date.parse(startAt) > Date.parse(endAt)) {
      throw new Error("조회 기간을 확인해 주세요.");
    }

    const rows = await readMany<TaskRow>(
      supabase
        .from("tasks")
        .select("*")
        .eq("family_id", familyId)
        .gte("due_at", startAt)
        .lte("due_at", endAt)
        .order("due_at", { ascending: true }),
    );

    return rows.map((row) => mapTask(row, caregiverMap(context.caregivers)));
  }, "분담 목록을 불러오지 못했어요.");
}

export async function completeTask(taskId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    const row = await readRpcRow<TaskRow>(
      supabase.rpc("complete_task_with_chat", {
        p_task_id: taskId,
      }),
      "할 일 상태를 저장하지 못했어요.",
    );
    return mapTask(row, caregiverMap(context.caregivers));
  }, "할 일 상태를 바꾸지 못했어요.");
}

export async function createLog(familyId: number, payload: CreateLogRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<LogRow>(
      supabase.rpc("create_care_record_with_chat", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_type: payload.type,
        p_value: payload.value.trim(),
        p_note: blankToNull(payload.note),
        p_recorded_at: toDbDateTime(payload.recordedAt),
        p_recorded_end_at: payload.recordedEndAt ? toDbDateTime(payload.recordedEndAt) : null,
        p_record_subtype: blankToNull(payload.recordSubtype),
        p_details: payload.details ?? {},
        p_share_enabled: payload.shareWithFamily ?? null,
        p_excluded_caregiver_ids: payload.shareWithFamily === undefined ? null : payload.excludedRecipientIds ?? [],
      }),
      "생활 기록을 저장하지 못했어요.",
    );

    let nextAlarmMinutes = payload.nextAlarmMinutes ?? null;
    let notifyScope = payload.alarmNotifyScope ?? "FAMILY";

    if (payload.nextAlarmMinutes === undefined) {
      const rules = await readMany<RecordAlarmRuleRow>(
        supabase
          .from("record_alarm_rules")
          .select("*")
          .eq("family_id", familyId)
          .eq("log_type", row.type)
          .limit(1),
      );
      const rule = rules[0];

      if (rule?.enabled) {
        nextAlarmMinutes = rule.interval_minutes;
        notifyScope = rule.notify_scope;
      }
    }

    if (typeof nextAlarmMinutes === "number") {
      await readRpcRow<RecordAlarmScheduleRow>(
        supabase.rpc("schedule_record_alarm_checked", {
          p_family_id: familyId,
          p_child_id: row.child_id ?? requireContextChild(context).id,
          p_source_log_id: row.id,
          p_log_type: row.type,
          p_recorded_at: row.recorded_at,
          p_interval_minutes: nextAlarmMinutes,
          p_notify_scope: notifyScope,
        }),
        "기록 알람을 예약하지 못했어요.",
      );
    }

    flushPendingPushNotifications(supabase, familyId);

    return mapLog(row, caregiverMap(context.caregivers));
  }, "생활 기록을 저장하지 못했어요.");
}

export async function fetchLogs(familyId: number, options: FetchLogsOptions = {}) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const limit = Math.min(Math.max(options.limit ?? 80, 1), 200);
    const rows = await readMany<LogRow>(
      supabase.from("logs").select("*").eq("family_id", familyId).order("recorded_at", { ascending: false }).limit(limit),
    );

    return rows.map((row) => mapLog(row, caregiverMap(context.caregivers)));
  }, "기록 목록을 불러오지 못했어요.");
}

export async function updateLog(payload: UpdateLogRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);

    const row = await readRpcRow<LogRow>(
      supabase.rpc("update_care_record_checked", {
        p_log_id: payload.id,
        p_value: payload.value.trim(),
        p_note: blankToNull(payload.note),
        p_recorded_at: toDbDateTime(payload.recordedAt),
        p_recorded_end_at: payload.recordedEndAt ? toDbDateTime(payload.recordedEndAt) : null,
        p_record_subtype: blankToNull(payload.recordSubtype),
        p_details: payload.details ?? {},
      }),
      "생활 기록을 저장하지 못했어요.",
    );

    return mapLog(row, caregiverMap(context.caregivers));
  }, "생활 기록을 바꾸지 못했어요.");
}

export async function deleteLog(logId: number) {
  return runSupabase(async () => {
    const { supabase } = await readExistingSession();
    await readRpcRow<number>(
      supabase.rpc("delete_care_record_checked", {
        p_log_id: logId,
      }),
      "생활 기록을 삭제하지 못했어요.",
    );
    return logId;
  }, "생활 기록을 삭제하지 못했어요.");
}

export async function fetchGrowthMeasurements(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const rows = await readMany<GrowthMeasurementRow>(
      supabase
        .from("growth_measurements")
        .select("*")
        .eq("family_id", familyId)
        .order("measured_at", { ascending: false })
        .limit(40),
    );

    return rows.map((row) => mapGrowthMeasurement(row, caregiverMap(context.caregivers)));
  }, "성장 기록을 불러오지 못했어요.");
}

export async function createGrowthMeasurement(familyId: number, payload: CreateGrowthMeasurementRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<GrowthMeasurementRow>(
      supabase.rpc("create_growth_measurement_checked", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_measured_at: toDbDateTime(payload.measuredAt),
        p_height_cm: payload.heightCm ?? null,
        p_weight_kg: payload.weightKg ?? null,
        p_head_circumference_cm: payload.headCircumferenceCm ?? null,
        p_note: blankToNull(payload.note),
        p_share_enabled: payload.shareWithFamily ?? null,
        p_excluded_caregiver_ids: payload.shareWithFamily === undefined ? null : payload.excludedRecipientIds ?? [],
      }),
      "성장 기록을 저장하지 못했어요.",
    );

    flushPendingPushNotifications(supabase, familyId);

    return mapGrowthMeasurement(row, caregiverMap(context.caregivers));
  }, "성장 기록을 저장하지 못했어요.");
}

export async function updateNotificationPreferences(familyId: number, payload: UpdateNotificationPreferencesRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<NotificationPreferencesRow>(
      supabase.rpc("upsert_notification_preferences_checked", {
        p_family_id: familyId,
        p_feeding_enabled: payload.feedingEnabled,
        p_medicine_enabled: payload.medicineEnabled,
        p_vaccination_enabled: payload.vaccinationEnabled,
        p_growth_enabled: payload.growthEnabled,
        p_briefing_enabled: payload.briefingEnabled,
        p_health_alerts_enabled: payload.healthAlertsEnabled,
        p_daily_time: payload.dailyTime,
      }),
      "알림 설정을 저장하지 못했어요.",
    );

    return mapNotificationPreferences(row);
  }, "알림 설정을 바꾸지 못했어요.");
}

export async function fetchRecordAlarmRules(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const rows = await readMany<RecordAlarmRuleRow>(
      supabase
        .from("record_alarm_rules")
        .select("*")
        .eq("family_id", familyId)
        .order("log_type", { ascending: true }),
    );

    return mergeRecordAlarmRules(familyId, rows);
  }, "기록 알람 설정을 불러오지 못했어요.");
}

export async function upsertRecordAlarmRule(familyId: number, payload: UpdateRecordAlarmRuleRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<RecordAlarmRuleRow>(
      supabase.rpc("upsert_record_alarm_rule_checked", {
        p_family_id: familyId,
        p_log_type: payload.logType,
        p_enabled: payload.enabled,
        p_interval_minutes: payload.intervalMinutes,
        p_notify_scope: payload.notifyScope ?? "FAMILY",
      }),
      "기록 알람 설정을 저장하지 못했어요.",
    );

    return mapRecordAlarmRule(row);
  }, "기록 알람 설정을 바꾸지 못했어요.");
}

export async function fetchFamilyInvitations(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const rows = await readMany<FamilyInvitationRow>(
      supabase.from("family_invitations").select("*").eq("family_id", familyId).order("created_at", { ascending: false }).limit(30),
    );

    return rows.map((row) => mapFamilyInvitation(row, caregiverMap(context.caregivers)));
  }, "가족 초대 목록을 불러오지 못했어요.");
}

export async function createFamilyInvitation(familyId: number, payload: CreateFamilyInvitationRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<FamilyInvitationRow>(
      supabase.rpc("create_family_invitation_checked", {
        p_family_id: familyId,
        p_email: payload.email,
        p_contact_phone: blankToNull(payload.contactPhone),
        p_role: payload.role,
        p_note: blankToNull(payload.note),
      }),
      "가족 초대를 저장하지 못했어요.",
    );

    return mapFamilyInvitation(row, caregiverMap(context.caregivers));
  }, "가족 초대를 보내지 못했어요.");
}

export async function fetchVaccinations(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const rows = await readMany<VaccinationRow>(
      supabase.from("vaccination_records").select("*").eq("family_id", familyId).order("due_at", { ascending: true }).limit(80),
    );

    return rows.map(mapVaccination);
  }, "예방접종 기록을 불러오지 못했어요.");
}

export async function createVaccination(familyId: number, payload: CreateVaccinationRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<VaccinationRow>(
      supabase.rpc("create_vaccination_record_checked", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_name: payload.name.trim(),
        p_dose_label: blankToNull(payload.doseLabel),
        p_status: payload.status ?? "SCHEDULED",
        p_due_at: toDbDateTime(payload.dueAt),
        p_completed_at: payload.completedAt ? toDbDateTime(payload.completedAt) : null,
        p_note: blankToNull(payload.note),
        p_share_enabled: payload.shareWithFamily ?? null,
        p_excluded_caregiver_ids: payload.shareWithFamily === undefined ? null : payload.excludedRecipientIds ?? [],
      }),
      "예방접종 기록을 저장하지 못했어요.",
    );

    flushPendingPushNotifications(supabase, familyId);

    return mapVaccination(row);
  }, "예방접종 기록을 저장하지 못했어요.");
}

export async function fetchHospitalVisits(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const rows = await readMany<HospitalVisitRow>(
      supabase.from("hospital_visits").select("*").eq("family_id", familyId).order("visited_at", { ascending: false }).limit(80),
    );

    return rows.map(mapHospitalVisit);
  }, "병원 방문 기록을 불러오지 못했어요.");
}

export async function createHospitalVisit(familyId: number, payload: CreateHospitalVisitRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<HospitalVisitRow>(
      supabase.rpc("create_hospital_visit_checked", {
        p_family_id: familyId,
        p_child_id: payload.childId ?? requireContextChild(context).id,
        p_hospital_name: payload.hospitalName.trim(),
        p_reason: blankToNull(payload.reason),
        p_visited_at: toDbDateTime(payload.visitedAt),
        p_diagnosis: blankToNull(payload.diagnosis),
        p_note: blankToNull(payload.note),
        p_share_enabled: payload.shareWithFamily ?? null,
        p_excluded_caregiver_ids: payload.shareWithFamily === undefined ? null : payload.excludedRecipientIds ?? [],
      }),
      "병원 방문 기록을 저장하지 못했어요.",
    );

    flushPendingPushNotifications(supabase, familyId);

    return mapHospitalVisit(row);
  }, "병원 방문 기록을 저장하지 못했어요.");
}

export async function fetchPhotoAlbum(familyId: number) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const caregiversById = caregiverMap(context.caregivers);
    const legacyAttachments = await readMany<RecordAttachmentRow>(
      supabase
        .from("record_attachments")
        .select("*")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(120),
    );
    let rows: FamilyPhotoRow[] = [];

    try {
      rows = await readMany<FamilyPhotoRow>(
        supabase
          .from("family_photos")
          .select("*")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false })
          .limit(120),
      );
    } catch (error) {
      if (!isMissingFamilyMediaSchema(error)) {
        throw error;
      }
    }

    const familyPhotos = await Promise.all(
      rows.map(async (row) => mapFamilyPhoto(row, await createFamilyMediaSignedUrl(supabase, row.storage_path), caregiversById)),
    );

    return [...familyPhotos, ...legacyAttachments.map((row) => mapRecordAttachmentAsFamilyPhoto(row, caregiversById))].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }, "사진 앨범을 불러오지 못했어요.");
}

export async function createFamilyPhoto(familyId: number, payload: CreateFamilyPhotoRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const storagePath = await uploadFamilyMedia(supabase, "photos", familyId, payload.image);

    try {
      const row = await readRpcRow<FamilyPhotoRow>(
        supabase.rpc("create_family_photo_checked", {
          p_family_id: familyId,
          p_storage_path: storagePath,
          p_caption: payload.caption?.trim() || null,
        }),
        "사진 앨범에 저장하지 못했어요.",
      );

      return mapFamilyPhoto(row, await createFamilyMediaSignedUrl(supabase, storagePath), caregiverMap(context.caregivers));
    } catch (error) {
      await removeFamilyMedia(supabase, storagePath);
      throw error;
    }
  }, "사진을 업로드하지 못했어요.");
}

export async function requestDataExport(familyId: number, payload: RequestDataExportRequest) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const row = await readRpcRow<ExportJobRow>(
      supabase.rpc("request_data_export_checked", {
        p_family_id: familyId,
        p_format: payload.format,
        p_sections: payload.sections,
      }),
      "데이터 내보내기를 요청하지 못했어요.",
    );

    return mapExportJob(row);
  }, "데이터 내보내기를 요청하지 못했어요.");
}

export async function searchFamilyRecords(familyId: number, query: string) {
  return runSupabase(async () => {
    const { supabase, session } = await readExistingSession();
    const context = await loadCurrentContext(supabase, session);
    assertFamilyAccess(context, familyId);

    const [logs, growthMeasurements, vaccinations, hospitalVisits, memories] = await Promise.all([
      readMany<LogRow>(supabase.from("logs").select("*").eq("family_id", familyId).order("recorded_at", { ascending: false }).limit(80)),
      readMany<GrowthMeasurementRow>(
        supabase.from("growth_measurements").select("*").eq("family_id", familyId).order("measured_at", { ascending: false }).limit(80),
      ),
      readMany<VaccinationRow>(
        supabase.from("vaccination_records").select("*").eq("family_id", familyId).order("due_at", { ascending: false }).limit(80),
      ),
      readMany<HospitalVisitRow>(
        supabase.from("hospital_visits").select("*").eq("family_id", familyId).order("visited_at", { ascending: false }).limit(80),
      ),
      readMany<MemoryRow>(
        supabase.from("memory_entries").select("*").eq("family_id", familyId).order("happened_at", { ascending: false }).limit(80),
      ),
    ]);

    const results: SearchResultCard[] = [
      ...logs
        .filter((row) => matchesQuery(query, [logTypeTitle(row.type), row.entry_value, row.note, row.record_subtype, JSON.stringify(row.details ?? {})]))
        .map((row) => ({
          id: `log-${row.id}`,
          kind: "LOG" as const,
          title: logTypeTitle(row.type),
          body: row.note ?? row.entry_value,
          happenedAt: row.recorded_at,
        })),
      ...growthMeasurements
        .filter((row) => matchesQuery(query, ["성장", row.height_cm, row.weight_kg, row.head_circumference_cm, row.note]))
        .map((row) => ({
          id: `growth-${row.id}`,
          kind: "GROWTH" as const,
          title: "성장 기록",
          body: [row.height_cm ? `${row.height_cm}cm` : null, row.weight_kg ? `${row.weight_kg}kg` : null, row.note].filter(Boolean).join(" · "),
          happenedAt: row.measured_at,
        })),
      ...vaccinations
        .filter((row) => matchesQuery(query, ["예방접종", row.name, row.dose_label, row.status, row.note]))
        .map((row) => ({
          id: `vaccination-${row.id}`,
          kind: "VACCINATION" as const,
          title: row.name,
          body: row.dose_label ?? row.note,
          happenedAt: row.completed_at ?? row.due_at,
        })),
      ...hospitalVisits
        .filter((row) => matchesQuery(query, ["병원", row.hospital_name, row.reason, row.diagnosis, row.note]))
        .map((row) => ({
          id: `hospital-${row.id}`,
          kind: "HOSPITAL" as const,
          title: row.hospital_name,
          body: row.reason ?? row.diagnosis ?? row.note,
          happenedAt: row.visited_at,
        })),
      ...memories
        .filter((row) => matchesQuery(query, ["앨범", "메모리", row.title, row.note, row.tag]))
        .map((row) => ({
          id: `memory-${row.id}`,
          kind: "MEMORY" as const,
          title: row.title,
          body: row.note,
          happenedAt: row.happened_at,
        })),
    ];

    return results.sort(newestFirst).slice(0, 50);
  }, "검색 결과를 불러오지 못했어요.");
}
