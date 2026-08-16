import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";

import type { CaregiverLoadCard, ChatMessageCard, NotificationCard } from "./api";
import { chatTypeLabel, toneLabel } from "./constants";
import { brandColors, brandShadows } from "./theme";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function AppInput(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor="#94A3B8" {...props} style={[styles.input, props.style]} />;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.primaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.secondaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress} testID={testID} accessibilityRole="button">
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function TabButton({
  label,
  detail,
  active,
  onPress,
  testID,
}: {
  label: string;
  detail?: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress} testID={testID} accessibilityRole="tab">
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
      {detail ? <Text style={[styles.tabButtonDetail, active && styles.tabButtonDetailActive]}>{detail}</Text> : null}
    </Pressable>
  );
}

export function InfoCard({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <View style={[styles.infoCard, subtle && styles.infoCardSubtle]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function EmptyCard({
  message,
  fitSingleLine = false,
  wideSingleLine = false,
}: {
  message: string;
  fitSingleLine?: boolean;
  wideSingleLine?: boolean;
}) {
  return (
    <View style={[styles.emptyCard, wideSingleLine && styles.emptyCardWideSingleLine]}>
      <Text
        style={styles.emptyText}
        numberOfLines={fitSingleLine ? 1 : undefined}
        adjustsFontSizeToFit={fitSingleLine}
        minimumFontScale={fitSingleLine ? 0.72 : undefined}
      >
        {message}
      </Text>
    </View>
  );
}

export function StatusBanner({
  message,
  tone = "warning",
}: {
  message: string;
  tone?: "warning" | "info";
}) {
  return (
    <View style={[styles.statusBanner, tone === "info" ? styles.statusBannerInfo : styles.statusBannerWarning]}>
      <Text style={styles.statusBannerText}>{message}</Text>
    </View>
  );
}

export function BalanceCard({
  caregiver,
  active,
}: {
  caregiver: CaregiverLoadCard;
  active: boolean;
}) {
  return (
    <View style={[styles.balanceCard, active && styles.balanceCardActive]}>
      <View style={styles.balanceHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceName}>
            {caregiver.name}
          </Text>
          <Text style={styles.balanceReason}>{caregiver.scoreReason}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>{caregiver.assignmentScore}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <Metric label="최근 완료" value={caregiver.recentCompletedTasks} />
        <Metric label="남은 일" value={caregiver.pendingTasksToday} />
        <Metric label="추천 점수" value={caregiver.assignmentScore} />
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (nextValue: boolean) => void;
  testID?: string;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const trackStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#EEF3F8", brandColors.action],
    }),
    borderColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#DDE5EF", brandColors.actionPressed],
    }),
  };
  const knobStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [brandColors.onAction, brandColors.onAction],
    }),
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 20],
        }),
      },
    ],
  };

  return (
    <View style={[styles.toggleRow, value && styles.toggleRowActive]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
        aria-checked={value}
        onPress={() => onValueChange(!value)}
        style={styles.toggleSwitchHitArea}
        testID={testID}
      >
        <Animated.View style={[styles.toggleSwitch, trackStyle]}>
          <Animated.View style={[styles.toggleKnob, knobStyle]} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

export function MessageBubble({
  message,
  own,
  timestamp,
}: {
  message: ChatMessageCard;
  own: boolean;
  timestamp: string;
}) {
  return (
    <View style={[styles.messageWrap, own && styles.messageWrapOwn]}>
      <View style={[styles.messageBubble, own && styles.messageBubbleOwn]}>
        <Text style={[styles.messageMeta, own && styles.messageMetaOwn]}>
          {message.senderName} · {chatTypeLabel[message.messageType]}
        </Text>
        <Text style={[styles.messageBody, own && styles.messageBodyOwn]}>{message.body}</Text>
        {message.linkedTaskTitle ? <Text style={[styles.messageTask, own && styles.messageTaskOwn]}>연결 작업: {message.linkedTaskTitle}</Text> : null}
        <Text style={[styles.messageTime, own && styles.messageTimeOwn]}>{timestamp}</Text>
      </View>
    </View>
  );
}

export function NoticeCard({ notice }: { notice: NotificationCard }) {
  const toneStyle =
    notice.tone === "warning"
      ? styles.noticeWarning
      : notice.tone === "positive"
        ? styles.noticePositive
        : notice.tone === "muted"
          ? styles.noticeMuted
          : styles.noticeInfo;

  return (
    <View style={[styles.noticeCard, toneStyle]}>
      <Text style={styles.noticeTone}>{toneLabel[notice.tone]}</Text>
      <Text style={styles.noticeTitle}>{notice.title}</Text>
      <Text style={styles.noticeBody}>{notice.body}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const surfaceShadow: ViewStyle =
  Platform.OS === "web"
    ? { boxShadow: "0px 16px 32px rgba(15, 23, 42, 0.06)" }
    : {
        shadowColor: "#334155",
        shadowOpacity: 0.08,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 3,
      };

const buttonShadow: ViewStyle =
  Platform.OS === "web"
    ? { boxShadow: `0px 12px 24px ${brandShadows.primary}` }
    : {
        shadowColor: brandColors.primary,
        shadowOpacity: 0.22,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      };

const styles = StyleSheet.create({
  section: {
    ...surfaceShadow,
    gap: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: brandColors.border,
    backgroundColor: brandColors.background,
  },
  sectionTitle: {
    color: brandColors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionDescription: {
    color: brandColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionBody: {
    gap: 10,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: brandColors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: brandColors.ink,
    fontSize: 15,
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  primaryButton: {
    ...buttonShadow,
    backgroundColor: brandColors.action,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: brandColors.onAction,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: brandColors.background,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brandColors.selectedBorder,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: brandColors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.55,
  },
  chip: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 999,
    backgroundColor: brandColors.background,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: brandColors.action,
    borderColor: brandColors.actionPressed,
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: brandColors.onAction,
  },
  tabButton: {
    flex: 1,
    minWidth: 88,
    alignItems: "flex-start",
    borderRadius: 24,
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: brandColors.tint,
    borderColor: brandColors.selectedBorder,
  },
  tabButtonText: {
    color: brandColors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: brandColors.primary,
  },
  tabButtonDetail: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  tabButtonDetailActive: {
    color: brandColors.logoTeal,
  },
  infoCard: {
    backgroundColor: brandColors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: brandColors.border,
    padding: 14,
    gap: 4,
  },
  infoCardSubtle: {
    backgroundColor: brandColors.surface,
  },
  infoLabel: {
    color: brandColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  infoValue: {
    color: brandColors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  statPill: {
    minWidth: 104,
    borderRadius: 22,
    backgroundColor: brandColors.background,
    borderWidth: 1,
    borderColor: brandColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  statLabel: {
    color: brandColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  statValue: {
    color: brandColors.ink,
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#DDE6F3",
    backgroundColor: brandColors.surface,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyCardWideSingleLine: {
    paddingHorizontal: 4,
  },
  emptyText: {
    color: brandColors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  statusBanner: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusBannerWarning: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  statusBannerInfo: {
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  statusBannerText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  balanceCard: {
    backgroundColor: brandColors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: brandColors.border,
    padding: 16,
    gap: 12,
  },
  balanceCardActive: {
    borderWidth: 1,
    borderColor: brandColors.selectedBorder,
    backgroundColor: "#F6FBFA",
  },
  balanceHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  balanceName: {
    color: brandColors.ink,
    fontSize: 18,
    fontWeight: "600",
  },
  balanceReason: {
    color: brandColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  scoreBadge: {
    backgroundColor: brandColors.tint,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scoreBadgeText: {
    color: brandColors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metric: {
    flex: 1,
    backgroundColor: brandColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: brandColors.border,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    color: brandColors.muted,
    fontSize: 12,
  },
  metricValue: {
    color: brandColors.ink,
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brandColors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: brandColors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  toggleRowActive: {
    borderColor: "#CDEDE8",
    backgroundColor: "#FBFDFF",
  },
  toggleLabel: {
    color: brandColors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  toggleDescription: {
    color: brandColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  toggleSwitchHitArea: {
    borderRadius: 999,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: brandColors.background,
    boxShadow: "0 2px 7px rgba(15, 23, 42, 0.16)",
    transform: [{ translateX: 0 }],
  },
  messageWrap: {
    alignItems: "flex-start",
  },
  messageWrapOwn: {
    alignItems: "flex-end",
  },
  messageBubble: {
    maxWidth: "92%",
    backgroundColor: brandColors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: brandColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  messageBubbleOwn: {
    backgroundColor: brandColors.primary,
    borderColor: brandColors.primary,
  },
  messageMeta: {
    color: brandColors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  messageMetaOwn: {
    color: brandColors.tint,
  },
  messageBody: {
    color: brandColors.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  messageBodyOwn: {
    color: "#FFFFFF",
  },
  messageTask: {
    color: brandColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  messageTaskOwn: {
    color: brandColors.tint,
  },
  messageTime: {
    color: "#94A3B8",
    fontSize: 11,
  },
  messageTimeOwn: {
    color: brandColors.tint,
  },
  noticeCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: brandColors.border,
    padding: 14,
    gap: 4,
  },
  noticeWarning: {
    backgroundColor: "#FFF7ED",
  },
  noticeInfo: {
    backgroundColor: brandColors.surface,
  },
  noticePositive: {
    backgroundColor: "#F0FBF5",
  },
  noticeMuted: {
    backgroundColor: brandColors.surface,
  },
  noticeTone: {
    color: brandColors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  noticeTitle: {
    color: brandColors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  noticeBody: {
    color: brandColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
