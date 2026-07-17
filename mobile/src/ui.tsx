import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";

import type { CaregiverLoadCard, ChatMessageCard, NotificationCard } from "./api";
import { chatTypeLabel, toneLabel } from "./constants";

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
  return <TextInput placeholderTextColor="#B8C2D3" {...props} style={[styles.input, props.style]} />;
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

export function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{message}</Text>
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
      outputRange: ["#EEF3F8", "#E7F6F3"],
    }),
    borderColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#DDE5EF", "#A8D9D1"],
    }),
  };
  const knobStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: ["#FFFFFF", "#4DB6AC"],
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
    ? { boxShadow: "0px 12px 24px rgba(77, 182, 172, 0.24)" }
    : {
        shadowColor: "#4DB6AC",
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
    borderColor: "#E5EDE9",
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
  },
  sectionDescription: {
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: "#111827",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#DDE7E2",
  },
  primaryButton: {
    ...buttonShadow,
    backgroundColor: "#4DB6AC",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#A8D9D1",
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#4DB6AC",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.55,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#DDE7E2",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: "#E7F6F3",
    borderColor: "#A8D9D1",
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#4DB6AC",
  },
  tabButton: {
    flex: 1,
    minWidth: 88,
    alignItems: "flex-start",
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: "#E7F6F3",
    borderColor: "#A8D9D1",
  },
  tabButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#4DB6AC",
  },
  tabButtonDetail: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  tabButtonDetailActive: {
    color: "#2F8F88",
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EDE9",
    padding: 14,
    gap: 4,
  },
  infoCardSubtle: {
    backgroundColor: "#F8FAFC",
  },
  infoLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  infoValue: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  statPill: {
    minWidth: 104,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7E2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  statLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  statValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#DDE6F3",
    backgroundColor: "#F8FAFC",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: "#64748B",
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
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE7E2",
  },
  statusBannerText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  balanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    padding: 16,
    gap: 12,
  },
  balanceCardActive: {
    borderWidth: 1,
    borderColor: "#A8D9D1",
    backgroundColor: "#F6FBFA",
  },
  balanceHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  balanceName: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "600",
  },
  balanceReason: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 18,
  },
  scoreBadge: {
    backgroundColor: "#E7F6F3",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scoreBadgeText: {
    color: "#4DB6AC",
    fontSize: 14,
    fontWeight: "600",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metric: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 12,
  },
  metricValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  toggleRowActive: {
    borderColor: "#CDEDE8",
    backgroundColor: "#FBFDFF",
  },
  toggleLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  toggleDescription: {
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  messageBubbleOwn: {
    backgroundColor: "#4DB6AC",
    borderColor: "#4DB6AC",
  },
  messageMeta: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  messageMetaOwn: {
    color: "#E7F6F3",
  },
  messageBody: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 21,
  },
  messageBodyOwn: {
    color: "#FFFFFF",
  },
  messageTask: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  messageTaskOwn: {
    color: "#E7F6F3",
  },
  messageTime: {
    color: "#94A3B8",
    fontSize: 11,
  },
  messageTimeOwn: {
    color: "#E7F6F3",
  },
  noticeCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    padding: 14,
    gap: 4,
  },
  noticeWarning: {
    backgroundColor: "#FFF7ED",
  },
  noticeInfo: {
    backgroundColor: "#F8FAFC",
  },
  noticePositive: {
    backgroundColor: "#F0FBF5",
  },
  noticeMuted: {
    backgroundColor: "#F8FAFC",
  },
  noticeTone: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  noticeTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  noticeBody: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 18,
  },
});
