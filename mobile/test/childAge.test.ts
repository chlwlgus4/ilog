import assert from "node:assert/strict";
import test from "node:test";

import { childAgeInMonths, formatChildAge } from "../src/features/shared/childAge";

test("생후 개월 수는 같은 일자가 지나야 한 달 증가한다", () => {
  assert.equal(childAgeInMonths("2025-01-15", new Date(2026, 6, 14)), 17);
  assert.equal(childAgeInMonths("2025-01-15", new Date(2026, 6, 15)), 18);
});

test("월령 표기는 총 개월 수와 나이를 함께 보여 준다", () => {
  assert.equal(formatChildAge("2024-01-15", new Date(2026, 6, 15)), "30개월 · 2세");
});

test("미래 생년월일은 0개월로 처리하고 잘못된 날짜는 표시하지 않는다", () => {
  assert.equal(formatChildAge("2026-12-01", new Date(2026, 6, 20)), "0개월 · 0세");
  assert.equal(formatChildAge("2026-02-29", new Date(2026, 6, 20)), null);
});
