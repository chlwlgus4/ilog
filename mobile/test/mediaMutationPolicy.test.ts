import assert from "node:assert/strict";
import test from "node:test";

import {
  commitUploadedMedia,
  deleteMediaStorageFirst,
} from "../src/serverless/mediaMutationPolicy";

test("미디어 DB 커밋 전 실패만 업로드 파일을 보상 삭제한다", async () => {
  const calls: string[] = [];
  const commitError = new Error("commit failed");

  await assert.rejects(
    commitUploadedMedia({
      commitRecord: async () => {
        calls.push("commit");
        throw commitError;
      },
      resolveCommittedRecord: async () => {
        calls.push("resolve");
        return "ready";
      },
      cleanupUncommittedUpload: async () => {
        calls.push("cleanup");
      },
      recoverCommittedRecord: () => {
        calls.push("recover");
        return "committed";
      },
    }),
    commitError,
  );

  assert.deepEqual(calls, ["commit", "cleanup"]);
});

test("DB 커밋 후 signed URL 실패는 Storage를 지우지 않고 복구 결과를 반환한다", async () => {
  const calls: string[] = [];
  const result = await commitUploadedMedia({
    commitRecord: async () => {
      calls.push("commit");
      return { id: 17 };
    },
    resolveCommittedRecord: async () => {
      calls.push("resolve");
      throw new Error("signed URL unavailable");
    },
    cleanupUncommittedUpload: async () => {
      calls.push("cleanup");
    },
    recoverCommittedRecord: (record) => {
      calls.push("recover");
      return { kind: "committed" as const, recordId: record.id };
    },
  });

  assert.deepEqual(result, { kind: "committed", recordId: 17 });
  assert.deepEqual(calls, ["commit", "resolve", "recover"]);
});

test("미디어 삭제는 Storage 실패 시 DB 행을 보존한다", async () => {
  const calls: string[] = [];

  await assert.rejects(
    deleteMediaStorageFirst({
      deleteStorage: async () => {
        calls.push("storage");
        throw new Error("storage unavailable");
      },
      deleteRecord: async () => {
        calls.push("record");
        return 17;
      },
    }),
    /storage unavailable/,
  );

  assert.deepEqual(calls, ["storage"]);
});

test("Storage 삭제 후 DB 정리 실패는 멱등 재시도로 완료할 수 있다", async () => {
  const calls: string[] = [];
  let recordAttempts = 0;

  const run = () => deleteMediaStorageFirst({
    deleteStorage: async () => {
      calls.push("storage");
    },
    deleteRecord: async () => {
      calls.push("record");
      recordAttempts += 1;
      if (recordAttempts === 1) {
        throw new Error("database unavailable");
      }
      return 17;
    },
  });

  await assert.rejects(run(), /database unavailable/);
  assert.equal(await run(), 17);
  assert.deepEqual(calls, ["storage", "record", "storage", "record"]);
});
