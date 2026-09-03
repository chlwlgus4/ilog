import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(import.meta.dirname, "..", "src", "serverless", "babyBossSupabaseApi.ts"),
  "utf8",
);

test("가족 미디어 signed URL은 탈퇴 후 장기 접근을 줄이도록 10분만 유효하다", () => {
  assert.match(
    source,
    /const familyMediaSignedUrlExpiresInSeconds = 10 \* 60;/,
  );
  assert.match(source, /const photoAlbumCacheMaxAgeMs = 8 \* 60 \* 1000;/);
});
