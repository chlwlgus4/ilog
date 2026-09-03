import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = (path: string) => readFileSync(join(import.meta.dirname, "..", "src", path), "utf8");
const runtime = src("hooks/useBabyBossRuntime.ts");
const api = src("serverless/babyBossSupabaseApi.ts");

test("신고·차단 변경은 현재 화면과 사진 캐시를 비우고 이전 요청을 무효화한다", () => {
  assert.match(runtime, /subscribeSafetyChanges\(\(change\) => \{[\s\S]*?safetyRequestVersion\.current \+= 1/);
  assert.match(runtime, /invalidateFamilyMediaCache\(\);[\s\S]*?setDashboard\(null\);[\s\S]*?setChat\(null\);[\s\S]*?setFamilyChat\(null\);/);
  assert.match(runtime, /await refreshContentSafetyState\(\);[\s\S]*?const safetyVersion = safetyRequestVersion\.current/);
  assert.match(api, /function invalidateFamilyMediaCache\(\) \{\s+familyMediaCacheVersion \+= 1;\s+photoAlbumCache\.clear\(\);\s+pendingPhotoAlbumLoads\.clear\(\)/);
  assert.match(api, /if \(cacheVersion !== familyMediaCacheVersion\) \{\s+throw new Error/);
});

test("이전 계정의 복원·전송 응답은 계정 전환 후 새 화면에 적용되지 않는다", () => {
  assert.match(runtime, /const hydrationVersion = \+\+hydrationRequestVersion\.current;[\s\S]*?await hasCurrentLegalConsent\(\);\s+if \(hydrationRequestVersion\.current !== hydrationVersion\) return/);
  assert.match(runtime, /function applyFamilyChatMessage\([\s\S]*?if \(!isCurrentSessionScope\(expected\)\) return/);
  assert.match(runtime, /setFamilyChat\(\(current\) => isCurrentSessionScope\(expected\) \?/);
  assert.match(runtime, /async function clearLocalSession\(\) \{\s+hydrationRequestVersion\.current \+= 1;[\s\S]*?activeSessionScope\.current = null/);
  assert.match(runtime, /const restored = await restoreSession\(\);\s+if \(hydrationRequestVersion\.current !== refreshVersion\) return/);
});

test("대시보드와 노트의 느린 응답은 안전 상태 변경 후 적용하지 않는다", () => {
  assert.match(runtime, /if \(safetyRequestVersion\.current === safetyVersion\) setDashboard\(payload\)/);
  assert.match(runtime, /if \(safetyRequestVersion\.current === safetyVersion\) setNotebook\(payload\)/);
});

test("신고 버튼의 작성자는 화면 이름이 아닌 DB 식별자로 전달한다", () => {
  for (const mapping of ["senderId: row.sender_id", "authorId: row.author_caregiver_id", "caregiverId: row.caregiver_id", "createdById: row.created_by_id"]) {
    assert.ok(api.includes(mapping), mapping);
  }
});
