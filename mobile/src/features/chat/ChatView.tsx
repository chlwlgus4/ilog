import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ChatMessageCard, ChatMessageType, ChatResponse, LogType, TimelineCommentCard } from "../../api";
import { formatShortTime, logTypeLabel } from "../../constants";
import { AppInput, EmptyCard } from "../../ui";
import { CalendarDatePickerOverlay, formatDateKey } from "../shared/CalendarDatePicker";
import { RecordIcon, type RecordIconName } from "../shared/RecordIcon";

type TimelineCategoryFilter = "ALL" | Exclude<LogType, "CHECKLIST" | "MOMENT">;

const categoryFilters: Array<{ key: TimelineCategoryFilter; label: string }> = [
  { key: "ALL", label: "전체" },
  { key: "FEEDING", label: logTypeLabel.FEEDING },
  { key: "SLEEP", label: logTypeLabel.SLEEP },
  { key: "DIAPER", label: logTypeLabel.DIAPER },
  { key: "TEMPERATURE", label: logTypeLabel.TEMPERATURE },
  { key: "PUMPING", label: logTypeLabel.PUMPING },
  { key: "MEDICINE", label: logTypeLabel.MEDICINE },
  { key: "GROWTH", label: logTypeLabel.GROWTH },
  { key: "MEMO", label: logTypeLabel.MEMO },
];

export function ChatView({
  chat,
  timelineDate,
  busyAction,
  onComment,
  onTimelineDateChange,
}: {
  chat: ChatResponse | null;
  timelineDate: Date;
  busyAction: string | null;
  onComment: (messageId: number, body: string, parentCommentId?: number | null) => void;
  onTimelineDateChange: (date: Date) => void;
}) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyTarget, setReplyTarget] = useState<{ messageId: number; commentId: number; authorName: string } | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(timelineDate);
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<TimelineCategoryFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const visibleMessages = useMemo(() => {
    const messages = chat?.messages ?? [];
    const normalizedQuery = normalizeSearch(searchQuery);

    return messages.filter((message) => {
      const categories = categoriesForMessage(message);
      const matchesCategory = categoryFilter === "ALL" || categories.includes(categoryFilter);
      const matchesSearch = !normalizedQuery || buildSearchText(message, categories).includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, chat?.messages, searchQuery]);

  useEffect(() => {
    setDisplayMonth(timelineDate);
  }, [timelineDate]);

  function draftKey(messageId: number, parentCommentId?: number | null) {
    return parentCommentId ? `${messageId}:${parentCommentId}` : `${messageId}:root`;
  }

  function setDraft(messageId: number, value: string, parentCommentId?: number | null) {
    setCommentDrafts((current) => ({ ...current, [draftKey(messageId, parentCommentId)]: value }));
  }

  function submitComment(messageId: number, parentCommentId?: number | null) {
    const key = draftKey(messageId, parentCommentId);
    const body = commentDrafts[key]?.trim() ?? "";

    if (!body) {
      return;
    }

    onComment(messageId, body, parentCommentId);
    setCommentDrafts((current) => ({ ...current, [key]: "" }));
    if (parentCommentId) {
      setReplyTarget(null);
    }
  }

  function toggleFilter() {
    setFilterOpen((current) => !current);
  }

  return (
    <View style={styles.screenRoot}>
      <View style={styles.navHeader}>
        <Pressable
          style={styles.headerIconButton}
          onPress={() => onTimelineDateChange(addDays(timelineDate, -1))}
          accessibilityRole="button"
          accessibilityLabel="이전 날짜"
          testID="timeline-prev-date">
          <RecordIcon name="back-arrow" size={24} color="#60758A" strokeWidth={2.2} />
        </Pressable>
        <Pressable
          style={styles.dateButton}
          onPress={() => setDatePickerOpen(true)}
          accessibilityRole="button"
          testID="timeline-date-picker-open">
          <Text style={styles.navTitle}>{formatTimelineDateLabel(timelineDate)}</Text>
          <RecordIcon name="calendar" size={18} color="#60758A" strokeWidth={2.1} />
        </Pressable>
        <Pressable
          style={[styles.headerIconButton, filterOpen && styles.headerIconButtonActive]}
          onPress={toggleFilter}
          accessibilityRole="button"
          accessibilityLabel="타임라인 필터"
          testID="timeline-filter-toggle">
          <RecordIcon name="filter" size={22} color={filterOpen ? "#5F80BE" : "#60758A"} strokeWidth={2.2} />
        </Pressable>
      </View>

      {filterOpen ? (
        <View style={[styles.floatingPanel, styles.filterPanel]} testID="timeline-filter-panel">
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>조회 조건</Text>
            <Pressable
              style={styles.todayButton}
              onPress={() => onTimelineDateChange(new Date())}
              accessibilityRole="button"
              testID="timeline-filter-today">
              <Text style={styles.todayButtonText}>오늘</Text>
            </Pressable>
          </View>
          <Text style={styles.filterDate}>{formatFullDate(timelineDate)}</Text>
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="기록 내용, 작성자, 댓글 검색"
            style={styles.searchInput}
            testID="timeline-filter-search"
          />
          <View style={styles.filterChips}>
            {categoryFilters.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.filterChip, categoryFilter === item.key && styles.filterChipActive]}
                onPress={() => setCategoryFilter(item.key)}
                accessibilityRole="button"
                testID={`timeline-filter-${item.key.toLowerCase()}`}>
                <Text style={[styles.filterChipText, categoryFilter === item.key && styles.filterChipTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.timeline}>
        {visibleMessages.length ? (
          visibleMessages.map((message) => (
            <View key={message.id} style={styles.timelineRow} testID={`timeline-row-${message.id}`}>
              <Text style={styles.timeLabel}>{formatShortTime(message.createdAt)}</Text>
              <View style={styles.timelineLine}>
                <View style={styles.timelineConnector} testID={`timeline-connector-${message.id}`} />
                <View style={styles.timelineDot} testID={`timeline-dot-${message.id}`} />
              </View>
              <View style={styles.timelineCard}>
                <View style={styles.cardHeader}>
                  <RecordIcon name={iconForMessage(message.messageType)} size={34} />
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardOwner}>{message.senderName}</Text>
                    <Text style={styles.cardTitle}>{titleForMessage(message.messageType, message.linkedTaskTitle)}</Text>
                  </View>
                  <Text style={styles.moreGlyph}>...</Text>
                </View>
                <Text style={styles.cardBody} testID={`timeline-body-${message.id}`}>{message.body}</Text>
                <CommentThread
                  messageId={message.id}
                  comments={message.comments}
                  busyAction={busyAction}
                  draft={commentDrafts[draftKey(message.id)] ?? ""}
                  replyTarget={replyTarget?.messageId === message.id ? replyTarget : null}
                  replyDraft={(commentId) => commentDrafts[draftKey(message.id, commentId)] ?? ""}
                  onChangeDraft={(value) => setDraft(message.id, value)}
                  onSubmit={() => submitComment(message.id)}
                  onSelectReply={(comment) => setReplyTarget({ messageId: message.id, commentId: comment.id, authorName: comment.authorName })}
                  onCancelReply={() => setReplyTarget(null)}
                  onChangeReplyDraft={(commentId, value) => setDraft(message.id, value, commentId)}
                  onSubmitReply={(commentId) => submitComment(message.id, commentId)}
                />
              </View>
            </View>
          ))
        ) : (
          <EmptyCard message={chat ? "선택한 날짜와 조건에 맞는 기록이 없어요." : "타임라인을 불러오는 중이에요."} />
        )}
      </View>

      <CalendarDatePickerOverlay
        visible={datePickerOpen}
        selectedDate={timelineDate}
        displayMonth={displayMonth}
        title="타임라인 날짜 선택"
        testID="timeline-date-picker"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(date) => {
          setDatePickerOpen(false);
          onTimelineDateChange(date);
        }}
        onDisplayMonthChange={setDisplayMonth}
      />
    </View>
  );
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function isSameDate(left: Date, right: Date) {
  return formatDateKey(left) === formatDateKey(right);
}

function formatTimelineDateLabel(date: Date) {
  const today = new Date();
  const yesterday = addDays(today, -1);

  if (isSameDate(date, today)) {
    return "오늘";
  }
  if (isSameDate(date, yesterday)) {
    return "어제";
  }
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatFullDate(date: Date) {
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(date);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}`;
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function categoriesForMessage(message: ChatMessageCard): TimelineCategoryFilter[] {
  const text = `${message.linkedTaskTitle ?? ""} ${message.body}`;
  const categories = new Set<TimelineCategoryFilter>();

  if (message.messageType === "TEXT") {
    categories.add("MEMO");
  }

  for (const item of categoryMatchers) {
    if (item.aliases.some((alias) => text.includes(alias))) {
      categories.add(item.key);
    }
  }

  if (message.messageType === "LOG_UPDATE" && categories.size === 0) {
    categories.add("MEMO");
  }

  return Array.from(categories);
}

function buildSearchText(message: ChatMessageCard, categories: TimelineCategoryFilter[]) {
  const commentText = flattenCommentText(message.comments);
  const categoryText = categories.map(labelForCategory).join(" ");

  return normalizeSearch([message.senderName, message.body, message.linkedTaskTitle, categoryText, commentText].filter(Boolean).join(" "));
}

function flattenCommentText(comments: TimelineCommentCard[]): string {
  return comments.map((comment) => [comment.authorName, comment.body, flattenCommentText(comment.replies)].filter(Boolean).join(" ")).join(" ");
}

function labelForCategory(category: TimelineCategoryFilter) {
  if (category === "ALL") {
    return "전체";
  }

  return logTypeLabel[category];
}

const categoryMatchers: Array<{ key: Exclude<TimelineCategoryFilter, "ALL">; aliases: string[] }> = [
  { key: "FEEDING", aliases: ["수유", "분유", "모유", "이유식"] },
  { key: "SLEEP", aliases: ["수면", "낮잠", "밤잠"] },
  { key: "DIAPER", aliases: ["배변", "기저귀", "대변", "소변"] },
  { key: "TEMPERATURE", aliases: ["체온", "열", "온도"] },
  { key: "PUMPING", aliases: ["유축"] },
  { key: "MEDICINE", aliases: ["복약", "약", "영양제"] },
  { key: "GROWTH", aliases: ["성장", "키", "몸무게", "체중", "머리둘레"] },
  { key: "MEMO", aliases: ["메모", "수첩", "기억", "순간", "활동"] },
];

function CommentThread({
  messageId,
  comments,
  busyAction,
  draft,
  replyTarget,
  replyDraft,
  onChangeDraft,
  onSubmit,
  onSelectReply,
  onCancelReply,
  onChangeReplyDraft,
  onSubmitReply,
}: {
  messageId: number;
  comments: TimelineCommentCard[];
  busyAction: string | null;
  draft: string;
  replyTarget: { messageId: number; commentId: number; authorName: string } | null;
  replyDraft: (commentId: number) => string;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
  onSelectReply: (comment: TimelineCommentCard) => void;
  onCancelReply: () => void;
  onChangeReplyDraft: (commentId: number, value: string) => void;
  onSubmitReply: (commentId: number) => void;
}) {
  const rootBusy = busyAction === `timeline-comment-${messageId}-0`;

  return (
    <View style={styles.commentBlock}>
      {comments.length ? (
        <View style={styles.commentList}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              busyAction={busyAction}
              isReplying={replyTarget?.commentId === comment.id}
              replyToName={replyTarget?.authorName}
              replyDraft={replyDraft(comment.id)}
              onSelectReply={onSelectReply}
              onCancelReply={onCancelReply}
              onChangeReplyDraft={(value) => onChangeReplyDraft(comment.id, value)}
              onSubmitReply={() => onSubmitReply(comment.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.commentComposer}>
        <AppInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="댓글 작성"
          style={styles.commentInput}
          testID={`timeline-comment-input-${messageId}`}
        />
        <Pressable
          style={[styles.commentSubmit, (!draft.trim() || rootBusy) && styles.commentSubmitDisabled]}
          onPress={onSubmit}
          disabled={!draft.trim() || rootBusy}
          accessibilityRole="button"
          testID={`timeline-comment-submit-${messageId}`}>
          <Text style={styles.commentSubmitText}>{rootBusy ? "저장 중" : "등록"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CommentItem({
  comment,
  busyAction,
  isReplying,
  replyToName,
  replyDraft,
  onSelectReply,
  onCancelReply,
  onChangeReplyDraft,
  onSubmitReply,
}: {
  comment: TimelineCommentCard;
  busyAction: string | null;
  isReplying: boolean;
  replyToName?: string;
  replyDraft: string;
  onSelectReply: (comment: TimelineCommentCard) => void;
  onCancelReply: () => void;
  onChangeReplyDraft: (value: string) => void;
  onSubmitReply: () => void;
}) {
  const replyBusy = busyAction === `timeline-comment-${comment.messageId}-${comment.id}`;

  return (
    <View style={styles.commentItem}>
      <View style={styles.commentBubble}>
        <Text style={styles.commentMeta}>
          {comment.authorName} · {formatShortTime(comment.createdAt)}
        </Text>
        <Text style={styles.commentBody}>{comment.body}</Text>
        <Pressable onPress={() => onSelectReply(comment)} accessibilityRole="button">
          <Text style={styles.replyAction}>답글</Text>
        </Pressable>
      </View>

      {comment.replies.length ? (
        <View style={styles.replyList}>
          {comment.replies.map((reply) => (
            <View key={reply.id} style={styles.replyBubble}>
              <Text style={styles.commentMeta}>
                {reply.authorName} · {formatShortTime(reply.createdAt)}
              </Text>
              <Text style={styles.commentBody}>{reply.body}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {isReplying ? (
        <View style={styles.replyComposer}>
          <View style={styles.replyComposerHead}>
            <Text style={styles.replyingTo}>{replyToName}님에게 답글</Text>
            <Pressable onPress={onCancelReply} accessibilityRole="button">
              <Text style={styles.replyCancel}>취소</Text>
            </Pressable>
          </View>
          <View style={styles.commentComposer}>
            <AppInput
              value={replyDraft}
              onChangeText={onChangeReplyDraft}
              placeholder="답글 작성"
              style={styles.commentInput}
              testID={`timeline-reply-input-${comment.id}`}
            />
            <Pressable
              style={[styles.commentSubmit, (!replyDraft.trim() || replyBusy) && styles.commentSubmitDisabled]}
              onPress={onSubmitReply}
              disabled={!replyDraft.trim() || replyBusy}
              accessibilityRole="button"
              testID={`timeline-reply-submit-${comment.id}`}>
              <Text style={styles.commentSubmitText}>{replyBusy ? "저장 중" : "등록"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function iconForMessage(type: ChatMessageType): RecordIconName {
  switch (type) {
    case "TASK_LINK":
      return "memo";
    case "LOG_UPDATE":
      return "feeding";
    case "TEXT":
      return "timeline";
  }
}

function titleForMessage(type: ChatMessageType, linkedTaskTitle: string | null) {
  if (linkedTaskTitle) {
    return linkedTaskTitle;
  }

  switch (type) {
    case "TASK_LINK":
      return "할 일 업데이트";
    case "LOG_UPDATE":
      return "기록 업데이트";
    case "TEXT":
      return "가족 메모";
  }
}

const styles = StyleSheet.create({
  screenRoot: {
    position: "relative",
    gap: 12,
  },
  navHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    zIndex: 30,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7FAFD",
    borderWidth: 1,
    borderColor: "#E7EEF7",
  },
  headerIconButtonActive: {
    backgroundColor: "#EEF4FF",
    borderColor: "#D8E5FA",
  },
  dateButton: {
    minHeight: 38,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 18,
    backgroundColor: "#F9FBFE",
    borderWidth: 1,
    borderColor: "#E7EEF7",
    paddingHorizontal: 14,
  },
  navTitle: {
    color: "#26364D",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  floatingPanel: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  filterPanel: {
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#FBFDFF",
    borderWidth: 1,
    borderColor: "#E5EDF7",
    padding: 12,
    boxShadow: "0px 10px 22px rgba(96, 117, 138, 0.08)",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  filterTitle: {
    color: "#26364D",
    fontSize: 13,
    fontWeight: "800",
  },
  todayButton: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#EEF6F4",
    paddingHorizontal: 12,
  },
  todayButtonText: {
    color: "#5F8D83",
    fontSize: 12,
    fontWeight: "800",
  },
  filterDate: {
    color: "#7A8CA0",
    fontSize: 12,
    fontWeight: "600",
  },
  searchInput: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  filterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EDF7",
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: "#EAF4F1",
    borderColor: "#BFDCD5",
  },
  filterChipText: {
    color: "#60758A",
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#4F7D73",
  },
  timeline: {
    gap: 0,
    zIndex: 1,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
    minHeight: 92,
  },
  timeLabel: {
    width: 45,
    paddingTop: 16,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  timelineLine: {
    width: 18,
    alignItems: "center",
    position: "relative",
    backgroundColor: "transparent",
  },
  timelineConnector: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    borderRadius: 1,
    backgroundColor: "#E2E8F0",
  },
  timelineDot: {
    width: 8,
    height: 8,
    marginTop: 22,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
  },
  timelineCard: {
    flex: 1,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EDE9",
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 2,
  },
  cardOwner: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  cardTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  moreGlyph: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "700",
  },
  cardBody: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  commentBlock: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingTop: 10,
  },
  commentList: {
    gap: 8,
  },
  commentItem: {
    gap: 8,
  },
  commentBubble: {
    gap: 4,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replyList: {
    gap: 6,
    marginLeft: 18,
  },
  replyBubble: {
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#D9E4F5",
    paddingLeft: 9,
    paddingVertical: 2,
  },
  commentMeta: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  commentBody: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
  },
  replyAction: {
    alignSelf: "flex-start",
    color: "#4DB6AC",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentInput: {
    minHeight: 38,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  commentSubmit: {
    minWidth: 52,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4DB6AC",
    paddingHorizontal: 10,
  },
  commentSubmitDisabled: {
    backgroundColor: "#CAD5E6",
  },
  commentSubmitText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  replyComposer: {
    gap: 6,
    marginLeft: 18,
  },
  replyComposerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  replyingTo: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  replyCancel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
});
