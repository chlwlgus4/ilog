import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  Bell,
  Calendar,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardPen,
  Copy,
  Download,
  Ellipsis,
  FileOutput,
  Funnel,
  History,
  House,
  Images,
  Info,
  MessageCircle,
  Plus,
  SendHorizontal,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { recordIconSvgs, type GeneratedRecordIconName } from "./recordIconSvgs";

type LucideMappedIconName =
  | "add-plus"
  | "app-info"
  | "back-arrow"
  | "backup-export"
  | "camera"
  | "chat"
  | "child-profile"
  | "chevron-down"
  | "chevron-right"
  | "confirm-check"
  | "copy"
  | "data-security"
  | "delete"
  | "download"
  | "family-management"
  | "filter"
  | "help-question"
  | "next-arrow"
  | "notification-bell"
  | "photo-album"
  | "record"
  | "send"
  | "settings-gear"
  | "close";

export type RecordIconName = GeneratedRecordIconName | LucideMappedIconName;

const pngIconSources: Partial<Record<RecordIconName, ImageSourcePropType>> = {
  diaper: require("../../../assets/record-icons-png/diaper.png"),
  feeding: require("../../../assets/record-icons-png/feeding-bottle.png"),
  growth: require("../../../assets/record-icons-png/growth-generated.png"),
  hospital: require("../../../assets/record-icons-png/hospital-generated.png"),
  medicine: require("../../../assets/record-icons-png/medicine-nutrition.png"),
  memo: require("../../../assets/record-icons-png/memo-note.png"),
  pumping: require("../../../assets/record-icons-png/pumping.png"),
  sleep: require("../../../assets/record-icons-png/sleep-moon.png"),
  temperature: require("../../../assets/record-icons-png/thermometer.png"),
  vaccine: require("../../../assets/record-icons-png/vaccine-generated.png"),
};

const lucideIcons: Partial<Record<RecordIconName, LucideIcon>> = {
  "add-plus": Plus,
  "app-info": Info,
  "back-arrow": ArrowLeft,
  "backup-export": FileOutput,
  camera: Camera,
  chat: MessageCircle,
  calendar: Calendar,
  "child-profile": Baby,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "confirm-check": Check,
  copy: Copy,
  close: X,
  "data-security": Shield,
  delete: Trash2,
  download: Download,
  "family-management": Users,
  filter: Funnel,
  "help-question": CircleHelp,
  home: House,
  more: Ellipsis,
  "next-arrow": ArrowRight,
  "notification-bell": Bell,
  "photo-album": Images,
  record: ClipboardPen,
  send: SendHorizontal,
  "settings-gear": Settings,
  stats: ChartColumn,
  timeline: History,
};

export function RecordIcon({
  name,
  size = 32,
  color = "#4DB6AC",
  strokeWidth = 2,
}: {
  name: RecordIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const source = pngIconSources[name];
  const Icon = lucideIcons[name];
  const svg = name in recordIconSvgs ? recordIconSvgs[name as GeneratedRecordIconName] : null;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {source ? (
        <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
      ) : Icon ? (
        <Icon color={color} size={size} strokeWidth={strokeWidth} />
      ) : svg ? (
        <SvgXml xml={svg} width={size} height={size} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
});
