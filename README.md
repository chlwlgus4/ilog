# 아이로그

아이로그는 가족이 함께 아이의 하루를 기록하고 확인하는 Expo 기반 육아 기록 앱입니다. 현재 저장소 기준 구조는 `Expo Router 모바일 앱 + Supabase Auth/Postgres/RPC`입니다.

## 현재 앱 범위

- 홈
  - 아이 프로필 이미지, 이름, 생후 D-day
  - 오늘 한눈에 보기: 수유, 수면, 배변, 체온 요약
  - 최근 기록은 실제 기록이 없으면 empty 상태를 표시
- 기록
  - 수유, 수면, 배변, 체온, 약/영양제, 유축, 성장, 예방접종, 병원 방문, 메모 등록
  - 날짜/시간 입력은 공통 DatePicker 오버레이 사용
  - 기록 등록 후 대시보드와 타임라인 갱신
  - 각 기록 카테고리별 다음 기록 알림 주기와 알림 대상 설정
- 타임라인
  - 기본 조회일은 오늘
  - 날짜 이동, 날짜 선택, 카테고리 필터, 검색
  - 최신순 정렬
  - 기록별 댓글과 대댓글
  - 댓글/대댓글 작성 시 관련 보호자에게 푸시 알림 이벤트 생성
  - 하단 네비게이션 위 고정 메모 작성 영역
- 통계
  - 일간, 주간, 월간 기간 전환
  - 수유, 수면, 배변, 체온, 약/영양제, 유축, 성장, 예방접종, 병원 방문 상세 통계 화면
  - 현재 기록이 없으면 샘플 수치 대신 empty/0 상태 표시
- 설정
  - 내 프로필 이름과 이미지 수정
  - 아이 정보와 아이 프로필 이미지 수정
  - 가족 초대: 이메일, 연락처, 관계, 메모 입력
  - 사진 앨범, 알림 설정, 개인정보 설정, 앱 정보
  - 이용약관, 개인정보 처리방침, 오픈소스 라이선스 화면
- 디자인
  - 메인 컬러는 성별에 치우치지 않는 세이지 민트 계열
  - 현재 적용 중심 색상: `#4DB6AC`, `#2F8F88`, `#E7F6F3`, `#DDE7E2`, `#F8FAF7`

## 인증 방식

- 로그인 입력값은 `이메일 + 비밀번호`입니다.
- 회원가입 시 보호자 정보를 먼저 입력합니다.
- 가족 초대 코드가 있으면 회원가입 또는 Google 로그인 시 해당 가족에 연결합니다.
- 로그인 후 아이 정보가 없으면 전체 화면 아이 정보 입력 모달을 먼저 표시합니다.
- Google 로그인은 Supabase Auth OAuth 흐름을 사용합니다.
- 모바일 API 요청은 Supabase 세션을 기준으로 실행합니다.
- 현재 이메일/비밀번호 가입과 로그인을 위한 RPC는 Supabase Auth 세션 위에서 `caregivers` row를 연결합니다.

## 프로젝트 구조

```text
babyboss/
  mobile/                  Expo Router 앱
  mobile/app/              파일 기반 route 엔트리
  mobile/src/features/     auth, dashboard, settings 등 화면 컴포넌트
  mobile/src/screens/      route 단위 화면 조합
  mobile/src/serverless/   Supabase API 어댑터
  supabase/                Supabase migration
  scripts/                 Playwright smoke 실행 스크립트
  docs/                    제품/설계/검증 문서
```

## 주요 기술

- Expo SDK 55
- Expo Router
- React Native 0.83
- React 19
- React Native Web
- Supabase JS v2
- Expo Notifications
- React Native Gifted Charts
- React Native SVG
- Pretendard 폰트

## 환경 변수

`mobile/.env`에 앱 실행에 필요한 공개 Supabase 값을 설정합니다.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

주의:

- `service_role` 키, DB 비밀번호, Supabase access token 같은 비밀값은 모바일 공개 환경 변수에 넣지 않습니다.
- `EXPO_PUBLIC_*` 값은 앱 번들에 포함될 수 있습니다.
- 원격 DB 스키마 작업용 토큰이나 비밀번호는 로컬 작업 환경에서만 사용합니다.

## 실행

설치:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm install
```

개발 서버:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run start
```

웹 미리보기:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run web -- --port 19006
```

Node.js는 `mobile/package.json` 기준 `24.14.x` 계열을 사용합니다.

## 검증

타입 체크:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss\mobile
npm run typecheck
```

Playwright smoke:

```powershell
cd C:\Users\jihyun\IdeaProjects\babyboss
& "C:\Program Files\Git\bin\bash.exe" scripts/run_playwright_smoke.sh
```

기본 smoke 대상:

- 서버 URL: `http://127.0.0.1:19006`
- 산출물: `output/playwright/smoke/`

## Supabase

`supabase/migrations/`는 현재 앱이 기대하는 DB 구조, RLS, RPC, 알림 관련 테이블을 담고 있습니다.

주요 원칙:

- 앱은 Supabase Auth의 `auth.uid()`를 기준으로 가족/보호자 접근 권한을 확인합니다.
- 클라이언트에서 직접 테이블을 쓰는 대신, 중요한 쓰기 작업은 검증 RPC를 우선 사용합니다.
- 새 Supabase 프로젝트를 만들 때는 baseline migration과 이후 migration을 순서대로 검토합니다.
- 이미 migration history가 있는 원격 프로젝트에 baseline을 중복 적용하지 않습니다.

## 문서

- 작업 규칙: `AGENTS.md`
- 시스템 구조: `ARCHITECTURE.md`
- 프런트엔드 구조: `FRONTEND.md`
- 디자인 기준: `DESIGN.md`
- 환경 변수: `ENVIRONMENT_MATRIX.md`
- 배포 기준: `DEPLOYMENT.md`
- 릴리스 체크리스트: `RELEASE_CHECKLIST.md`
- 스토어 제출 준비: `STORE_SUBMISSION.md`
- Playwright smoke 설명: `docs/references/playwright-smoke.md`
- Supabase 메모: `supabase/README.md`
