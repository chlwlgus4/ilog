import { createBabyBossActions } from "./babyBossActions";
import { useBabyBossForms } from "./useBabyBossForms";
import { useBabyBossRuntime } from "./useBabyBossRuntime";

export type { TabKey } from "./babyBossAppTypes";

export function useBabyBossApp() {
  const runtime = useBabyBossRuntime();
  const forms = useBabyBossForms();
  const actions = createBabyBossActions(runtime, forms);

  return {
    bootstrap: runtime.bootstrap,
    session: runtime.session,
    dashboard: runtime.dashboard,
    chat: runtime.chat,
    familyChat: runtime.familyChat,
    notebook: runtime.notebook,
    settings: runtime.settings,
    growthMeasurements: runtime.growthMeasurements,
    activeTab: runtime.activeTab,
    setActiveTab: runtime.setActiveTab,
    error: runtime.error,
    busyAction: runtime.busyAction,
    timelineDate: runtime.timelineDate,
    isBooting: runtime.isBooting,
    isRefreshing: runtime.isRefreshing,
    currentFamily: runtime.currentFamily,
    currentChild: runtime.currentChild,
    currentSettings: runtime.currentSettings,
    loginForm: forms.loginForm,
    setLoginForm: forms.setLoginForm,
    joinForm: forms.joinForm,
    setJoinForm: forms.setJoinForm,
    taskForm: forms.taskForm,
    setTaskForm: forms.setTaskForm,
    logForm: forms.logForm,
    setLogForm: forms.setLogForm,
    scheduleForm: forms.scheduleForm,
    setScheduleForm: forms.setScheduleForm,
    memoryForm: forms.memoryForm,
    setMemoryForm: forms.setMemoryForm,
    chatBody: forms.chatBody,
    setChatBody: forms.setChatBody,
    refreshAll: runtime.refreshAll,
    refreshFamilyChat: runtime.refreshFamilyChat,
    applyFamilyChatMessage: runtime.applyFamilyChatMessage,
    changeTimelineDate: runtime.changeTimelineDate,
    applySettings: runtime.applySettings,
    handleLogin: actions.handleLogin,
    handleJoin: actions.handleJoin,
    handleGoogleAuth: actions.handleGoogleAuth,
    handleGoogleAuthCallback: actions.handleGoogleAuthCallback,
    handleTask: actions.handleTask,
    handleComplete: actions.handleComplete,
    handleLog: actions.handleLog,
    handleChat: actions.handleChat,
    handleTimelineComment: actions.handleTimelineComment,
    handleSchedule: actions.handleSchedule,
    handleMemory: actions.handleMemory,
    handleSettingsUpdate: actions.handleSettingsUpdate,
    handleCaregiverProfileUpdate: actions.handleCaregiverProfileUpdate,
    handleCreateChildProfile: actions.handleCreateChildProfile,
    handleLogout: actions.handleLogout,
  };
}
