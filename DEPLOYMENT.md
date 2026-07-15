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

## 필수 환경 변수

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

`service_role`, DB 비밀번호, Supabase access token은 모바일 앱에 넣지 않습니다.

## Supabase 필수 설정

- 최신 migration 적용
- RLS enabled
- `anon` 직접 테이블 접근 차단
- `authenticated` role에 필요한 select/insert/update/RPC 권한만 부여
- Auth redirect URL 등록:
  - `ilog://auth/callback`
  - `http://localhost:19006/auth/callback`
  - `http://127.0.0.1:19006/auth/callback`
  - 개발 빌드/Expo Go 테스트 시 실제 Metro URL에 맞춘 callback
- Google OAuth redirect URI:
  - `https://<project-ref>.supabase.co/auth/v1/callback`

## 배포 전 게이트

1. `npm run typecheck`
2. `node --check scripts/playwright_smoke_flow.js`
3. `git diff --check`
4. `scripts/run_playwright_smoke.sh`
5. 실제 기기에서 로그인, Google 로그인, 아이 정보 입력, 기록 저장, 타임라인 댓글, 로그아웃 확인
6. Supabase Dashboard에서 redirect URL, Google provider, anon key, RLS 상태 확인

## 롤백 기준

- 앱 배포는 즉시 롤백이 어렵기 때문에 Supabase RPC와 schema는 하위 호환을 우선합니다.
- RLS/grant 변경은 배포 직후 demo 계정과 비회원 접근으로 검증합니다.
- 데이터 삭제/내보내기/Storage 정책 변경은 rollback SQL 또는 비활성화 경로를 함께 준비합니다.
