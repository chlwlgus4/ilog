# Mobile Distribution

## 현재 기준

| 항목 | 값 |
| --- | --- |
| 앱 이름 | `아이로그` |
| Expo slug | `ilog` |
| Scheme | `ilog` |
| iOS Bundle ID | `com.ilog.mobile` |
| Android Package | `com.ilog.mobile` |
| 기본 웹 검증 포트 | `19006` |

## 로컬 실행

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run start
```

웹 검증:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run web -- --port 19006
```

## Expo Go와 개발 빌드

- `expo start`에서 `Using development build`가 보이면 QR은 Expo Go가 아니라 개발 빌드용입니다.
- Expo Go로 전환하려면 터미널에서 `s`를 눌러 Expo Go 모드로 바꿉니다.
- 개발 빌드 출력 예시의 `exp+ilog://expo-development-client/?url=...` 값은 Metro 연결 주소이며 OAuth redirect URL이 아닙니다.
- OAuth callback은 앱 scheme 기준 `ilog://auth/callback`입니다.

## Supabase Redirect URL

Supabase Dashboard의 `Authentication > URL Configuration > Redirect URLs`에 아래 값을 둡니다.

```text
ilog://auth/callback
http://localhost:19006/auth/callback
http://127.0.0.1:19006/auth/callback
```

Metro가 `8081`로 뜬 웹/dev 테스트에서는 필요 시 아래를 추가합니다.

```text
http://localhost:8081/auth/callback
http://127.0.0.1:8081/auth/callback
```

Expo Go 테스트에서는 실행 중 표시된 IP를 사용합니다.

```text
exp://192.168.x.x:8081/--/auth/callback
```

## Google OAuth

Google Cloud Console의 웹 클라이언트에는 Supabase callback만 redirect URI로 둡니다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

승인된 JavaScript 원본에는 테스트 중인 웹 origin을 추가합니다.

```text
http://localhost:19006
http://127.0.0.1:19006
http://localhost:8081
http://127.0.0.1:8081
```

## EAS 빌드 전 확인

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run typecheck
```

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss
& "C:\Program Files\Git\bin\bash.exe" scripts/run_playwright_smoke.sh
```

EAS 원격 빌드는 로컬 `mobile/.env`를 자동으로 읽지 않습니다. Supabase 공개 연결값과 Google 로그인 공개 설정처럼 빌드에 쓰는 모든 `EXPO_PUBLIC_*` 값은 실제 빌드 환경(`development`, `preview`, `production`)에 별도로 등록합니다. 비밀값은 등록하지 않으며, 전체 절차는 [ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md)를 따릅니다.

## 가족 초대 링크

- 초대 화면은 가족 초대 링크와 코드를 복사하는 방식입니다.
- `EXPO_PUBLIC_INVITE_BASE_URL`을 HTTPS로 설정하면 `https://<domain>/invite?invite_code=...` 링크를 공유합니다.
- iOS Universal Link와 Android App Link 검증 파일, App Store/Google Play URL 설정은 [ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md#가족-초대-링크-설정)를 따릅니다.
- 이 링크 관련 설정을 바꾼 뒤에는 OTA 업데이트가 아니라 새 EAS iOS/Android 빌드가 필요합니다.

## 스토어 제출 전

- 앱 이름과 아이콘이 `아이로그` 기준인지 확인
- iOS/Android 식별자가 스토어 콘솔과 일치하는지 확인
- 개인정보 처리방침 URL, 이용약관 URL, 지원 URL 준비
- Google 로그인 심사 정보를 준비
- 실제 기기에서 이메일 로그인, Google 로그인, 아이 정보 입력, 기록 저장, 댓글/대댓글, 알림 토큰 등록을 확인
