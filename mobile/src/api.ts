import * as supabaseApi from "./serverless/babyBossSupabaseApi";

export type CaregiverRole = "MOM" | "DAD" | "GUARDIAN";
export type ChildStage = "NEWBORN" | "INFANT" | "TODDLER" | "PRESCHOOL" | "EARLY_SCHOOL";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";
export type LogType = "FEEDING" | "SLEEP" | "GROWTH" | "MOMENT" | "MEDICINE" | "CHECKLIST" | "DIAPER" | "TEMPERATURE" | "PUMPING" | "MEMO";
export type ScheduleCategory = "HOSPITAL" | "VACCINE" | "DAYCARE" | "SCHOOL" | "HOME" | "ACTIVITY";
export type SubscriptionPlan = "FREE" | "PREMIUM";
export type ChatMessageType = "TEXT" | "TASK_LINK" | "LOG_UPDATE";
export type NotificationTone = "warning" | "info" | "positive" | "muted";
export type ExportFormat = "PDF" | "EXCEL" | "CSV";
export type ExportStatus = "REQUESTED" | "PROCESSING" | "READY" | "FAILED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
export type VaccinationStatus = "SCHEDULED" | "COMPLETED" | "SKIPPED";
export type AlarmNotifyScope = "SELF" | "FAMILY";
export type RecordAlarmStatus = "SCHEDULED" | "FIRED" | "SNOOZED" | "DISMISSED" | "CANCELLED";

export interface FamilySummary {
  id: number;
  name: string;
  inviteCode: string;
}

export interface ChildSummary {
  id: number;
  name: string;
  birthDate: string;
  stage: ChildStage;
  ageLabel: string;
  imageUrl?: string | null;
}

export interface CaregiverSummary {
  id: number;
  email: string | null;
  name: string;
  role: CaregiverRole;
  availabilityScore: number;
  fatigueScore: number;
  imageUrl?: string | null;
  contactPhone?: string | null;
}

export interface FamilySettingsSummary {
  subscriptionPlan: SubscriptionPlan;
  pushNotificationsEnabled: boolean;
  chatNotificationsEnabled: boolean;
  morningBriefingEnabled: boolean;
}

export interface NotificationPreferencesSummary {
  feedingEnabled: boolean;
  medicineEnabled: boolean;
  vaccinationEnabled: boolean;
  growthEnabled: boolean;
  briefingEnabled: boolean;
  healthAlertsEnabled: boolean;
  dailyTime: string;
}

export interface RecordAlarmRuleCard {
  id: number | null;
  familyId: number;
  logType: LogType;
  enabled: boolean;
  intervalMinutes: number;
  notifyScope: AlarmNotifyScope;
  updatedAt: string | null;
}

export interface RecordSharePreference {
  familyId: number;
  caregiverId: number;
  shareEnabled: boolean;
  excludedCaregiverIds: number[];
  updatedAt: string | null;
}

export interface RecordAlarmScheduleCard {
  id: number;
  familyId: number;
  childId: number | null;
  sourceLogId: number | null;
  logType: LogType;
  intervalMinutes: number;
  scheduledFor: string;
  status: RecordAlarmStatus;
  notifyScope: AlarmNotifyScope;
}

export interface BootstrapResponse {
  family: FamilySummary;
  child: ChildSummary | null;
  caregivers: CaregiverSummary[];
  settings: FamilySettingsSummary;
}

export interface SessionResponse {
  token: string;
  family: FamilySummary;
  child: ChildSummary | null;
  caregiver: CaregiverSummary;
  settings: FamilySettingsSummary;
}

export interface DailyStats {
  pendingTasks: number;
  completedToday: number;
  upcomingSchedules: number;
  unreadHighlights: number;
}

export interface CaregiverLoadCard extends CaregiverSummary {
  recentCompletedTasks: number;
  pendingTasksToday: number;
  assignmentScore: number;
  scoreReason: string;
}

export interface TaskCard {
  id: number;
  title: string;
  description: string | null;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  autoAssigned: boolean;
  assigneeName: string;
  assigneeRole: CaregiverRole;
  reminderMinutesBefore: number | null;
  reminderAfterMinutes: number | null;
  reminderAt: string | null;
}

export interface ScheduleCard {
  id: number;
  title: string;
  category: ScheduleCategory;
  startAt: string;
  endAt: string;
  note: string | null;
}

export interface LogCard {
  id: number;
  type: LogType;
  value: string;
  note: string | null;
  caregiverName: string;
  caregiverRole?: CaregiverRole | null;
  recordedAt: string;
  recordedEndAt?: string | null;
  recordSubtype?: string | null;
  details?: Record<string, unknown>;
}

export interface ChatMessageCard {
  id: number;
  senderName: string;
  senderRole: CaregiverRole;
  body: string;
  createdAt: string;
  messageType: ChatMessageType;
  linkedTaskTitle: string | null;
  comments: TimelineCommentCard[];
}

export interface TimelineCommentCard {
  id: number;
  messageId: number;
  parentCommentId: number | null;
  authorName: string;
  authorRole: CaregiverRole;
  body: string;
  createdAt: string;
  replies: TimelineCommentCard[];
}

export interface NotificationCard {
  title: string;
  body: string;
  tone: NotificationTone;
}

export interface DashboardResponse {
  generatedAt: string;
  family: FamilySummary;
  child: ChildSummary | null;
  stats: DailyStats;
  caregiverLoad: CaregiverLoadCard[];
  tasksToday: TaskCard[];
  upcomingSchedules: ScheduleCard[];
  recentLogs: LogCard[];
  recentMessages: ChatMessageCard[];
  notifications: NotificationCard[];
}

export interface ChatResponse {
  family: FamilySummary;
  messages: ChatMessageCard[];
}

export interface FamilyChatMessageCard {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: CaregiverRole;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface FamilyChatResponse {
  family: FamilySummary;
  messages: FamilyChatMessageCard[];
}

export type FamilyPhotoSource = "ALBUM" | "RECORD_ATTACHMENT";

export interface FamilyPhotoCard {
  id: string;
  source: FamilyPhotoSource;
  sourceId: number;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  createdById: number | null;
  createdByName: string;
}

export interface FetchChatOptions {
  startAt?: string;
  endAt?: string;
  limit?: number;
}

export interface FetchLogsOptions {
  limit?: number;
}

export interface FetchTasksOptions {
  startAt?: string;
  endAt?: string;
}

export interface SettingsResponse {
  family: FamilySummary;
  child: ChildSummary | null;
  settings: FamilySettingsSummary;
  notificationPreferences: NotificationPreferencesSummary;
  recordAlarmRules: RecordAlarmRuleCard[];
  recordSharePreference: RecordSharePreference;
  caregivers: CaregiverSummary[];
}

export interface MemoryCard {
  id: number;
  title: string;
  note: string | null;
  imageUrl: string | null;
  tag: string | null;
  caregiverName: string;
  happenedAt: string;
}

export interface NotebookResponse {
  family: FamilySummary;
  child: ChildSummary | null;
  schedules: ScheduleCard[];
  memories: MemoryCard[];
}

export interface FamilyInvitationCard {
  id: number;
  email: string;
  contactPhone: string | null;
  role: CaregiverRole;
  note: string | null;
  status: InvitationStatus;
  invitedByName: string | null;
  createdAt: string;
}

export interface GrowthMeasurementCard {
  id: number;
  measuredAt: string;
  heightCm: number | null;
  weightKg: number | null;
  headCircumferenceCm: number | null;
  note: string | null;
  caregiverName: string | null;
}

export interface VaccinationCard {
  id: number;
  name: string;
  doseLabel: string | null;
  status: VaccinationStatus;
  dueAt: string;
  completedAt: string | null;
  note: string | null;
}

export interface HospitalVisitCard {
  id: number;
  hospitalName: string;
  reason: string | null;
  visitedAt: string;
  diagnosis: string | null;
  note: string | null;
}

export interface RecordAttachmentCard {
  id: number;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
}

export interface ExportJobCard {
  id: number;
  format: ExportFormat;
  sections: string[];
  status: ExportStatus;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
}

export interface SearchResultCard {
  id: string;
  kind: "LOG" | "GROWTH" | "VACCINATION" | "HOSPITAL" | "MEMORY";
  title: string;
  body: string | null;
  happenedAt: string;
}

export interface JoinFamilyRequest {
  inviteCode: string;
  email: string;
  caregiverName: string;
  role: CaregiverRole;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  childId?: number | null;
  assigneeId?: number | null;
  dueAt: string;
  priority: TaskPriority;
  reminderMinutesBefore?: number | null;
  reminderAfterMinutes?: number | null;
  notificationRecipientIds?: number[];
}

export interface CreateLogRequest {
  type: LogType;
  value: string;
  note?: string;
  childId?: number | null;
  recordedAt: string;
  recordedEndAt?: string | null;
  recordSubtype?: string | null;
  details?: Record<string, unknown>;
  nextAlarmMinutes?: number | null;
  alarmNotifyScope?: AlarmNotifyScope | null;
  shareWithFamily?: boolean;
  excludedRecipientIds?: number[];
}

export interface UpdateLogRequest extends CreateLogRequest {
  id: number;
}

export interface CreateChatMessageRequest {
  body: string;
  messageType?: ChatMessageType;
  linkedTaskId?: number | null;
}

export interface UploadImageRequest {
  bytes: ArrayBuffer;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface CreateFamilyChatMessageRequest {
  body?: string;
  image?: UploadImageRequest | null;
}

export interface CreateFamilyPhotoRequest {
  image: UploadImageRequest;
  caption?: string;
}

export interface CreateTimelineCommentRequest {
  messageId: number;
  parentCommentId?: number | null;
  body: string;
}

export interface CreateScheduleRequest {
  title: string;
  category: ScheduleCategory;
  childId?: number | null;
  startAt: string;
  endAt: string;
  note?: string;
}

export interface CreateMemoryRequest {
  title: string;
  note?: string;
  imageUrl?: string;
  tag?: string;
  childId?: number | null;
  happenedAt: string;
}

export interface UpdateFamilySettingsRequest {
  pushNotificationsEnabled?: boolean;
  chatNotificationsEnabled?: boolean;
  morningBriefingEnabled?: boolean;
  subscriptionPlan?: SubscriptionPlan;
}

export interface UpdateChildProfileRequest {
  name?: string;
  birthDate?: string;
  stage?: ChildStage;
  imageUrl?: string | null;
}

export interface CreateChildProfileRequest {
  name: string;
  birthDate: string;
  stage: ChildStage;
  imageUrl?: string | null;
}

export interface UpdateCaregiverProfileRequest {
  name?: string;
  imageUrl?: string | null;
}

export interface UpdateCaregiverPersonalInfoRequest {
  name: string;
  role: CaregiverRole;
  contactPhone?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateNotificationPreferencesRequest {
  feedingEnabled: boolean;
  medicineEnabled: boolean;
  vaccinationEnabled: boolean;
  growthEnabled: boolean;
  briefingEnabled: boolean;
  healthAlertsEnabled: boolean;
  dailyTime: string;
}

export interface UpdateRecordAlarmRuleRequest {
  logType: LogType;
  enabled: boolean;
  intervalMinutes: number;
  notifyScope?: AlarmNotifyScope;
}

export interface CreateFamilyInvitationRequest {
  email: string;
  contactPhone?: string;
  role: CaregiverRole;
  note?: string;
}

export interface CreateGrowthMeasurementRequest {
  childId?: number | null;
  measuredAt: string;
  heightCm?: number | null;
  weightKg?: number | null;
  headCircumferenceCm?: number | null;
  note?: string;
  shareWithFamily?: boolean;
  excludedRecipientIds?: number[];
}

export interface CreateVaccinationRequest {
  childId?: number | null;
  name: string;
  doseLabel?: string | null;
  status?: VaccinationStatus;
  dueAt: string;
  completedAt?: string | null;
  note?: string;
  shareWithFamily?: boolean;
  excludedRecipientIds?: number[];
}

export interface CreateHospitalVisitRequest {
  childId?: number | null;
  hospitalName: string;
  reason?: string | null;
  visitedAt: string;
  diagnosis?: string | null;
  note?: string;
  shareWithFamily?: boolean;
  excludedRecipientIds?: number[];
}

export interface RequestDataExportRequest {
  format: ExportFormat;
  sections: string[];
}

export function fetchBootstrap() {
  return supabaseApi.fetchBootstrap();
}

export function joinFamily(payload: JoinFamilyRequest) {
  return supabaseApi.joinFamily(payload);
}

export function login(payload: LoginRequest) {
  return supabaseApi.login(payload);
}

export function startGoogleAuth(payload?: { inviteCode?: string }) {
  return supabaseApi.startGoogleAuth(payload);
}

export function completeGoogleAuth(callbackUrl?: string | null) {
  return supabaseApi.completeGoogleAuth(callbackUrl);
}

export function restoreSession() {
  return supabaseApi.restoreSession();
}

export function logout() {
  return supabaseApi.logout();
}

export function fetchDashboard(familyId: number) {
  return supabaseApi.fetchDashboard(familyId);
}

export function fetchChat(familyId: number, options?: FetchChatOptions) {
  return supabaseApi.fetchChat(familyId, options);
}

export function createChatMessage(familyId: number, payload: CreateChatMessageRequest) {
  return supabaseApi.createChatMessage(familyId, payload);
}

export function fetchFamilyChat(familyId: number) {
  return supabaseApi.fetchFamilyChat(familyId);
}

export function createFamilyChatMessage(familyId: number, payload: CreateFamilyChatMessageRequest) {
  return supabaseApi.createFamilyChatMessage(familyId, payload);
}

export function createTimelineComment(familyId: number, payload: CreateTimelineCommentRequest) {
  return supabaseApi.createTimelineComment(familyId, payload);
}

export function fetchSettings(familyId: number) {
  return supabaseApi.fetchSettings(familyId);
}

export function fetchNotebook(familyId: number) {
  return supabaseApi.fetchNotebook(familyId);
}

export function updateSettings(familyId: number, payload: UpdateFamilySettingsRequest) {
  return supabaseApi.updateSettings(familyId, payload);
}

export function updateChildProfile(childId: number, payload: UpdateChildProfileRequest) {
  return supabaseApi.updateChildProfile(childId, payload);
}

export function createChildProfile(familyId: number, payload: CreateChildProfileRequest) {
  return supabaseApi.createChildProfile(familyId, payload);
}

export function updateCaregiverProfile(caregiverId: number, payload: UpdateCaregiverProfileRequest) {
  return supabaseApi.updateCaregiverProfile(caregiverId, payload);
}

export function updateCaregiverPersonalInfo(caregiverId: number, payload: UpdateCaregiverPersonalInfoRequest) {
  return supabaseApi.updateCaregiverPersonalInfo(caregiverId, payload);
}

export function createSchedule(familyId: number, payload: CreateScheduleRequest) {
  return supabaseApi.createSchedule(familyId, payload);
}

export function createMemory(familyId: number, payload: CreateMemoryRequest) {
  return supabaseApi.createMemory(familyId, payload);
}

export function createTask(familyId: number, payload: CreateTaskRequest) {
  return supabaseApi.createTask(familyId, payload);
}

export function fetchTasks(familyId: number, options?: FetchTasksOptions) {
  return supabaseApi.fetchTasks(familyId, options);
}

export function completeTask(taskId: number) {
  return supabaseApi.completeTask(taskId);
}

export function createLog(familyId: number, payload: CreateLogRequest) {
  return supabaseApi.createLog(familyId, payload);
}

export function fetchLogs(familyId: number, options?: FetchLogsOptions) {
  return supabaseApi.fetchLogs(familyId, options);
}

export function updateLog(payload: UpdateLogRequest) {
  return supabaseApi.updateLog(payload);
}

export function deleteLog(logId: number) {
  return supabaseApi.deleteLog(logId);
}

export function fetchGrowthMeasurements(familyId: number) {
  return supabaseApi.fetchGrowthMeasurements(familyId);
}

export function createGrowthMeasurement(familyId: number, payload: CreateGrowthMeasurementRequest) {
  return supabaseApi.createGrowthMeasurement(familyId, payload);
}

export function updateNotificationPreferences(familyId: number, payload: UpdateNotificationPreferencesRequest) {
  return supabaseApi.updateNotificationPreferences(familyId, payload);
}

export function fetchRecordAlarmRules(familyId: number) {
  return supabaseApi.fetchRecordAlarmRules(familyId);
}

export function upsertRecordAlarmRule(familyId: number, payload: UpdateRecordAlarmRuleRequest) {
  return supabaseApi.upsertRecordAlarmRule(familyId, payload);
}

export function fetchFamilyInvitations(familyId: number) {
  return supabaseApi.fetchFamilyInvitations(familyId);
}

export function createFamilyInvitation(familyId: number, payload: CreateFamilyInvitationRequest) {
  return supabaseApi.createFamilyInvitation(familyId, payload);
}

export function fetchVaccinations(familyId: number) {
  return supabaseApi.fetchVaccinations(familyId);
}

export function createVaccination(familyId: number, payload: CreateVaccinationRequest) {
  return supabaseApi.createVaccination(familyId, payload);
}

export function fetchHospitalVisits(familyId: number) {
  return supabaseApi.fetchHospitalVisits(familyId);
}

export function createHospitalVisit(familyId: number, payload: CreateHospitalVisitRequest) {
  return supabaseApi.createHospitalVisit(familyId, payload);
}

export function fetchPhotoAlbum(familyId: number) {
  return supabaseApi.fetchPhotoAlbum(familyId);
}

export function createFamilyPhoto(familyId: number, payload: CreateFamilyPhotoRequest) {
  return supabaseApi.createFamilyPhoto(familyId, payload);
}

export function deleteFamilyPhoto(familyId: number, photoId: number) {
  return supabaseApi.deleteFamilyPhoto(familyId, photoId);
}

export function requestDataExport(familyId: number, payload: RequestDataExportRequest) {
  return supabaseApi.requestDataExport(familyId, payload);
}

export function searchFamilyRecords(familyId: number, query: string) {
  return supabaseApi.searchFamilyRecords(familyId, query);
}
