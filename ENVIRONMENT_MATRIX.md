# 환경 변수 운영 기준

이 문서는 아이로그의 환경 변수 전달 경로와 추가 절차의 기준 문서입니다. 실제 값, 토큰, 비밀번호는 문서나 Git에 저장하지 않습니다.

## 핵심 원칙

- `mobile/.env`는 로컬 개발용 파일입니다. EAS 서버는 이 파일을 자동으로 업로드하거나 읽지 않습니다.
- 앱 빌드에 필요한 공개 환경 변수는 로컬 `mobile/.env`와 실제로 빌드할 EAS 환경에 모두 등록합니다.
- `EXPO_PUBLIC_` 접두사가 붙은 값은 앱 번들에서 확인될 수 있습니다. URL, 공개 키, OAuth 클라이언트 ID처럼 공개되어도 되는 값만 사용합니다.
- Supabase 앱 연결값도 같은 규칙을 따릅니다. `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`는 로컬 `.env`와 EAS 환경에 모두 필요합니다.
- hCaptcha 앱 공개 키인 `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`도 로컬 `.env`와 EAS 환경에 모두 필요합니다.
- 비밀번호, access token, OAuth client secret, service role key는 앱 번들 또는 `EXPO_PUBLIC_*` 변수에 넣지 않습니다.

## 전달 경로

| 구분 | 로컬 개발 | EAS 원격 빌드 | 외부 서비스 설정 |
| --- | --- | --- | --- |
| 공개 모바일 설정 | `mobile/.env` | 빌드에 사용하는 EAS 환경 | 필요 없음 |
| Supabase URL / anon key | `mobile/.env` | 빌드에 사용하는 EAS 환경 | Supabase 프로젝트에서 발급 |
| hCaptcha site key | `mobile/.env` | 빌드에 사용하는 EAS 환경 | hCaptcha에서 발급한 공개 site key |
| Google OAuth 클라이언트 ID | `mobile/.env` | 빌드에 사용하는 EAS 환경 | Google Cloud Console에서 발급 |
| 가족 초대 링크 / 스토어 URL | `mobile/.env` | 빌드에 사용하는 EAS 환경 | 초대 웹 도메인, App Store, Google Play에서 준비 |
| Supabase Google provider secret | 넣지 않음 | 넣지 않음 | Supabase Dashboard의 Google provider 설정 |
| Apple 자동 해지 서버 자격 증명 | 넣지 않음 | 넣지 않음 | Supabase Edge Function secrets에만 등록 |
| Edge worker cron secret | 넣지 않음 | 넣지 않음 | Supabase Vault와 Edge Function secrets에 같은 값으로 등록 |
| Edge Function base URL | 넣지 않음 | 넣지 않음 | 각 Supabase 프로젝트 Vault에 해당 프로젝트 canonical URL로 등록 |
| hCaptcha secret key | 넣지 않음 | 넣지 않음 | Supabase Dashboard의 Attack Protection 설정 |
| Resend SMTP API key | 넣지 않음 | 넣지 않음 | Supabase Dashboard의 Custom SMTP 설정 |
| Supabase CLI 배포 자격 증명 | 로컬 셸 또는 안전한 CI secret | 모바일 EAS 환경에 넣지 않음 | Supabase CLI / CI에서만 사용 |

## 현재 공개 모바일 환경 변수

아래 값은 `mobile/app.config.ts`가 Expo 앱 설정으로 전달합니다. 새 iOS/Android EAS 빌드를 만들 때 해당 환경에 없으면 빌드 결과에 반영되지 않습니다.

| 변수 | 용도 | EAS 등록 |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 필요 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 앱 공개 키 | 필요 |
| `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` | 로그인, 회원가입, 비밀번호 재설정용 hCaptcha 공개 키 | 필요 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google 인증 서버 클라이언트 ID | Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS Google OAuth 클라이언트 ID | iOS Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | iOS Google 로그인 콜백 URL scheme | iOS Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_INVITE_BASE_URL` | HTTPS 가족 초대 웹 주소. `/invite?invite_code=...` 링크의 기준 주소 | 가족 초대 링크 사용 시 필요 |
| `EXPO_PUBLIC_IOS_APP_STORE_URL` | 초대 페이지의 App Store 이동 URL | iOS 스토어 배포 시 필요 |
| `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL` | 초대 페이지의 Google Play 이동 URL | Android 스토어 배포 시 필요 |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS 프로젝트 ID 오버라이드 | 선택. 현재 `app.config.ts`에 기본값이 있음 |

### Supabase 관련 비밀값

수동 점검 스크립트 `check_release_operations.mjs`는 운영 서버의 `ILOG_OPERATIONS_SUPABASE_URL`, `ILOG_OPERATIONS_SERVICE_ROLE_KEY`를 사용합니다. `--notify`는 선택한 `ILOG_OPERATIONS_ALERT_WEBHOOK_URL`로 집계를 전송합니다.

정기 이메일 점검은 GitHub Actions의 `notify_release_operations.mjs`로 분리했습니다. GitHub에는 `ILOG_OPERATIONS_SUPABASE_URL`, `ILOG_OPERATIONS_MONITOR_SECRET`, `ILOG_OPERATIONS_RESEND_API_KEY`, `ILOG_OPERATIONS_EMAIL_FROM`, `ILOG_OPERATIONS_EMAIL_TO`를 encrypted Secrets로 저장하고, 준비 후 variable `ILOG_OPERATIONS_MONITOR_ENABLED=true`로 활성화합니다. GitHub에는 Supabase service role 키를 넣지 않습니다. `ILOG_OPERATIONS_MONITOR_SECRET`과 같은 값을 Supabase Edge Secret `OPERATIONS_MONITOR_SECRET`에 저장합니다. `check-release-operations` 함수만 서버 내부의 service role로 집계 RPC를 읽습니다. Resend 키는 아이로그 도메인의 Sending access 전용이며 기존 Auth SMTP 키와 분리합니다.

위 비밀값과 수신자 주소는 모바일/EAS 공개 환경이나 `EXPO_PUBLIC_*`에 추가하지 않습니다. 실제 발송·실행 확인과 예약 실행의 한계는 `CONTENT_SAFETY_OPERATIONS.md`를 참조합니다.

`SUPABASE_ACCESS_TOKEN`과 `SUPABASE_DB_PASSWORD`는 `npx supabase db push`, Edge Function 배포 같은 로컬 또는 CI 작업용입니다. 앱 런타임에서 읽지 않으며 모바일 EAS 환경에 등록하지 않습니다. CI에서 Supabase 배포를 자동화할 때만 CI의 secret 저장소에 별도로 등록합니다.

`service_role` 키와 Supabase Google provider의 client secret도 같은 이유로 모바일 앱 또는 EAS 공개 환경에 넣지 않습니다. `service_role`은 `send-push-notifications`, `revoke-apple-tokens`, `process-account-deletions` 같은 서버 전용 Edge Function 런타임에서만 사용합니다.

`PUSH_WORKER_CRON_SECRET`은 push, Apple 해지, 가족 삭제 worker가 pg_cron 요청을 검증하는 서버 전용 값입니다. Supabase Vault의 `babyboss_push_worker_cron_secret`과 Edge Function secret에 같은 값을 등록하고, 모바일 `.env`, EAS 환경, `EXPO_PUBLIC_*`, Git에는 넣지 않습니다.

`babyboss_edge_function_base_url`은 Edge Function secret이나 모바일 환경 변수가 아니라 Supabase Vault secret 이름입니다. 각 개발·검증·운영 프로젝트에는 반드시 그 프로젝트의 canonical URL인 `https://<project-ref>.supabase.co`를 별도로 저장합니다. 검증 프로젝트에 운영 URL을 재사용하면 안 됩니다. 이 값은 push cron, Apple 해지 cron, 계정 삭제 cron, 가족 채팅 push trigger가 같은 프로젝트의 Edge Function만 호출하도록 묶는 배포 경계입니다.

`queue_family_deletion_storage_cleanup` migration 적용 전에는 대상 linked project ref와 Vault URL이 일치하는지 원문을 출력하지 않는 boolean query로 검증합니다. secret 누락 또는 canonical URL 형식 오류는 migration을 실패시키며, URL의 프로젝트 불일치는 운영자가 `<project-ref>`와 대조해 차단해야 합니다. 등록·검증 SQL과 배포 순서는 `DEPLOYMENT.md`를 따릅니다.

개인 탈퇴의 durable Auth 정리 job은 `service_role` 전용이며 모바일/EAS 환경 변수를 추가하지 않습니다. 2026-09-02 앱은 v2 삭제 RPC를 호출하고, 구형 beta의 v1은 구정책 동의자에게만 허용합니다. Supabase Admin API의 irreversible soft delete는 사용자의 인증 식별정보·identity·metadata를 익명화하고 hashed user ID로 tombstone을 식별할 수 있게 유지합니다. 내부 Auth UUID는 tombstone과 RLS/grant로 보호된 private job에만 기술적 멱등 키로 남으며, 완료 audit의 가족·보호자·Auth 식별자는 제거하고 Edge worker 로그·응답에도 포함하지 않습니다. 구형 v1 정책으로 보존된 파일의 레거시 Storage ownership에는 삭제된 Auth UUID가 기술 참조로 남을 수 있지만, 공개 식별자로 사용하지 않고 private bucket의 RLS와 가족 권한으로만 접근을 제한합니다.

Apple 계정 탈퇴 자동 해지는 아래 네 값을 Supabase Edge Function secrets에만 등록합니다. `APPLE_SIGN_IN_PRIVATE_KEY`는 Apple Developer의 Sign in with Apple 키에서 내려받은 `.p8` 원문이며, 모바일 `.env`, EAS 환경, `EXPO_PUBLIC_*`, Git에는 절대 넣지 않습니다.

| 변수 | 값 |
| --- | --- |
| `APPLE_SIGN_IN_TEAM_ID` | Apple Developer Team ID |
| `APPLE_SIGN_IN_KEY_ID` | Sign in with Apple private key의 Key ID |
| `APPLE_SIGN_IN_CLIENT_ID` | 네이티브 앱 식별자 `com.ilog.mobile` |
| `APPLE_SIGN_IN_PRIVATE_KEY` | `.p8` private key 전체 원문 |

Supabase Dashboard의 `Edge Functions > Secrets`에서 등록하는 방법을 우선 사용합니다. CLI를 쓸 때는 저장소 밖의 임시 env 파일을 `npx supabase secrets set --env-file <절대경로> --project-ref <project-ref>`로 전달하고 즉시 안전하게 폐기합니다. 값 자체를 명령행 인자로 넣어 셸 기록에 남기지 않습니다.

hCaptcha secret key는 Supabase Dashboard의 `Authentication > Attack Protection`에만 저장합니다. Resend API key도 Supabase Dashboard의 `Authentication > Emails > SMTP Settings`에만 저장하며, 두 값 모두 `EXPO_PUBLIC_*`로 만들지 않습니다.

## 새 환경 변수 추가 절차

### 1. 공개값인지 먼저 분류

- 앱에서 읽어야 하고 공개되어도 되는 값: `EXPO_PUBLIC_*`로 만들고 아래 절차를 모두 수행합니다.
- 비밀값: 모바일 `.env`의 `EXPO_PUBLIC_*`나 EAS 공개 환경에 넣지 않습니다. Supabase Dashboard, GitHub Actions 같은 CI secret, 또는 서버/Edge Function secret에만 등록합니다.

### 2. 코드와 로컬 `.env`를 함께 변경

`app.config.ts` 또는 앱 코드가 새 변수를 읽도록 추가한 뒤, 각 개발자의 `mobile/.env`에도 값을 넣습니다. `.env`는 Git에 커밋하지 않습니다.

```env
# 실제 값은 각자 로컬에서만 설정
EXPO_PUBLIC_EXAMPLE_VALUE=your-public-value
```

### 3. 빌드할 EAS 환경에 같은 공개값 등록

현재 EAS 기본 환경은 `development`, `preview`, `production`입니다. 예를 들어 preview 빌드를 만들면 `preview` 환경에 같은 값이 있어야 합니다.

```bash
cd mobile

npx eas-cli@latest env:set preview \
  --name EXPO_PUBLIC_EXAMPLE_VALUE \
  --value "your-public-value" \
  --visibility plaintext \
  --non-interactive
```

`env:set`은 값이 이미 있으면 갱신하고 없으면 생성합니다. `development`나 `production`도 빌드한다면 해당 환경에 각각 같은 명령으로 등록합니다.

```bash
npx eas-cli@latest env:set development --name EXPO_PUBLIC_EXAMPLE_VALUE --value "your-public-value" --visibility plaintext --non-interactive
npx eas-cli@latest env:set production --name EXPO_PUBLIC_EXAMPLE_VALUE --value "your-public-value" --visibility plaintext --non-interactive
```

EAS 환경 등록은 로컬 `.env`를 수정하지 않으므로, 두 위치를 모두 유지해야 합니다.

### 4. 등록 상태와 Expo 설정 확인

```bash
cd mobile

# EAS에 등록된 변수명과 환경 확인
npx eas-cli@latest env:list --environment preview

# 로컬 .env 값을 반영한 Expo 공개 설정 확인
npx expo config --type public
```

명령 출력이나 스크린샷에는 비밀값을 공유하지 않습니다.

### 5. 네이티브 설정 변경이면 새 빌드

`app.config.ts`의 iOS/Android 설정, Google OAuth 값, 플러그인 설정처럼 네이티브 번들에 들어가는 환경 변수는 OTA 업데이트만으로 반영되지 않습니다. EAS 빌드를 새로 만든 뒤 앱을 다시 설치합니다.

```bash
cd mobile
npx eas-cli@latest build --platform ios --profile preview --non-interactive
```

Android도 같은 방식으로 `--platform android` 또는 `--platform all`을 사용합니다.

## 가족 초대 링크 설정

가족 초대는 `https://<invite-domain>/invite?invite_code=<코드>`를 공유합니다. 앱이 설치되어 있으면 iOS Universal Link 또는 Android App Link로 가입 화면을 열고 가족 코드를 자동 입력합니다. 앱이 설치되지 않은 경우에는 같은 웹 주소의 `/invite` 화면에서 앱 열기, 스토어 이동, 코드 확인을 제공합니다.

`EXPO_PUBLIC_INVITE_BASE_URL`은 반드시 공개 HTTPS 주소를 사용합니다. 예를 들어 `https://invite.example.com`을 입력하면 앱 설정에 `applinks:invite.example.com`과 Android `https://invite.example.com/invite` intent filter가 포함됩니다. 이 값은 로컬 `.env`와 실제 빌드할 EAS 환경 모두에 등록한 뒤 새 iOS/Android 빌드를 만들어야 합니다.

도메인 서버에도 아래 두 검증 파일을 HTTPS로 공개해야 합니다.

- `https://<invite-domain>/.well-known/apple-app-site-association`: iOS Team ID와 `com.ilog.mobile`, `/invite*` 경로를 포함합니다.
- `https://<invite-domain>/.well-known/assetlinks.json`: Android package `com.ilog.mobile`와 EAS keystore의 SHA-256 지문을 포함합니다.

`apple-app-site-association` 예시입니다. `<APPLE_TEAM_ID>`는 Apple Developer Team ID로 바꿉니다.

```json
{
  "applinks": {
    "details": [
      {
        "appID": "<APPLE_TEAM_ID>.com.ilog.mobile",
        "paths": ["/invite*"]
      }
    ]
  }
}
```

`assetlinks.json` 예시입니다. `<EAS_ANDROID_SHA256>`에는 `npx eas-cli@latest credentials -p android`에서 확인한 현재 keystore SHA-256 지문을 넣습니다.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.ilog.mobile",
      "sha256_cert_fingerprints": ["<EAS_ANDROID_SHA256>"]
    }
  }
]
```

Apple은 앱 설치 전 링크의 쿼리 값을 설치 후 자동으로 복원하지 않습니다. iOS에서 처음 설치한 경우에는 초대 페이지의 `앱에서 열기`를 다시 누르거나 복사한 가족 초대 코드를 가입 화면에 붙여 넣어야 합니다. 설치 이후에는 같은 초대 링크를 열면 코드가 자동 적용됩니다.

## Google 로그인 추가 점검

- iOS OAuth 클라이언트: Bundle ID `com.ilog.mobile`, Apple Team ID를 Google Cloud Console에 등록합니다.
- Android OAuth 클라이언트: Package `com.ilog.mobile`와 실제 서명 SHA-1을 Google Cloud Console에 등록합니다.
- Android OAuth 클라이언트 ID는 현재 앱 설정에 별도 환경 변수로 넣지 않습니다. Android 네이티브 앱 식별과 서명 SHA-1으로 Google이 앱을 확인합니다.
- Supabase Google provider에는 웹 OAuth 클라이언트 ID와 client secret을 Supabase Dashboard에서 설정합니다. client secret은 앱/EAS 공개 환경에 넣지 않습니다.

## 배포 전 체크리스트

- [ ] 새 공개 변수는 `mobile/.env`에 추가했다.
- [ ] 실제로 빌드할 모든 EAS 환경에 같은 공개 변수를 추가했다.
- [ ] `npx eas-cli@latest env:list --environment <environment>`로 변수명을 확인했다.
- [ ] `npx expo config --type public`으로 로컬 앱 설정을 확인했다.
- [ ] 비밀값이 `EXPO_PUBLIC_*`, Git, 로그, 스크린샷에 포함되지 않았다.
- [ ] Apple 로그인을 제공한다면 자동 해지용 Apple Edge secrets 4개와 revoke worker 배포 상태를 확인했다.
- [ ] 네이티브 설정을 바꿨다면 새 EAS 빌드를 만들었다.
