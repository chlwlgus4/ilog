# 환경 변수 운영 기준

이 문서는 아이로그의 환경 변수 전달 경로와 추가 절차의 기준 문서입니다. 실제 값, 토큰, 비밀번호는 문서나 Git에 저장하지 않습니다.

## 핵심 원칙

- `mobile/.env`는 로컬 개발용 파일입니다. EAS 서버는 이 파일을 자동으로 업로드하거나 읽지 않습니다.
- 앱 빌드에 필요한 공개 환경 변수는 로컬 `mobile/.env`와 실제로 빌드할 EAS 환경에 모두 등록합니다.
- `EXPO_PUBLIC_` 접두사가 붙은 값은 앱 번들에서 확인될 수 있습니다. URL, 공개 키, OAuth 클라이언트 ID처럼 공개되어도 되는 값만 사용합니다.
- Supabase 앱 연결값도 같은 규칙을 따릅니다. `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`는 로컬 `.env`와 EAS 환경에 모두 필요합니다.
- 비밀번호, access token, OAuth client secret, service role key는 앱 번들 또는 `EXPO_PUBLIC_*` 변수에 넣지 않습니다.

## 전달 경로

| 구분 | 로컬 개발 | EAS 원격 빌드 | 외부 서비스 설정 |
| --- | --- | --- | --- |
| 공개 모바일 설정 | `mobile/.env` | 빌드에 사용하는 EAS 환경 | 필요 없음 |
| Supabase URL / anon key | `mobile/.env` | 빌드에 사용하는 EAS 환경 | Supabase 프로젝트에서 발급 |
| Google OAuth 클라이언트 ID | `mobile/.env` | 빌드에 사용하는 EAS 환경 | Google Cloud Console에서 발급 |
| 가족 초대 링크 / 스토어 URL | `mobile/.env` | 빌드에 사용하는 EAS 환경 | 초대 웹 도메인, App Store, Google Play에서 준비 |
| Supabase Google provider secret | 넣지 않음 | 넣지 않음 | Supabase Dashboard의 Google provider 설정 |
| Supabase CLI 배포 자격 증명 | 로컬 셸 또는 안전한 CI secret | 모바일 EAS 환경에 넣지 않음 | Supabase CLI / CI에서만 사용 |

## 현재 공개 모바일 환경 변수

아래 값은 `mobile/app.config.ts`가 Expo 앱 설정으로 전달합니다. 새 iOS/Android EAS 빌드를 만들 때 해당 환경에 없으면 빌드 결과에 반영되지 않습니다.

| 변수 | 용도 | EAS 등록 |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 필요 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 앱 공개 키 | 필요 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google 인증 서버 클라이언트 ID | Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS Google OAuth 클라이언트 ID | iOS Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | iOS Google 로그인 콜백 URL scheme | iOS Google 로그인 사용 시 필요 |
| `EXPO_PUBLIC_INVITE_BASE_URL` | HTTPS 가족 초대 웹 주소. `/invite?invite_code=...` 링크의 기준 주소 | 가족 초대 링크 사용 시 필요 |
| `EXPO_PUBLIC_IOS_APP_STORE_URL` | 초대 페이지의 App Store 이동 URL | iOS 스토어 배포 시 필요 |
| `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL` | 초대 페이지의 Google Play 이동 URL | Android 스토어 배포 시 필요 |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS 프로젝트 ID 오버라이드 | 선택. 현재 `app.config.ts`에 기본값이 있음 |

### Supabase 관련 비밀값

`SUPABASE_ACCESS_TOKEN`과 `SUPABASE_DB_PASSWORD`는 `npx supabase db push`, Edge Function 배포 같은 로컬 또는 CI 작업용입니다. 앱 런타임에서 읽지 않으며 모바일 EAS 환경에 등록하지 않습니다. CI에서 Supabase 배포를 자동화할 때만 CI의 secret 저장소에 별도로 등록합니다.

`service_role` 키와 Supabase Google provider의 client secret도 같은 이유로 모바일 앱 또는 EAS 공개 환경에 넣지 않습니다.

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

npx eas-cli@latest env:create preview \
  --name EXPO_PUBLIC_EXAMPLE_VALUE \
  --value "your-public-value" \
  --visibility plaintext \
  --force \
  --non-interactive
```

`--force`는 이미 존재하는 값을 갱신합니다. `development`나 `production`도 빌드한다면 해당 환경에 각각 같은 명령으로 등록합니다.

```bash
npx eas-cli@latest env:create development --name EXPO_PUBLIC_EXAMPLE_VALUE --value "your-public-value" --visibility plaintext --force --non-interactive
npx eas-cli@latest env:create production --name EXPO_PUBLIC_EXAMPLE_VALUE --value "your-public-value" --visibility plaintext --force --non-interactive
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
- [ ] 네이티브 설정을 바꿨다면 새 EAS 빌드를 만들었다.
