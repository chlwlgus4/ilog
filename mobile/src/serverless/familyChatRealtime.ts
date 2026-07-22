import { getBabyBossSupabaseClient } from "./supabase";

export type FamilyChatRealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

type FamilyChatInsertRow = {
  id: number;
  family_id: number;
  sender_caregiver_id: number;
};

export function subscribeFamilyChatMessages({
  familyId,
  onInsert,
  onStatus,
}: {
  familyId: number;
  onInsert: (row: FamilyChatInsertRow) => void;
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
        filter: `family_id=eq.${familyId}`,
      },
      (payload) => {
        const row = payload.new as Partial<FamilyChatInsertRow>;

        if (
          typeof row.id === "number"
          && typeof row.family_id === "number"
          && typeof row.sender_caregiver_id === "number"
          && row.family_id === familyId
        ) {
          onInsert(row as FamilyChatInsertRow);
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
