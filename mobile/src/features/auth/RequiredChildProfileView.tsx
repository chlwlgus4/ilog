import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { ChildStage, CreateChildProfileRequest } from "../../api";
import { stageLabel } from "../../constants";
import { AppInput, ChoiceChip, Field, PrimaryButton } from "../../ui";
import { CalendarDatePickerOverlay, formatDateKey } from "../shared/CalendarDatePicker";
import { RecordIcon } from "../shared/RecordIcon";

export function RequiredChildProfileView({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (payload: CreateChildProfileRequest) => void;
}) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState(() => formatDateKey(new Date()));
  const [stage, setStage] = useState<ChildStage>("INFANT");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => new Date());
  const selectedDate = parseDateKey(birthDate);
  const canSubmit = Boolean(name.trim()) && !busy;

  function submit() {
    if (!canSubmit) {
      return;
    }

    onSubmit({
      name: name.trim(),
      birthDate,
      stage,
      imageUrl: null,
    });
  }

  return (
    <View style={styles.screen} testID="required-child-profile">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heroIcon}>
          <RecordIcon name="child-profile" size={42} color="#4DB6AC" strokeWidth={2} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>아이 정보를 입력해 주세요</Text>
          <Text style={styles.description}>기록과 통계를 아이 기준으로 연결하기 위해 처음 한 번만 필요합니다.</Text>
        </View>

        <View style={styles.formCard}>
          <Field label="아이 이름">
            <AppInput
              value={name}
              onChangeText={setName}
              placeholder="아이 이름을 입력하세요"
              testID="required-child-name"
            />
          </Field>
          <Field label="생년월일">
            <PrimaryButton
              label={birthDate}
              onPress={() => setPickerOpen(true)}
              testID="required-child-birth-date-open"
            />
          </Field>
          <Field label="발달 단계">
            <View style={styles.stageGrid}>
              {(["NEWBORN", "INFANT", "TODDLER", "PRESCHOOL", "EARLY_SCHOOL"] as ChildStage[]).map((item) => (
                <ChoiceChip
                  key={item}
                  label={stageLabel[item]}
                  active={stage === item}
                  onPress={() => setStage(item)}
                  testID={`required-child-stage-${item.toLowerCase()}`}
                />
              ))}
            </View>
          </Field>
          <PrimaryButton
            label={busy ? "저장 중..." : "아이 정보 저장"}
            onPress={submit}
            disabled={!canSubmit}
            testID="required-child-submit"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
      <CalendarDatePickerOverlay
        visible={pickerOpen}
        selectedDate={selectedDate}
        displayMonth={displayMonth}
        title="생년월일 선택"
        testID="required-child-birth-date-picker"
        onClose={() => setPickerOpen(false)}
        onDisplayMonthChange={setDisplayMonth}
        onSelectDate={(date) => {
          setBirthDate(formatDateKey(date));
          setDisplayMonth(date);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

function parseDateKey(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 22,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  heroIcon: {
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F6F3",
  },
  copy: {
    gap: 8,
  },
  title: {
    color: "#26364D",
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  formCard: {
    gap: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE7E2",
    backgroundColor: "#FFFFFF",
    padding: 18,
  },
  stageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  errorText: {
    color: "#D96C5B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
