# Deployment

## 배포 대상

현재 배포 대상은 Expo 모바일 앱과 Supabase 프로젝트입니다. 자체 Spring Boot API 서버는 현재 실행 경로에서 사용하지 않습니다.

## 앱 설정

- 앱 이름: `아이로그`
- Expo slug: `ilog`
- URL scheme: `ilog`
- iOS Bundle ID: `com.ilog.mobile`
- Android Package: `com.ilog.mobile`
- 기본 웹 스모크 포트: `19006`

## 앱 환경 변수

환경 변수의 값 분류, 로컬 `.env`와 EAS 환경의 동기화 절차는 [ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md)를 기준으로 합니다. EAS 원격 빌드는 로컬 `mobile/.env`를 자동으로 업로드하지 않으므로, 빌드에 필요한 공개값을 실제 EAS 환경에도 등록해야 합니다.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
EXPO_PUBLIC_HCAPTCHA_SITE_KEY=your-hcaptcha-site-key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your-ios-client-id
EXPO_PUBLIC_INVITE_BASE_URL=https://invite.example.com
EXPO_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/app/id123456789
EXPO_PUBLIC_ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.ilog.mobile
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

`service_role`, DB 비밀번호, Supabase access token, OAuth client secret은 모바일 앱이나 EAS 공개 환경에 넣지 않습니다.

`EXPO_PUBLIC_ANDROID_PLAY_STORE_URL`은 패키지명으로 예상한 URL을 선등록하지 않습니다. Play Console에서 `com.ilog.mobile` 앱 listing이 생성되고 실제 URL이 열리는 것을 확인한 뒤 EAS `production` 환경에 등록하고 새 Android production 빌드에 포함합니다.

## Google Play 제출 설정

Play Console에는 아래 공개 정보를 등록합니다.

- 개인정보 처리방침 URL: `https://ilog.io.kr/privacy-policy`
- 고객지원 URL: `https://ilog.io.kr/support`
- 계정 삭제 URL: `https://ilog.io.kr/delete-account`
- 고객지원 이메일: `ilog-support@ilog.io.kr`
- Android 실기기에서 촬영한 스크린샷과 feature graphic
- 심사용 계정, 가족 데이터, 로그인 및 핵심 기능 확인 절차
- 실제 수집·공유·보관·삭제 동작과 일치하는 Data Safety 양식
- 수면, 영양 및 체중, 예방접종, 약 복용 등 실제 기능과 일치하는 Health Apps 선언

Google 로그인은 로컬 또는 EAS upload 인증서만으로 완료 처리하지 않습니다. Play App Signing 인증서의 SHA-1을 Google Cloud/Firebase Android OAuth 클라이언트에 추가하고, Play 내부 테스트 트랙에서 받은 production AAB로 로그인까지 확인합니다.

앱 내 사용자 생성 콘텐츠 신고·사용자 차단·예방 필터, 실기기 핵심 시나리오, 운영 모니터링이 완료되기 전에는 Google Play production 공개 제출을 보류합니다. Play Console 앱 생성, 스토어 등록정보와 정책 선언 초안, 내부 테스트 트랙 준비는 보류 기간에도 진행할 수 있습니다.

## Supabase 필수 설정

- 최신 migration 적용
- RLS enabled
- `anon` 직접 테이블 접근 차단
- `authenticated` role에 필요한 select/insert/update/RPC 권한만 부여
- Auth redirect URL 등록:
  - `ilog://auth/email-confirmed`
  - `ilog://auth/reset-password`
  - `http://localhost:19006/auth/callback`
  - `http://127.0.0.1:19006/auth/callback`
- Google OAuth redirect URI:
  - `https://<project-ref>.supabase.co/auth/v1/callback`
- Attack Protection:
  - hCaptcha 활성화
  - hCaptcha secret key는 Supabase Dashboard에만 등록
- Auth hardening:
  - Anonymous Sign-ins 비활성화 (아이로그는 익명 인증을 사용하지 않음)
  - Confirm email과 Secure email change 활성화
  - Minimum password length 8자 이상
  - **Prevent use of leaked passwords**는 Supabase Pro 이상 전용입니다. Free 플랜에서는 활성화할 수 없으므로 Pro 전환 또는 위험 수용 결정을 운영 기록에 남깁니다.
  - Rate Limits: 이메일 발송 시간당 30건, 가입·로그인 IP당 5분 30회, 이메일 토큰 검증 IP당 5분 30회, 토큰 갱신 IP당 5분 150회
- Custom SMTP:
  - 발신자: `아이로그 <no-reply@auth.ilog.io.kr>`
  - 호스트: `smtp.resend.com`
  - 포트: `465`
  - 사용자명: `resend`
  - 비밀번호는 Resend API key를 Supabase Dashboard에만 등록
- Sign in with Apple 계정 탈퇴 자동 해지:
  - `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_CLIENT_ID`, `APPLE_SIGN_IN_PRIVATE_KEY`를 Edge Function secrets에만 등록
  - `exchange-apple-token`은 로그인 사용자의 Apple code를 refresh token으로 교환해 Vault에 암호화 저장
  - `revoke-apple-tokens`는 개인 탈퇴 트랜잭션에서 Auth soft-delete 전에 예약한 outbox 또는 가족 영구 삭제 trigger를 DB cron이 처리하며, 일시 실패는 outbox에서 재시도
  - 가족 전체 삭제 예약 시점에는 연결을 해지하지 않고 30일 후 실제 영구 삭제 트랜잭션에서만 해지 큐에 등록
  - 가족 삭제 화면은 전체 Apple 구성원의 Vault token 준비 상태를 집계하고, 누락된 구성원이 있으면 삭제 전에 수동 연결 해제를 안내
  - 토큰을 확보하지 못한 레거시 계정은 데이터 삭제를 막지 않고 앱에서 Apple 수동 연결 해제 절차를 안내
- 계정·가족 데이터 삭제:
  - 이미 설치된 2026-07 beta 앱은 기존 `request_caregiver_account_deletion_checked()`를 사용해 화면에 고지된 공동 콘텐츠 유지 정책을 보존함
  - 2026-09-02 앱은 `request_caregiver_account_deletion_v2_checked()`를 사용해 탈퇴자가 작성하거나 업로드한 기록·사진·대화·댓글을 삭제하고, 다른 보호자의 답글 구조를 보존해야 하는 항목만 작성자와 본문을 비식별화함
  - 2026-09-02 약관 또는 개인정보 처리방침에 동의한 보호자는 구형 RPC를 직접 호출할 수 없으며, 구형 beta가 퇴출된 뒤 v1 RPC 실행 권한을 제거함
  - 개인 탈퇴 요청 트랜잭션은 caregiver 행을 제거해 `current_caregiver` 기반 접근을 즉시 차단하고 Apple 해지 outbox와 private Auth 정리 job을 함께 예약함
  - `process-account-deletions`는 개인 job에 Supabase Admin API의 irreversible soft delete를 사용하며, `auth.users.deleted_at` tombstone을 DB에서 확인한 뒤 job과 audit의 `auth_cleanup` 상태를 완료함
  - Auth soft delete는 비가역이며 사용자의 인증 식별정보·identity·metadata를 익명화하고 hashed user ID로 tombstone을 식별할 수 있게 유지함
  - 내부 UUID는 Auth tombstone, RLS/grant로 차단된 private job·제한 audit, 기존 Storage ownership 기술 참조에 남을 수 있지만 일반 앱 권한에는 노출하지 않고 worker 응답·로그에도 포함하지 않음
  - 같은 worker는 30일 기한이 지난 가족의 `family-media` 파일을 service-role Storage API로 삭제하고, 빈 저장소를 확인한 뒤 DB·Auth 삭제를 완료
  - upgrade migration은 과거 `FAMILY_DELETED` audit metadata에 남은 `family_name`을 제거함
  - 과거 버전이 `storage.objects` metadata를 SQL로 직접 삭제한 이력이 있으므로 최초 운영 반영 전 삭제 완료 가족 prefix의 물리 object inventory를 별도로 확인함. metadata가 없는 객체는 일반 Storage API 목록만으로 없음을 증명하지 않음
  - `family-media` signed URL은 최대 10분, 앱 사진 캐시는 최대 8분으로 제한함. 탈퇴 직전에 발급된 bearer URL은 만료 전 즉시 취소할 수 없다는 잔여 접근창을 정책과 운영 대응에 반영함
  - migration 이전에 작성자를 수집하지 않은 일정과 작성자를 신뢰성 있게 귀속할 수 없는 자동 배정 작업은 가족 소유 legacy 데이터로 유지함
  - 삭제 작업은 1건 claim, 15분 lease, 재시도 backoff, 45초 실행 deadline과 pass별 경로 제한을 사용하며 처리 중이거나 기한이 지난 가족에는 새 미디어 업로드를 차단
  - 가족 삭제 취소는 삭제 기한 전이면서 worker가 한 번도 claim하지 않은 `PENDING`, `attempt_count = 0` job에만 허용함
  - Edge Function의 `PUSH_WORKER_CRON_SECRET`은 기존 Vault의 `babyboss_push_worker_cron_secret`과 같은 비밀값을 사용하고 모바일/EAS 공개 환경에는 넣지 않음
  - Vault의 `babyboss_edge_function_base_url`에는 각 Supabase 프로젝트의 canonical URL(`https://<project-ref>.supabase.co`)을 저장함. 검증 프로젝트에 운영 URL을 복사하지 않음
  - `babyboss-send-push-notifications`, `ilog-revoke-apple-sign-in-tokens`, `ilog-process-account-deletions` cron과 `private.dispatch_family_chat_push` trigger는 모두 이 프로젝트별 URL을 사용함

삭제 worker가 없는 상태에서 DB cron부터 활성화하지 않도록 다음 순서를 지킵니다. Vault secret 생성은 각 대상 프로젝트의 SQL Editor에서 수행하며 실제 URL은 저장소나 명령 기록에 남기지 않습니다.

```bash
npx supabase functions deploy process-account-deletions --project-ref <project-ref>
```

```sql
select vault.create_secret(
    'https://<project-ref>.supabase.co',
    'babyboss_edge_function_base_url',
    'Edge Function base URL for this Supabase project'
);

-- db push 전 반드시 true여야 하며 URL 원문은 출력하지 않습니다.
select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'babyboss_edge_function_base_url'
      and btrim(decrypted_secret) = 'https://<project-ref>.supabase.co'
) as edge_function_base_url_matches_target;
```

```bash
npx supabase db push --linked
```

URL secret이 없거나 canonical HTTPS 형식이 아니면 migration은 fail-fast 합니다. 형식만으로 대상 프로젝트 일치 여부를 판별할 수 없으므로, 위 boolean 검증의 `<project-ref>`를 현재 linked 프로젝트와 대조하는 절차를 생략하지 않습니다.

검증용 프로젝트에서 먼저 적용하고, `harden_family_updates_and_oauth_invites`가 `queue_family_deletion_storage_cleanup`보다 먼저 적용되는 migration 순서를 유지합니다.

## 인증 메일 템플릿

Supabase Dashboard의 이메일 템플릿에는 Supabase가 생성한 `{{ .ConfirmationURL }}`을 사용합니다. 앱 URL을 직접 조합하거나 토큰을 문서에 저장하지 않습니다.

이메일 확인:

```text
제목: [아이로그] 이메일 주소를 확인해 주세요

아이로그 가입을 마치려면 아래 버튼을 눌러 이메일 주소를 확인해 주세요.
{{ .ConfirmationURL }}

본인이 요청하지 않았다면 이 메일을 무시해 주세요.
```

비밀번호 재설정:

```text
제목: [아이로그] 비밀번호 재설정 안내

아래 버튼을 눌러 아이로그 앱에서 새 비밀번호를 설정해 주세요.
{{ .ConfirmationURL }}

본인이 요청하지 않았다면 비밀번호를 변경하지 않아도 됩니다.
```

DNS 등록 직후에는 Resend의 도메인 상태가 `Verified`로 바뀔 때까지 기다립니다. 확인 뒤 가입 및 비밀번호 재설정 메일을 실제 주소로 각각 한 번 보내고, 메일 버튼이 `ilog://auth/...` 경로로 앱을 여는지 검증합니다.

## 배포 전 게이트

1. `npm run typecheck`
2. `node --check scripts/playwright_smoke_flow.js`
3. `git diff --check`
4. `scripts/run_playwright_smoke.sh`
5. 실제 기기에서 로그인, Google 로그인, 아이 정보 입력, 기록 저장, 타임라인 댓글, 로그아웃 확인
6. Supabase Dashboard에서 redirect URL, Google provider, anon key, RLS 상태 확인
7. Supabase Dashboard에서 Anonymous Sign-ins 비활성화, 이메일 확인, 최소 비밀번호 8자, Rate Limits 값을 확인
8. Free 플랜이면 **Prevent use of leaked passwords** 미지원 위험 수용 여부 또는 Pro 전환 계획을 운영 기록에 남김
9. Apple Sandbox 계정으로 로그인한 뒤 개인 탈퇴를 실행하고, worker 처리 후 Apple credential state 및 Vault outbox 정리를 확인
10. 검증용 가족 삭제를 예약 기한 경과 상태로 처리해 Storage 목록·다운로드가 비고, 삭제 job 완료 후에만 가족 DB와 Auth 계정이 제거되는지 확인

## 공개 정책 및 지원 웹페이지

App Store와 Google Play에 등록할 개인정보 처리방침, 고객지원, 계정 삭제 URL은 Expo Router의 정적 웹 export로 배포합니다. `mobile/app.config.ts`의 `web.output`은 `static`으로 설정되어 있어 각 route의 HTML 파일이 생성됩니다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss/mobile
npm run export:web
```

배포 대상은 `mobile/dist/public-web/`입니다. 호스팅 서비스에는 아래 경로를 로그인 없이 HTTPS로 공개합니다.

- `https://ilog.io.kr/terms`
- `https://ilog.io.kr/privacy-policy`
- `https://ilog.io.kr/support`
- `https://ilog.io.kr/delete-account`
- `https://ilog.io.kr/invite`

### Netlify 배포 설정

저장소 루트의 `netlify.toml`에는 현재 정적 export 구조에 맞춘 설정이 포함되어 있습니다. Netlify에서 GitHub 저장소를 연결할 때 설정을 자동으로 읽습니다.

- Base directory: `mobile`
- Build command: `npm run export:web`
- Publish directory: `dist/public-web`
- Node.js: `24.14.1`

Netlify UI에서 위 값을 다시 입력할 필요는 없습니다. 빌드 환경 변수를 별도로 설정한다면 `EXPO_PUBLIC_*` 공개값만 등록하고, Supabase access token, SMTP API key, OAuth secret 같은 비밀값은 추가하지 않습니다.

#### 현재 공개 배포 상태

2026-07-25 기준 Netlify 사이트 이름은 `ilog-public`이며, custom domain `https://ilog.io.kr`에 TLS 인증서가 발급되어 있습니다. 아래 공개 페이지는 HTTPS 응답 HTTP 200으로 확인했습니다.

- `/terms`
- `/privacy-policy`
- `/support`
- `/delete-account`
- `/invite`

`/.well-known/apple-app-site-association`와 `/.well-known/assetlinks.json`도 HTTPS에서 `application/json`으로 응답함을 확인했습니다. 이는 검증 파일의 공개 상태만 확인한 것이며, 실제 iOS Universal Link 및 Android App Link가 설치된 앱을 여는지는 각 실기기에서 별도로 검증해야 합니다. `/delete-account`는 공개 안내 페이지까지 배포된 상태이며, 실제 삭제 요청 메일의 수신·처리 절차는 아직 별도 확인이 필요합니다.

`npm run export:web`는 각 공개 route의 `route.html`과 `route/index.html`을 함께 생성합니다. 따라서 호스팅 서비스가 확장자 없는 정적 route를 자동 처리하지 않아도 `/terms/`, `/privacy-policy/`, `/support/`, `/delete-account/`, `/invite/`를 그대로 열 수 있습니다. Netlify와 Cloudflare Pages는 포함된 `_redirects` 규칙으로 `/terms` 같은 마지막 슬래시 없는 URL도 정규화합니다. 다른 호스팅을 선택하면 같은 301 redirect 규칙을 해당 서비스의 설정에 추가합니다. 별도 SPA fallback은 필요하지 않습니다.

새 배포 전에는 공개 도메인에서 위 5개 URL을 각각 열고, 지원·삭제 요청 링크와 앱 설치 전 초대 안내가 정상 노출되는지 확인합니다. 네이티브 Universal Link/App Link까지 사용하려면 `EXPO_PUBLIC_INVITE_BASE_URL=https://ilog.io.kr`을 로컬 `.env` 및 실제 EAS 환경에 등록하고, 새 iOS/Android 빌드를 만들어야 합니다.

## 운영 대응 SLA

출시 운영의 접수 및 복구 기준은 다음과 같습니다.

- 아동 안전 또는 불법 콘텐츠 신고: 접수 후 1시간 이내 1차 확인
- 일반 콘텐츠 신고: 접수 후 24시간 이내 1차 검토, 72시간 이내 조치 또는 처리 결과 회신
- 계정·가족 삭제 worker 오류: 발생 후 1시간 이내 감지, 자동 복구가 되지 않으면 3영업일 이내 수동 삭제 완료
- 일반 고객 문의: 접수 후 2영업일 이내 1차 회신
- 담당 채널: `ilog-support@ilog.io.kr`

이 SLA를 실제로 지키려면 지원 메일 수신 알림, 담당자 연락망, 신고·삭제 처리 기록을 운영 환경에 연결해야 합니다. 2026-09-03 소스에는 앱 내 신고·사용자 차단·서버 금칙 표현 필터와 개인정보 없는 운영 점검 도구를 추가했습니다. 운영 migration·푸시 함수 반영, 점검 스케줄·수신 채널 연결, 실제 담당자의 처리 검증이 끝나야 출시 게이트를 통과합니다. 배포 순서와 서비스 전용 신고 조치 RPC는 `CONTENT_SAFETY_OPERATIONS.md`를 따릅니다.

삭제 worker는 `cron.job_run_details`만 보지 않고 `private.family_deletion_jobs`, `private.caregiver_account_deletion_jobs`의 오래된 `PENDING`/`PROCESSING`, `attempt_count`, `last_error`와 Apple 해지 outbox의 `MANUAL_REQUIRED`를 함께 감시합니다. cron 요청 성공은 Edge Function 내부 정리 성공을 보장하지 않으므로 함수 로그와 job 상태를 함께 확인합니다.

`mobile/public/.well-known/`의 아래 검증 파일도 정적 export 결과에 함께 포함됩니다.

- `apple-app-site-association`: Apple Team ID `37A43S5GYQ`와 `com.ilog.mobile`의 `/invite` Universal Link 연결
- `assetlinks.json`: 현재 EAS Android release keystore SHA-256과 `com.ilog.mobile`의 `/invite` App Link 연결

도메인 배포 또는 관련 파일 변경 후에는 브라우저에서 두 파일이 리다이렉트 없이 HTTPS, JSON 응답으로 열리는지 다시 확인합니다. 2026-07-25 현재 `ilog.io.kr`에서 이 응답을 확인했습니다. Android keystore를 교체하면 새 SHA-256을 `assetlinks.json`에 추가한 뒤 다시 배포해야 합니다.

## 롤백 기준

- 앱 배포는 즉시 롤백이 어렵기 때문에 Supabase RPC와 schema는 하위 호환을 우선합니다.
- RLS/grant 변경은 배포 직후 demo 계정과 비회원 접근으로 검증합니다.
- 데이터 삭제/내보내기/Storage 정책 변경은 rollback SQL 또는 비활성화 경로를 함께 준비합니다.
