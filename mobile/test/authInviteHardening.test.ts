import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { normalizeOAuthSignupProfile } from "../src/features/auth/oauthSignupProfile";

const mobileRoot = join(import.meta.dirname, "..");
const repositoryRoot = join(mobileRoot, "..");
const authView = readFileSync(join(mobileRoot, "src", "features", "auth", "AuthView.tsx"), "utf8");
const actions = readFileSync(join(mobileRoot, "src", "hooks", "babyBossActions.ts"), "utf8");
const screens = readFileSync(join(mobileRoot, "src", "screens", "BabyBossScreen.tsx"), "utf8");
const extraScreens = readFileSync(join(mobileRoot, "src", "screens", "BabyBossExtraScreens.tsx"), "utf8");
const rootLayout = readFileSync(join(mobileRoot, "app", "_layout.tsx"), "utf8");
const requiredChildProfile = readFileSync(
  join(mobileRoot, "src", "features", "auth", "RequiredChildProfileView.tsx"),
  "utf8",
);
const requiredLegalConsent = readFileSync(
  join(mobileRoot, "src", "features", "auth", "RequiredLegalConsentView.tsx"),
  "utf8",
);
const supabaseApi = readFileSync(join(mobileRoot, "src", "serverless", "babyBossSupabaseApi.ts"), "utf8");
const oauthMigration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20260902101134_harden_family_updates_and_oauth_invites.sql"),
  "utf8",
);
const emailAuthMigration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20260723043852_standard_email_auth_caregiver.sql"),
  "utf8",
);

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.ok(startIndex >= 0, `${start} 시작점을 찾지 못했습니다.`);
  assert.ok(endIndex > startIndex, `${end} 종료점을 찾지 못했습니다.`);
  return source.slice(startIndex, endIndex);
}

test("OAuth 가입 프로필은 공백을 정리하고 허용된 역할만 유지한다", () => {
  assert.deepEqual(
    normalizeOAuthSignupProfile({ caregiverName: "  엄마  ", role: "MOM" }),
    { caregiverName: "엄마", role: "MOM" },
  );
  assert.equal(normalizeOAuthSignupProfile({ caregiverName: "", role: "DAD" }), null);
  assert.equal(
    normalizeOAuthSignupProfile({ caregiverName: "보호자", role: "OWNER" as never }),
    null,
  );
});

test("초대 회원가입의 login mode는 초대와 동의 및 OAuth 프로필을 명시적으로 유지한다", () => {
  assert.match(
    authView,
    /onGoogleAuth\(joinForm\.inviteCode, currentLegalConsent\(\), \{[\s\S]*?caregiverName: joinForm\.caregiverName,[\s\S]*?role: joinForm\.role/,
  );
  assert.match(
    authView,
    /onAppleAuth\(joinForm\.inviteCode, currentLegalConsent\(\), \{[\s\S]*?caregiverName: joinForm\.caregiverName,[\s\S]*?role: joinForm\.role/,
  );
  assert.match(
    authView,
    /onLogin\([\s\S]*?originatedFromSignup \? joinForm\.inviteCode : undefined/,
  );
  assert.match(authView, /originatedFromSignup \? startGoogleSignup : \(\) => onGoogleAuth\(\)/);
  assert.match(authView, /originatedFromSignup && \(!joinForm\.termsAccepted \|\| !joinForm\.privacyAccepted\)/);
  assert.match(authView, /testID="auth-login-caregiver-name"/);
  assert.match(authView, /testID=\{`auth-login-role-\$\{role\}`\}/);

  const signupRoute = sourceBetween(screens, "export function SignupRoute", "export function FamilyInviteLinkRoute");
  assert.match(signupRoute, /onForgotPassword=\{\(\) => router\.push\("\/forgot-password"\)\}/);
  assert.match(signupRoute, /const routeInviteCode = inviteCode \?\? ""/);
  assert.doesNotMatch(signupRoute, /if \(!inviteCode\)\s*\{\s*return/);
  assert.doesNotMatch(signupRoute, /onGoogleAuth=\{\(\) =>/);
  assert.match(signupRoute, /initialMode=\{authModeParam === "login" \? "login" : "signup"\}/);
  assert.match(signupRoute, /signupContext/);
});

test("일반 이메일 로그인은 숨은 가입 초대 코드를 전달하지 않고 저장된 잘못된 코드를 명시적으로 무시한다", () => {
  const handleLogin = sourceBetween(actions, "async function handleLogin", "async function handleJoin");
  const loginApi = sourceBetween(supabaseApi, "export async function login", "async function completeOAuthCaregiverSession");
  const emailCompletion = sourceBetween(supabaseApi, "async function completeEmailCaregiverSession", "async function loadCurrentContext");

  assert.doesNotMatch(handleLogin, /joinForm\.inviteCode/);
  assert.match(handleLogin, /inviteCode\?\.trim\(\) \? \{ inviteCode \} : \{\}/);
  assert.match(
    handleLogin,
    /await runtime\.hydrate\(nextSession(?:,\s*undefined,\s*true)?\);\s*forms\.resetJoinForm\(\)/,
  );
  assert.match(loginApi, /inviteCode: normalizeInviteCode\(payload\.inviteCode\)/);
  assert.match(emailCompletion, /hasOwnProperty\.call\(payload, "inviteCode"\)/);
  assert.match(emailCompletion, /p_invite_code: hasExplicitInviteCode \? inviteCode \?\? "" : null/);
  assert.doesNotMatch(emailCompletion, /auth\.updateUser/);
});

test("이메일 확인 콜백은 URL 초대 코드가 있을 때만 metadata를 덮어쓰고 없으면 가입 metadata를 사용한다", () => {
  const callback = sourceBetween(supabaseApi, "export async function completeEmailAuth", "export async function requestPasswordReset");

  assert.match(callback, /params\.inviteCode \? \{ inviteCode: params\.inviteCode \} : \{\}/);
  assert.doesNotMatch(callback, /inviteCode: params\.inviteCode \?\? undefined/);
  assert.match(
    emailAuthMigration,
    /coalesce\(\s*p_invite_code,\s*v_user\.raw_user_meta_data->>'invite_code',\s*''\s*\)/,
  );
});

test("OAuth 가입 프로필은 callback까지 보관하고 신규 caregiver 생성에만 사용한다", () => {
  assert.match(supabaseApi, /storePendingGoogleSignupProfile\(payload\.signupProfile\)/);
  assert.match(supabaseApi, /takePendingGoogleSignupProfile\(\)/);
  assert.match(supabaseApi, /auth\.updateUser\(\{[\s\S]*?caregiver_name: normalizedProfile\.caregiverName,[\s\S]*?caregiver_role: normalizedProfile\.role/);
  assert.match(oauthMigration, /raw_user_meta_data->>'caregiver_name'/);
  assert.match(oauthMigration, /raw_user_meta_data->>'caregiver_role'/);
  assert.match(oauthMigration, /v_requested_role not in \('MOM', 'DAD', 'GUARDIAN'\)/);
  assert.match(
    oauthMigration,
    /role = case when v_invitation_id is null then caregiver\.role else v_role end/,
  );
  assert.match(oauthMigration, /values \(v_family\.id, auth\.uid\(\), v_email, v_name, v_role/);
  assert.match(
    oauthMigration,
    /insert into public\.caregivers\(\s*family_id,\s*auth_user_id,\s*email,\s*name,\s*role,\s*availability_score,\s*fatigue_score,\s*password_hash\s*\)\s*values \(v_family\.id, auth\.uid\(\), v_email, v_name, v_role, 7, 4, ''\)/,
  );
});

test("인증 화면의 약관은 허용된 복귀 경로와 초대 코드만 보존한다", () => {
  assert.match(authView, /<LegalLinks returnTo="signup" inviteCode=\{joinForm\.inviteCode\} authMode="signup"\/>/);
  assert.match(authView, /authMode=\{originatedFromSignup \? "login" : undefined\}/);
  assert.match(screens, /pathname: "\/terms", params: \{return_to: "login"\}/);

  const legalRoute = sourceBetween(extraScreens, "function LegalDocumentRoute", "export function VaccinationsRoute");
  assert.match(legalRoute, /returnTo === "signup"/);
  assert.match(legalRoute, /pathname: "\/signup"/);
  assert.match(legalRoute, /authMode === "login" \? \{ auth_mode: "login" \} : \{\}/);
  assert.match(legalRoute, /returnTo === "login"/);
  assert.match(legalRoute, /router\.replace\("\/app-info"\)/);
});

test("계정 삭제 화면은 focus 때 최신 세션을 먼저 갱신하고 웹에서도 파괴적 확인을 받는다", () => {
  const deletionRoute = sourceBetween(extraScreens, "export function AccountDeletionRoute", "export function PersonalInfoRoute");
  const confirmation = sourceBetween(extraScreens, "function confirmAccountDeletionAction", "type BackTarget");

  assert.match(extraScreens, /loadAccountDeletionScreenContext[\s\S]*?restoreSession\(\)[\s\S]*?fetchSettings\(session\.family\.id\)[\s\S]*?getAccountDeletionAuthMethods\(\)/);
  assert.match(deletionRoute, /setDeletionSession\(context\.session\)/);
  assert.match(deletionRoute, /confirmAccountDeletionAction\(\{/);
  assert.match(deletionRoute, /requiresNativeOAuthReauthentication[\s\S]*?openSupportEmail/);
  assert.match(deletionRoute, /앱에서 본인 확인 후 개인 계정 탈퇴/);
  assert.match(confirmation, /Platform\.OS === "web"/);
  assert.match(confirmation, /window\.confirm/);
  assert.match(confirmation, /Alert\.alert/);
  assert.match(extraScreens, /function showAppleManualRevocationAction[\s\S]*?window\.confirm/);
});

test("아이 미등록 또는 최신 약관 미동의 상태에서도 계정 삭제권을 행사할 수 있다", () => {
  assert.match(rootLayout, /const isAccountDeletionPath = pathname === "\/account-deletion"/);
  assert.match(rootLayout, /!hasChild && !isAccountDeletionPath/);
  assert.match(rootLayout, /!isLegalDocumentPath && !isAccountDeletionPath/);
  assert.match(requiredChildProfile, /href="\/account-deletion"[\s\S]*?아이 정보 등록 없이 계정 탈퇴/);
  assert.match(requiredLegalConsent, /href="\/account-deletion"[\s\S]*?동의 없이 계정 탈퇴/);
});
