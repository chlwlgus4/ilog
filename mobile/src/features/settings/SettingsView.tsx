import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FamilySettingsSummary, SessionResponse, SettingsResponse, UpdateCaregiverProfileRequest } from "../../api";
import { EmptyCard, SecondaryButton, ToggleRow } from "../../ui";
import { ProfileImageField } from "../shared/ProfileImageField";
import { RecordIcon, type RecordIconName } from "../shared/RecordIcon";

export function SettingsView({
  settings,
  currentSettings,
  session,
  busyAction,
  onSettingsUpdate,
  onProfileUpdate,
  onLogout,
  onNavigate,
}: {
  settings: SettingsResponse | null;
  currentSettings: FamilySettingsSummary | null;
  session: SessionResponse | null;
  busyAction: string | null;
  onSettingsUpdate: (patch: Partial<FamilySettingsSummary>) => void;
  onProfileUpdate: (payload: UpdateCaregiverProfileRequest) => void;
  onLogout: () => void;
  onNavigate?: (route: string) => void;
}) {
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(session?.caregiver.imageUrl ?? null);
  const profileBusy = busyAction === "profile";

  useEffect(() => {
    setProfileImageUrl(session?.caregiver.imageUrl ?? null);
  }, [session?.caregiver.id, session?.caregiver.imageUrl]);

  function saveProfileImage(nextImageUrl: string | null) {
    setProfileImageUrl(nextImageUrl);

    if (!session) {
      return;
    }

    onProfileUpdate({
      imageUrl: nextImageUrl,
    });
  }

  function updateChatPushNotifications(chatNotificationsEnabled: boolean) {
    const patch: Partial<FamilySettingsSummary> = { chatNotificationsEnabled };

    if (chatNotificationsEnabled && currentSettings?.pushNotificationsEnabled === false) {
      patch.pushNotificationsEnabled = true;
    }

    onSettingsUpdate(patch);
  }

  return (
    <View style={styles.settingsStack}>
      <View style={styles.profileCard} testID="settings-my-profile-card">
        <ProfileImageField
          size={68}
          imageUrl={profileImageUrl}
          editable={!profileBusy}
          onChangeImage={saveProfileImage}
          testID="settings-profile-image"
        />
        <View style={styles.profileBody}>
          <View style={styles.profileCopy}>
            <Text style={styles.profileKicker}>내 프로필</Text>
            <Text style={styles.profileName}>{session?.caregiver.name ?? "보호자"}</Text>
            <Text style={styles.profileEmail}>{session?.caregiver.email ?? "이메일 정보 없음"}</Text>
          </View>
          <SecondaryButton
            label={profileBusy ? "이미지 저장 중..." : "개인정보 수정"}
            onPress={() => onNavigate?.("/personal-info")}
            disabled={!session || profileBusy}
            testID="settings-open-personal-info"
          />
        </View>
      </View>

      <View style={styles.menuList}>
        <MenuRow icon="child-profile" label="아이 정보" onPress={() => onNavigate?.("/child-info")} />
        <MenuRow icon="family-management" label="가족 관리" onPress={() => onNavigate?.("/family-management")} />
        <MenuRow icon="photo-album" label="사진 앨범" onPress={() => onNavigate?.("/photo-album")} />
        <MenuRow icon="notification-bell" label="기록 리마인더" onPress={() => onNavigate?.("/notification-settings")} testID="settings-open-record-reminders" />
        <MenuRow icon="data-security" label="개인정보 설정" onPress={() => onNavigate?.("/privacy")} />
        <MenuRow icon="help-question" label="도움말 및 문의" />
        <MenuRow icon="app-info" label="앱 정보" onPress={() => onNavigate?.("/app-info")} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>기기 푸시</Text>
        {currentSettings ? (
          <>
            <ToggleRow
              label="푸시 알림"
              description="내 기기에 기록 리마인더와 분담 알림을 받습니다."
              value={currentSettings.pushNotificationsEnabled}
              onValueChange={(pushNotificationsEnabled) => onSettingsUpdate({ pushNotificationsEnabled })}
              testID="settings-push-toggle"
            />
            <ToggleRow
              label="채팅 푸시 알림"
              description="가족 채팅의 새 메시지 내용 미리보기를 내 기기에서 받습니다."
              value={currentSettings.chatNotificationsEnabled}
              onValueChange={updateChatPushNotifications}
              testID="settings-chat-push-toggle"
            />
          </>
        ) : (
          <EmptyCard message="지금은 설정 정보를 불러오지 못했어요." />
        )}
      </View>

      <SecondaryButton label={busyAction === "logout" ? "정리하는 중..." : "이 기기에서 로그아웃"} onPress={onLogout} />
    </View>
  );
}

function MenuRow({ icon, label, onPress, testID }: { icon: RecordIconName; label: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable style={styles.menuRow} accessibilityRole="button" onPress={onPress} testID={testID}>
      <RecordIcon name={icon} size={24} color="#64748B" strokeWidth={1.8} />
      <Text style={styles.menuLabel}>{label}</Text>
      <RecordIcon name="chevron-right" size={18} color="#CBD5E1" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  settingsStack: {
    gap: 18,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    padding: 16,
  },
  profileBody: {
    flex: 1,
    gap: 12,
  },
  profileCopy: {
    gap: 4,
  },
  profileKicker: {
    color: "#26364D",
    fontSize: 17,
    fontWeight: "800",
  },
  profileName: {
    color: "#26364D",
    fontSize: 15,
    fontWeight: "800",
  },
  profileMeta: {
    color: "#6B7E95",
    fontSize: 12,
    fontWeight: "700",
  },
  profileEmail: {
    color: "#6B7E95",
    fontSize: 12,
    fontWeight: "600",
  },
  menuList: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
  },
  menuRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingHorizontal: 16,
  },
  menuLabel: {
    flex: 1,
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  section: {
    gap: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    padding: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: "#4DB6AC",
    fontSize: 12,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serverlessGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
