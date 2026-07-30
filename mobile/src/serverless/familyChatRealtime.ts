import { getBabyBossSupabaseClient } from "./supabase";
import {
  familyChatRealtimeFilter,
  parseFamilyChatRealtimeInsert,
  type FamilyChatRealtimeInsertRow,
} from "./familyChatRealtimeUtils";

export type FamilyChatRealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export function subscribeFamilyChatMessages({
  familyId,
  onInsert,
  onStatus,
}: {
  familyId: number;
  onInsert: (row: FamilyChatRealtimeInsertRow) => void;
  onStatus?: (status: FamilyChatRealtimeStatus) => void;
}) {
  const supabase = getBabyBossSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase Realtime 설정을 찾지 못했어요.");
  }

  const channel = supabase
    .channel(`family-chat-${familyId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "family_chat_messages",
        filter: familyChatRealtimeFilter(familyId),
      },
      (payload) => {
        const row = parseFamilyChatRealtimeInsert(familyId, payload.new);
        if (row) {
          onInsert(row);
        }
      },
    )
    .subscribe((status) => {
      onStatus?.(status as FamilyChatRealtimeStatus);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
