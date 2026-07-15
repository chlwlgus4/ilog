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

EAS 환경 변수에는 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_EAS_PROJECT_ID`만 공개값으로 넣습니다.

## 스토어 제출 전

- 앱 이름과 아이콘이 `아이로그` 기준인지 확인
- iOS/Android 식별자가 스토어 콘솔과 일치하는지 확인
- 개인정보 처리방침 URL, 이용약관 URL, 지원 URL 준비
- Google 로그인 심사 정보를 준비
- 실제 기기에서 이메일 로그인, Google 로그인, 아이 정보 입력, 기록 저장, 댓글/대댓글, 알림 토큰 등록을 확인
