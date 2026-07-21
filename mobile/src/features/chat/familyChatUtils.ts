import type { FamilyChatMessageCard, FamilyChatResponse, FamilySummary } from "../../api";

export function messagePreview(body: string, hasImage: boolean) {
  const normalizedBody = body.trim();
  return normalizedBody || (hasImage ? "사진을 보냈어요." : "");
}

export function shouldShowFamilyChatMessageTime(
  message: FamilyChatMessageCard,
  nextMessage: FamilyChatMessageCard | undefined,
) {
  if (!nextMessage || nextMessage.senderId !== message.senderId) {
    return true;
  }

  return messageMinuteKey(message.createdAt) !== messageMinuteKey(nextMessage.createdAt);
}

export function prependFamilyChatMessage(
  current: FamilyChatResponse | null,
  family: FamilySummary,
  message: FamilyChatMessageCard,
): FamilyChatResponse {
  return {
    family: current?.family ?? family,
    messages: [message, ...(current?.messages.filter((item) => item.id !== message.id) ?? [])],
  };
}

function messageMinuteKey(value: string) {
  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? value : Math.floor(timestamp / 60_000);
}
