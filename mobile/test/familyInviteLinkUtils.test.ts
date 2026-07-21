import assert from "node:assert/strict";
import test from "node:test";

import { buildFamilyInviteUrl, normalizeFamilyInviteCode } from "../src/features/shared/familyInviteLinkUtils";

test("가족 초대 코드는 공백을 제거하고 대문자로 정규화한다", () => {
  assert.equal(normalizeFamilyInviteCode(" bb-family "), "BB-FAMILY");
  assert.equal(normalizeFamilyInviteCode(["family-42"]), "FAMILY-42");
});

test("HTTPS 초대 도메인이 있으면 웹 초대 링크를 만든다", () => {
  assert.equal(
    buildFamilyInviteUrl({
      inviteCode: "bb-family",
      inviteBaseUrl: "https://invite.example.com/mobile",
      fallbackUrl: "ilog://invite",
    }),
    "https://invite.example.com/mobile/invite?invite_code=BB-FAMILY",
  );
});

test("초대 도메인이 없거나 HTTPS가 아니면 앱 scheme 링크를 사용한다", () => {
  assert.equal(
    buildFamilyInviteUrl({
      inviteCode: "bb-family",
      inviteBaseUrl: "http://invite.example.com",
      fallbackUrl: "ilog://invite",
    }),
    "ilog://invite?invite_code=BB-FAMILY",
  );
});

test("앱 scheme 링크에 이미 코드가 있어도 최신 초대 코드 하나만 유지한다", () => {
  assert.equal(
    buildFamilyInviteUrl({
      inviteCode: "bb-family",
      fallbackUrl: "ilog://invite?invite_code=OLD-CODE",
    }),
    "ilog://invite?invite_code=BB-FAMILY",
  );
});
