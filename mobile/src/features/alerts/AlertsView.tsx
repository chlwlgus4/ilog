import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DashboardResponse, NotificationTone } from "../../api";
import { toneLabel } from "../../constants";
import { EmptyCard } from "../../ui";
import { RecordIcon, type RecordIconName } from "../shared/RecordIcon";

export function AlertsView({
  dashboard,
  onClose,
}: {
  dashboard: DashboardResponse | null;
  onClose: () => void;
}) {
  const alerts = dashboard?.notifications.map((notice, index) => ({
    id: `${notice.tone}-${notice.title}-${index}`,
    title: notice.title,
    body: notice.body,
    tone: notice.tone,
    icon: iconForTone(notice.tone),
  })) ?? [];

  return (
    <View style={styles.screen} testID="alerts-view">
      <View style={styles.navHeader}>
        <Pressable onPress={onClose} accessibilityRole="button">
          <RecordIcon name="back-arrow" size={24} />
        </Pressable>
        <Text style={styles.navTitle}>알림</Text>
        <View style={styles.headerActionSlot} />
      </View>

      <View style={styles.alertList}>
        {alerts.length ? (
          alerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={styles.iconBubble}>
                <RecordIcon name={alert.icon} size={34} />
              </View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertMeta}>{toneLabel[alert.tone]}</Text>
                <Text style={styles.alertBody}>{alert.body}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          ))
        ) : (
          <EmptyCard message="새 알림이 없어요." />
        )}
      </View>
    </View>
  );
}

function iconForTone(tone: NotificationTone): RecordIconName {
  switch (tone) {
    case "warning":
      return "hospital";
    case "positive":
      return "diaper";
    case "muted":
      return "memo";
    case "info":
      return "feeding";
  }
}

const styles = StyleSheet.create({
  screen: {
    gap: 18,
  },
  navHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backGlyph: {
    color: "#334155",
    fontSize: 30,
    lineHeight: 32,
  },
  navTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
  },
  headerActionSlot: {
    width: 24,
    height: 24,
  },
  alertList: {
    gap: 8,
  },
  alertRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    paddingVertical: 12,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FF",
  },
  alertCopy: {
    flex: 1,
    gap: 3,
  },
  alertTitle: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  alertMeta: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  alertBody: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  chevron: {
    color: "#CBD5E1",
    fontSize: 22,
    fontWeight: "600",
  },
});
