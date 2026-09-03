# 아이로그 정식 서비스 출시 체크리스트

작성 기준일: 2026-09-03
대상 앱: 아이로그 (`com.ilog.mobile`)
대상 플랫폼: iOS, Android
초기 출시 권장 범위: 대한민국, 보호자용 육아 기록 서비스

## 1. 현재 출시 판정

현재 단계는 **현재 소스의 자동·웹·분리 DB 검증 통과**, **현재 소스 production 빌드 및 공개 스토어 출시 보류**입니다.

기본 기능과 자동화 테스트를 갖췄고, 개인 탈퇴·가족 삭제 예약·Apple token 자동 해지·Storage 정리 worker와 8개 migration은 2026-09-02 운영 반영 확인 기록이 있습니다. 2026-09-03에는 신고·차단·게시 전 필터, 운영 점검 도구와 추가 migration 2개를 구현·분리 검증했습니다. 이번 신규 migration·푸시 함수의 운영 배포는 승인 대기입니다. 최신 소스는 기존 IPA/AAB보다 최신이며, 새 production 빌드, 공개 웹 재배포, Android/iOS 실기기 검증과 실제 신고 운영 체계를 갖춘 뒤 공개 심사를 신청합니다.

### 현재 확인된 상태

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 단위 테스트 | 통과 | 2026-09-03 기준 212개 통과. 안전 설정 adapter 10개와 실제 runtime 계정 전환 경쟁 3개 포함 |
| TypeScript 검사 | 통과 | `npm run typecheck` |
| Expo Doctor | 통과 | 2026-09-03 기준 20개 전체 통과, `expo install --check`에서 권장 버전 일치 |
| npm 운영 의존성 감사 | 중간 위험도 추적 필요 | 2026-09-03 기준 critical 0건, high 0건, moderate 17건. Metro 0.83.8 호환 패치로 `image-size` 경로 제거 |
| iOS 배포 | 현재 소스 재빌드 필요 | 2026-07-24 production IPA는 성공했지만 2026-09-02 보완 사항이 포함되지 않음. 새 TestFlight 빌드와 신규 설치·업데이트 검증 필요 |
| Android 배포 | 현재 소스 재빌드 필요 | 2026-07-24 release AAB는 성공했지만 2026-09-02 보완 사항이 포함되지 않음. 새 내부 테스트 빌드와 Galaxy 실기기 검증 필요 |
| 운영 이메일 인증 | 완료 | Resend SMTP, 한국어 템플릿, 가입 확인 및 비밀번호 재설정 메일 수신과 앱 복귀 확인 완료 |
| 공개 웹페이지 | 재배포 필요 | Netlify `ilog-public`의 기존 5개 URL과 TLS는 확인했지만, 2026-09-02 약관·삭제 정책·지원 SLA 변경 소스는 아직 공개 도메인에 재배포하지 않음 |
| Universal Link/App Link 검증 파일 | 배포 확인 | `apple-app-site-association`, `assetlinks.json`이 HTTPS `application/json`으로 응답함. 실제 iOS/Android 링크 연결 동작은 미검증 |
| Supabase 보안 Advisor | 보완 필요 | 앱에서 의도적으로 호출하는 `SECURITY DEFINER` RPC와 `pg_net` 위치 경고를 제외하고, 권한 검토를 진행 중 |
| Supabase migration 이력 | 기존 8개 완료, 신규 2개 운영 대기 | 기존 삭제 관련 8개와 worker는 2026-09-02 검증 기록 기준 완료. 새 `20260902232214`, `20260902232320`은 분리 DB 전체 chain 검증 완료, 운영 승인 대기 |
| 정식 약관 및 개인정보 처리방침 | 앱·migration 소스 반영, 운영·공개 웹 대기 | 2026-09-03 신고·차단·보유 기간 문구와 재동의 흐름 추가. 새 migration 적용, 공개 웹 재배포, 국외 처리 고지의 법률·계약 최종 검토가 남음 |

## 2. 작업 우선순위

| 우선순위 | 의미 | 출시 판단 |
| --- | --- | --- |
| P0 | 심사, 보안, 개인정보, 핵심 사용 흐름에 직접 영향 | 하나라도 남으면 출시 보류 |
| P1 | 장애 대응과 서비스 품질에 영향 | 베타 종료 전 완료 권장 |
| P2 | 출시 범위 확장 및 편의 기능 | 첫 공개 출시 후 진행 가능 |

## 3. P0 - 공개 출시 전 반드시 해결

### P0-1. 인증 체계 정비

- [x] 이메일 회원가입과 로그인을 Supabase Auth 표준 흐름으로 통합
- [x] 가입 이메일 확인 콜백과 보호자 연결 흐름 구현
- [x] 비밀번호 재설정 메일과 앱 복귀 딥링크 구현
- [x] Google 로그인과 동일한 이메일은 Supabase Auth 자동 identity linking 및 보호자 이메일 유일성으로 한 계정에 연결
- [x] Apple 로그인 실제 구현 및 iOS 로그인·로그아웃 검증
  - 2026-07-29 사용자가 iOS에서 Apple 로그인과 로그아웃을 직접 확인했습니다.
  - Google 로그인을 유지한 iOS 공개 심사 전에는 Apple Guideline 4.8과 Apple Developer 설정을 다시 점검합니다.
- [x] 클라이언트 반복 시도 제한과 CAPTCHA 적용
  - 로그인 반복 실패 제한은 현재 앱 실행 중에만 유지되는 보조 방어이며, 앱 재시작·재설치 또는 다른 기기에서는 초기화됩니다.
  - hCaptcha 검증을 적용했고, Supabase와 EAS production 환경에 site key를 등록했습니다.
  - 2026-07-24 최신 iOS IPA와 Android AAB production 빌드에 포함된 것을 확인했습니다.
- [x] Supabase Auth의 서버 측 로그인·비밀번호 재설정 rate limit을 운영 기준으로 확인하고 문서화
  - 2026-07-25 Dashboard 기준 이메일 발송은 시간당 30건, 가입·로그인은 IP당 5분 30회, 이메일 OTP·매직 링크 검증은 IP당 5분 30회, 토큰 갱신은 IP당 5분 150회입니다.
  - SMS, Web3, Anonymous user 제한은 첫 출시에서 사용하지 않는 인증 흐름입니다. 클라이언트 제한과 별개로 위 서버 측 제한이 적용됩니다.
  - 실제 한도 초과 응답은 운영 프로젝트가 아닌 별도 검증 프로젝트에서 확인합니다. 운영 서비스에서 의도적으로 한도를 소진하지 않습니다.
- [x] 네이티브 세션 저장소를 `AsyncStorage`에서 `expo-secure-store`로 변경
- [x] 기존 테스트 계정과 보호자 데이터 전환 절차 수립
- [x] Supabase 이메일 확인, redirect URL, SMTP 설정 적용
  - Resend 도메인 `Verified`, 한국어 이메일 템플릿, 실제 가입 확인 및 비밀번호 재설정 메일 수신과 앱 복귀를 확인했습니다.
- [ ] iOS와 Android 실기기에서 가입, 확인, 로그인, 재설정 검증
  - [x] iOS 실기기에서 이메일 가입, 확인, 로그인, 비밀번호 재설정을 확인했습니다.
  - [x] Android 에뮬레이터에서 앱 설치와 인증 흐름을 확인했습니다.
  - [ ] Android 실기기에서는 아직 검증하지 못했습니다. 공개 출시 전에는 실제 Android 기기에서 다시 확인합니다.

#### P0-1 배포 순서

신규 마이그레이션은 기존 `register_caregiver`, `login_caregiver_by_email` RPC 실행 권한을 닫으므로 **기존 앱이 배포된 상태에서 DB만 먼저 적용하면 로그인이 중단됩니다.** 아래 순서를 지킵니다.

1. Supabase Auth에서 이메일 확인을 활성화합니다.
2. Redirect URL 허용 목록에 `ilog://auth/email-confirmed`, `ilog://auth/reset-password`를 등록합니다.
3. 운영용 Custom SMTP와 인증 메일 템플릿을 설정합니다.
4. 새 앱 빌드를 내부 테스트 채널에 준비합니다.
5. `20260723043852_standard_email_auth_caregiver.sql`을 원격 DB에 적용합니다.
6. 기존 베타 사용자는 회원가입 화면에서 **기존과 같은 이메일**로 가입하고 이메일 확인을 완료합니다.
7. 확인된 이메일이 기존 `caregivers` 행을 안전하게 인계했는지 확인합니다.
8. 이메일 가입, 이메일 확인, 로그인, Google 동일 이메일 로그인, 비밀번호 재설정을 iOS와 Android에서 각각 검증합니다.

계정 연결 정책:

- 이메일/비밀번호와 Google이 같은 검증 이메일을 사용하면 Supabase Auth의 자동 identity linking을 사용합니다.
- `caregivers.email`은 대소문자를 무시하고 유일하며, 서버 함수는 `auth.users`에서 확인된 이메일만 신뢰합니다.
- Google 계정으로 먼저 가입한 사용자가 이메일 비밀번호도 사용하려면 로그인 상태에서 비밀번호를 추가하는 별도 UX를 후속 구현합니다. 가입 화면에서 같은 이메일로 다시 가입해도 확인 메일이 오지 않을 수 있습니다.
- 계정 열거 공격을 막기 위해 비밀번호 재설정 요청 결과는 가입 여부와 관계없이 같은 문구를 표시합니다.

완료 기준:

- 이메일, Google, Apple 계정으로 가입과 재로그인이 가능하며, iOS 공개 심사 전 Apple Guideline 4.8 대응을 다시 점검함
- 비밀번호를 잊은 사용자가 운영자 도움 없이 재설정할 수 있음
- 한 사람이 로그인 방법을 바꿔도 중복 보호자 계정이 생기지 않음
- 로그아웃 후 세션과 민감한 로컬 데이터가 정리됨

### P0-2. 계정 탈퇴 및 데이터 삭제

- [x] 앱 내부 `계정 탈퇴` 기능 구현
- [x] 외부 계정 삭제 요청 웹페이지 배포
  - [x] 로그인 없이 열리는 `/delete-account` 요청 안내와 이메일 요청 경로 구현
  - [x] `https://ilog.io.kr/delete-account`를 Netlify `ilog-public`에 HTTPS로 배포하고 HTTP 200을 확인
  - [ ] 공개 페이지의 이메일 요청을 실제로 발송하고 수신·처리 절차를 확인
- [x] 탈퇴 전 재인증 및 확인 절차 구현
- [x] 보호자 개인 탈퇴와 가족 전체 삭제의 차이를 화면에서 설명
- [x] 작성한 기록, 채팅, 사진, 푸시 토큰, 초대 정보의 삭제 범위 확정
- [x] Apple 계정 삭제 기준과 가족 공동 콘텐츠 보존 정책의 충돌 해소
  - 2026-09-02 앱은 v2 RPC로 탈퇴자의 작성·업로드 콘텐츠를 삭제하고, 타인의 답글 구조를 보존해야 하는 대화·댓글만 작성자와 내용을 비식별화합니다. 구형 beta는 화면과 일치하는 v1을 유지하지만, 새 정책 동의자는 서버에서 v1 호출이 거부됩니다.
- [ ] 법정 보관 대상이 있다면 항목과 기간을 개인정보 처리방침에 명시
- [x] 삭제 요청과 처리 결과를 감사 가능한 형태로 기록
- [x] 과거 `FAMILY_DELETED` 감사 metadata의 `family_name` 제거 migration 준비
- [ ] 과거 SQL `storage.objects` 삭제가 만든 물리 Storage orphan 여부를 운영 bucket inventory 또는 Supabase 지원 경로로 확인하고 발견 시 삭제
  - 메타데이터 행이 이미 삭제된 객체는 일반 Storage API 목록에 나타나지 않을 수 있으므로, 운영 DB를 수정하지 않는 inventory 점검이 필요합니다.
- [x] 탈퇴 전에 발급된 `family-media` signed URL 유효창 축소
  - signed URL을 최대 10분, 앱 사진 캐시를 최대 8분으로 줄였습니다. caregiver/RLS 접근은 즉시 끊기지만 이미 발급된 bearer URL은 만료 전 즉시 취소할 수 없다는 잔여 위험은 유지됩니다.

확정 정책:

- 개인 보호자 탈퇴: 2026-09-02 앱은 계정, 개인 프로필, 연락처, 기기 푸시 토큰과 본인이 작성·업로드한 기록, 사진, 대화, 댓글을 삭제합니다. 다른 보호자의 콘텐츠와 가족 공간은 유지하고, 답글 구조를 보존해야 하는 항목만 내용을 복원할 수 없게 가립니다.
- 구형 beta 호환: 구정책만 동의한 설치 앱은 v1의 공동 콘텐츠 유지 동작을 사용합니다. 새 정책 동의자는 v1 우회가 차단되며, 구형 beta 퇴출 뒤 v1 권한을 제거합니다.
- legacy 귀속: migration 전에 작성자를 수집하지 않은 일정과 작성자를 확인할 수 없는 자동 배정 작업은 가족 소유 데이터로 유지합니다.
- 가족 전체 삭제: 대표 보호자만 요청할 수 있으며 30일 뒤 가족 공간과 관련 콘텐츠를 영구 삭제한다. 30일 안에는 가족 삭제 예약을 취소할 수 있다.

완료 기준:

- 사용자가 앱과 외부 웹 경로 양쪽에서 삭제를 요청할 수 있음
- 탈퇴 후 해당 사용자가 다시 데이터에 접근할 수 없음
  - 새 API·앱 요청은 즉시 차단하고, 사전 발급 signed URL 유효창은 위 항목에서 별도로 해소 또는 위험 수용함
- 가족 구성원이 남아 있는 경우 공유 기록 처리 규칙이 문서와 실제 동작에서 일치함

### P0-3. 약관, 개인정보, 보호자 동의

- [x] 이용약관 초안을 정식 문서로 교체
  - 운영자 `초이(대표자: 최지현, 서비스명: 아이로그)`, 서비스 범위, 가족 공유, 탈퇴·삭제, 책임 제한과 문의 경로를 2026-09-02 문서 버전에 반영했습니다.
- [x] 개인정보 처리방침 초안을 정식 문서로 교체
  - 수집 항목, 처리 목적, 보유 기간, 가족 공유, 수탁자, 권리 행사와 보호 조치를 2026-09-02 문서 버전에 반영했습니다.
- [x] 무료 서비스 운영 기준의 사업자 정보 노출 원칙 확정
  - 서비스명은 아이로그, 운영자는 `초이(대표자: 최지현)`, 사업자등록번호는 `360-64-00637`으로 표시합니다. 고객지원과 개인정보 요청은 `ilog-support@ilog.io.kr`에서 받습니다.
  - 자택 주소와 개인 전화번호는 현재 무료 서비스의 공개 화면에 노출하지 않습니다. 유료 결제, 구독 또는 통신판매를 도입하기 전에는 표시·신고 의무를 별도로 검토합니다.
- [x] 고객지원 및 개인정보 보호 담당 연락처를 이메일로 확정
  - 고객지원과 개인정보 관련 요청은 `ilog-support@ilog.io.kr`로 접수합니다. 개인 전화번호는 공개하지 않습니다.
- [x] 개인정보 권리 행사 절차 명시
  - 열람, 수정, 삭제, 처리 정지 요청은 가입 이메일과 요청 내용을 함께 접수받아 본인 확인 후 처리합니다.
- [x] 보호자 정보와 아이 정보의 수집 항목, 목적, 보유 기간 명시
  - 개인정보 처리방침의 `2. 처리 목적`, `3. 처리하는 정보`, `5. 보유 및 이용 기간`에 반영했습니다.
- [x] 현재 사용하는 수탁자와 처리 목적을 개인정보 처리방침과 대조
  - 2026-07-30 Supabase 서울 리전, Apple·Google 로그인, Expo·Apple·Google 푸시, hCaptcha와 Resend Tokyo(ap-northeast-1) 메일 전송의 처리 목적을 실제 앱 설정과 대조해 개인정보 처리방침 `7. 개인정보 처리위탁 및 국외 처리`에 반영했습니다.
  - 앱은 푸시 전달을 위해 기기 토큰, 제목·본문과 화면 이동 데이터를 Expo에 보내며, 가입·로그인·비밀번호 재설정·계정 변경 및 삭제 요청에 hCaptcha 보안 확인을 사용합니다.
- [ ] 국외 처리 고지의 법률·계약 최종 검토
  - 공개 출시 전 제공업체별 실제 처리 국가, 이전 시점·방법, 보유 기간, 수탁자·연락처를 최신 계약·제공업체 정책과 법률 검토 결과 기준으로 확정해 문서에 반영합니다.
- [x] 가족 구성원에게 사진, 기록, 채팅이 공유된다는 점 명시
  - 개인정보 처리방침의 `6. 가족 구성원 간 공유`에 같은 가족 공간의 공유 범위를 반영했습니다.
- [x] 건강 관련 수치는 기록 및 참고용이며 진단이나 처방이 아니라는 점 명시
  - 개인정보 처리방침의 `10. 아동 정보`에 기록과 팁이 의료 진단, 처방 또는 전문 의료진의 조언을 대체하지 않는다는 점을 2026-07-28 버전으로 반영했습니다.
- [x] 가입 시 필수 동의와 선택 동의를 분리
  - 이용약관과 개인정보 처리방침은 필수 동의로 분리했고, 선택 동의는 현재 수집하지 않아 UI에 노출하지 않습니다.
- [x] 동의한 문서 종류, 버전, 시각을 데이터베이스에 저장
  - `caregiver_legal_consents`에 약관·개인정보 처리방침 버전과 동의 시각을 저장합니다.
- [x] 정책 변경 시 재동의 또는 변경 안내 절차 구현
  - 앱은 현재 문서 버전과 보호자의 동의 이력을 비교합니다. 새 버전이 배포되면 기존 보호자는 약관과 개인정보 처리방침을 각각 다시 확인하고 동의해야 앱을 계속 사용할 수 있습니다.

완료 기준:

- 앱 내부와 외부 HTTPS 페이지에서 동일한 최신 문서를 확인할 수 있음
- 앱의 실제 데이터 처리와 스토어 개인정보 선언이 문서 내용과 일치함
- 정책 문서에서 `초안`, `정식 운영 전` 같은 임시 문구가 모두 제거됨

주의:

- 최종 문서는 개인정보보호위원회 최신 작성지침을 기준으로 작성하고 법률 전문가 검토를 권장합니다.
- 아이가 앱 회원으로 가입하는 구조가 아니라 성인 보호자가 아이 정보를 관리하는 서비스로 대상 사용자를 명확히 합니다.

### P0-4. 공개 웹페이지와 딥링크

전체 웹서비스를 만들 필요는 없지만 다음 정적 HTTPS 페이지는 필요합니다.

- [x] `/privacy-policy` 개인정보 처리방침 route 구현
  - 정적 web export에서 `/privacy-policy` HTML이 생성되고, 브라우저에서 최신 한국어 문서가 열리는 것을 확인했습니다. `/privacy`는 로그인 후 개인정보 설정 화면이므로 공개 정책 URL로 사용하지 않습니다.
- [x] `/terms` 이용약관 route 구현
  - 정적 web export에서 `/terms` HTML이 생성되고, 브라우저에서 최신 한국어 문서가 열리는 것을 확인했습니다.
- [x] 정적 웹 export로 공개 route 산출물 생성
  - `mobile/app.config.ts`의 `web.output`을 `static`으로 설정했고, `npm run export:web`에서 약관·개인정보 처리방침·고객지원·계정 삭제·초대 route HTML과 각 `route/index.html` clean URL 산출물이 생성되는 것을 확인했습니다.
  - Netlify·Cloudflare Pages용 `_redirects` 규칙도 포함해 마지막 슬래시가 없는 공개 URL을 같은 route로 정규화합니다. 다른 호스팅은 동등한 301 설정이 필요합니다.
- [x] `/support` 고객지원 및 문의 경로 구현
  - `https://ilog.io.kr/support`를 Netlify `ilog-public`에 HTTPS로 배포하고 HTTP 200을 확인했습니다. 2026-07-26 재점검에서도 동일한 응답을 확인했습니다. 실제 운영 문의의 수신·응답 절차는 P1-3에서 확인합니다.
- [x] `/delete-account` 계정 삭제 요청 경로 구현
  - `https://ilog.io.kr/delete-account` HTTPS 배포와 HTTP 200은 확인했습니다. 2026-07-26 재점검에서도 동일한 응답을 확인했습니다. 실제 요청 발송·수신·처리 확인은 위 P0-2 미완료 항목으로 유지합니다.
- [x] `/invite` 가족 초대 랜딩 및 앱 설치 안내 route 구현
  - 초대 코드가 없는 접근도 안전한 안내 화면으로 처리하고, 코드가 있으면 앱 또는 스토어 안내 흐름을 사용합니다. 정적 HTML과 브라우저 쿼리 렌더링의 hydration 오류를 제거했고 Playwright에서 `?invite_code=BB-VERIFY` 코드 표시 및 콘솔 오류·경고 0건을 확인했습니다. `https://ilog.io.kr/invite` HTTPS 배포와 HTTP 200을 확인했고, 2026-07-26 재점검에서도 동일한 응답을 확인했습니다.
- [x] iOS `apple-app-site-association` 파일 준비
  - `mobile/public/.well-known/apple-app-site-association`에 Team ID `37A43S5GYQ`, `com.ilog.mobile`, `/invite` 경로를 등록했습니다. `https://ilog.io.kr/.well-known/apple-app-site-association`가 HTTPS `application/json`으로 응답함을 확인했고, 2026-07-26 재점검에서도 동일한 응답을 확인했습니다. 실제 iOS Universal Link 연결 동작은 미검증입니다.
- [x] Android `assetlinks.json` 파일 준비
  - `mobile/public/.well-known/assetlinks.json`에 현재 EAS Android release keystore SHA-256과 `com.ilog.mobile`을 등록했습니다. `https://ilog.io.kr/.well-known/assetlinks.json`이 HTTPS `application/json`으로 응답함을 확인했고, 2026-07-26 재점검에서도 동일한 응답을 확인했습니다. 실제 Android App Link 연결 동작은 미검증입니다.
- [ ] 앱 미설치 시 App Store 또는 Google Play로 이동하는 초대 흐름 구현
- [ ] EAS production 환경에 초대 및 스토어 URL 등록
  - [x] `EXPO_PUBLIC_INVITE_BASE_URL=https://ilog.io.kr`을 EAS development, preview, production 환경에 등록했습니다.
  - [x] 2026-09-02 EAS production에 `EXPO_PUBLIC_IOS_APP_STORE_URL`이 등록된 것을 값 노출 없이 확인했습니다.
  - [ ] `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL`은 EAS production에 아직 없습니다. Google Play 실제 공개 URL이 확정되면 등록합니다.

필요한 production 공개 환경 변수:

```env
EXPO_PUBLIC_INVITE_BASE_URL=https://your-domain.example
EXPO_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/app/id6792280701
EXPO_PUBLIC_ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.ilog.mobile
```

완료 기준:

- 카카오톡 등 외부 앱에서 초대 링크를 눌렀을 때 설치 여부에 맞는 화면으로 이동함
- 설치 후 초대 코드가 유지되며 가입 화면에 자동 적용됨
- 모든 정책 및 지원 URL이 로그인 없이 열림

### P0-5. Supabase migration 및 권한 정비

- [x] 원격 DB를 백업하고 격리된 로컬 환경에서 복구 가능 여부 확인
  - [x] 2026-07-28 운영 DB의 스키마·데이터·역할·마이그레이션 이력을 AES-256 암호화 백업으로 생성하고, 복호화 및 아카이브 체크섬 검증을 완료했습니다.
  - [x] 가족 사진·채팅 첨부파일이 있는 `family-media` Storage 버킷도 별도 AES-256 암호화 백업으로 생성하고, 모든 보관 객체의 체크섬 검증을 완료했습니다.
  - [x] 2026-07-29 실제 사용자 데이터가 포함된 암호화 백업을 운영 DB와 분리된 로컬 Docker 환경에 복구했습니다. DB와 `family-media` payload의 체크섬을 검증하고, 복구 직후 가족 A/B Storage 접근 격리까지 확인했습니다. 운영 DB에는 쓰기 작업을 하지 않았습니다.
- [x] 로컬 전용 및 원격 전용 migration 목록을 각각 검토하고 이력을 원격 스키마와 일치하도록 복구
  - 2026-07-28 운영 DB의 테이블·RPC·RLS·권한 카탈로그를 읽기 전용으로 확인해 로컬 전용 12개 기능이 이미 실제 스키마에 존재함을 확인했습니다.
  - 원격 전용 14개 버전은 동일 기능을 재실행하지 않는 역사 보존용 no-op migration 파일로 로컬에 추가했습니다.
  - 암호화 백업과 객체 검증 뒤에만 `migration repair --status applied`로 이미 반영된 로컬 전용 12개 버전의 **이력만** 보정했습니다. 운영 스키마, 데이터, RLS, 함수는 다시 적용하거나 변경하지 않았습니다.
  - `npx supabase migration list`에서 모든 로컬·원격 버전이 일치하고, `npx supabase db push --linked --dry-run`은 원격 DB가 최신이라고 확인했습니다.
- [x] 새로운 빈 로컬 Supabase 프로젝트에서 전체 migration 재현 테스트
  - 2026-07-29 로컬 Supabase를 초기화한 뒤 과거 이력 호환 fixture와 전체 migration을 적용했습니다. 가족 A/B RLS·Storage 격리 검사까지 통과했습니다.
- [x] 익명 인증이 필요한 범위와 종료 시점을 확정
  - 앱 코드에서 `signInAnonymously` 호출은 없으며, 첫 출시에서 익명 인증은 사용하지 않습니다. 2026-07-25 Supabase Dashboard에서 **Allow anonymous sign-ins**가 꺼진 것을 확인했습니다.
- [x] RLS 정책을 가족 A와 가족 B 격리 시나리오로 검증
  - 2026-07-29 `supabase/tests/family_rls_isolation.sql`로 다른 가족의 데이터와 `family-media` 객체를 조회·변경할 수 없는지 검증했습니다.
- [x] 현재 `SECURITY DEFINER` 함수의 외부 실행 필요 여부 1차 검토
  - 2026-07-24 원격의 `SECURITY DEFINER` 함수를 점검했습니다. 현재 앱이 호출하는 가족/보호자 검증 RPC는 `auth.uid()` 또는 `current_caregiver()`로 호출자를 확인하므로 유지합니다. 서버 전용 worker, 동의 helper, 구형 이메일·초대 RPC는 authenticated 실행 권한을 제거했습니다.
- [x] 내부 helper 함수의 클라이언트 실행 권한 회수
  - `20260728173000_restrict_pg_net_client_execution.sql`은 `net` 스키마 함수의 `PUBLIC`, `anon`, `authenticated` 실행 권한을 모두 회수합니다. 예약 작업과 서버 전용 경로는 소유자 권한으로만 유지합니다.
- [x] 동의 기록 helper 함수의 직접 실행 권한 회수
  - `record_current_caregiver_legal_consents`는 가입 완료 RPC에서만 호출되며, 인증 사용자가 직접 실행할 수 없습니다.
- [x] 모든 함수에 고정 `search_path` 적용
  - 2026-07-24 원격 `public` 함수 전체를 조회했고, 고정 `search_path`가 없는 함수는 0개입니다.
- [x] 보호자 테이블의 이전 인증 해시를 앱 클라이언트 조회·수정 권한에서 분리
  - 2026-07-24 운영 DB에서 `authenticated`의 넓은 `caregivers` 권한을 회수했습니다. 앱이 실제로 조회하는 공개 프로필 컬럼만 열 단위로 허용하며, `password_hash`와 `pin_hash`는 조회할 수 없습니다.
  - 프로필 직접 수정은 이름·프로필 사진으로 제한했고, 연락처·역할은 본인 확인 RPC, 비밀번호는 Supabase Auth 경로로만 변경합니다. 푸시 설정 RPC도 이전 인증 해시를 응답으로 반환하지 않도록 고정했습니다.
- [x] P0-5 로컬 권한 제어 자동 검증 통과
  - 2026-07-30 의도된 마이그레이션을 스테이징한 상태에서 `node scripts/verify_p0_5_local_controls.mjs`가 `13/13`을 통과했습니다. 실제 DB 복구와 다계정 RLS 검증은 2026-07-29 별도 격리 로컬 검증으로 통과했습니다.
- [ ] 유출 비밀번호 보호 기능 활성화 또는 Free 플랜 위험 수용 결정
  - 현재 Dashboard의 **Prevent use of leaked passwords**는 Supabase Pro 이상에서만 사용할 수 있어 Free 플랜에서는 활성화할 수 없습니다. 공개 출시 전 Pro 전환 또는 이 보호 기능 없이 출시하는 위험 수용 결정을 운영 기록에 남깁니다.
- [x] Storage의 사진 조회, 업로드, 삭제 정책 정적 검증
  - `family-media`는 인증 사용자만 접근하고, `photos/<familyId>/...` 및 `chat/<familyId>/...` 경로의 가족 ID를 현재 보호자 가족과 비교합니다. 사진 삭제는 같은 업로더의 `owner = auth.uid()`인 경우에만 허용합니다. 업로드는 매번 새 경로를 만들고 `upsert: false`를 사용합니다.
- [x] 서비스 역할 키가 앱 번들 및 공개 환경에 포함되지 않았는지 확인
  - 소스와 공개 환경 변수 사용처를 점검했습니다. 서비스 역할 키는 push 전송, Apple token 해지, 가족 Storage 삭제처럼 서버 권한이 필요한 Edge Function의 서버 환경 변수에서만 사용됩니다.
- [x] 내부 전용 테이블의 직접 앱 접근 차단 상태 읽기 전용 재점검
  - 2026-07-28 원격 권한·RLS 정책을 읽기 전용으로 확인했습니다. `account_deletion_audit`, `caregiver_legal_consents`, `export_jobs`는 RLS가 켜져 있고 일반 앱 역할에는 직접 테이블 권한이나 정책이 없습니다. 계정 삭제·동의·내보내기 보조 작업은 RPC 또는 서버 작업으로만 접근하는 구조를 유지합니다.

완료 기준:

- `npx supabase migration list`에서 로컬과 원격 이력이 일치함
- 보안 Advisor 경고가 0건이거나 승인된 예외 목록과 사유가 문서화됨
- 다른 가족 ID를 조작해도 기록, 사진, 채팅, 푸시 토큰을 조회하거나 변경할 수 없음
- 운영 DB를 백업에서 복구하는 절차를 실제로 한 번 검증함

#### P0-5 운영자 대시보드 작업

아래 두 항목은 SQL이나 EAS 빌드만으로 바뀌지 않습니다. Supabase Dashboard에서 적용해야 합니다.

1. [x] `Authentication > Sign In / Providers`에서 **Allow anonymous sign-ins**를 껐습니다. 앱은 익명 인증을 사용하지 않습니다.
2. [x] `Authentication > Sign In / Providers > Email`에서 **Confirm email**과 **Secure email change**를 켜고 최소 비밀번호 길이를 8자로 설정했습니다.
3. [ ] **Prevent use of leaked passwords**는 Supabase Pro 이상 전용입니다. Free 플랜 유지 시 활성화할 수 없으므로 출시 전 플랜 또는 위험 수용 결정을 확정합니다.
4. [x] `Authentication > Rate Limits`에서 이메일 발송 시간당 30건, 가입·로그인 IP당 5분 30회, 토큰 검증 IP당 5분 30회, 토큰 갱신 IP당 5분 150회를 확인했습니다.

적용 뒤에는 비회원으로 보호된 데이터에 접근할 수 없는지, 유출된 테스트 비밀번호가 가입 및 비밀번호 변경에서 거절되는지를 실제 앱에서 검증합니다.

#### P0-5 migration 정합화 결과와 이후 원칙

- 2026-07-28 운영 이력 정합화는 암호화 백업과 원격 객체 확인 뒤, 이미 반영된 사실이 증명된 버전에 한해 `migration repair`로 **메타데이터만** 보정했습니다.
- 원격에만 있던 14개 과거 버전은 스키마를 재실행하지 않는 no-op 이력 파일로 보존했습니다. 생성 시각이나 이름만으로 대응시키지 않고, 실제 테이블·RPC·RLS·권한 상태를 먼저 확인했습니다.
- 정합화 직후 `npx supabase migration list`의 로컬·원격 버전 일치와 `npx supabase db push --linked --dry-run`의 최신 상태를 확인했습니다.
- 앞으로의 migration은 로컬 SQL 파일 작성, 검토·커밋, 검증용 프로젝트 적용, 운영 적용 순서를 지킵니다. 운영 Dashboard의 임의 SQL 또는 확인 없는 `db pull`로 이력을 바꾸지 않습니다.

#### P0-5 Security Advisor 승인 예외와 후속 조치

2026-07-24에 원격 Advisor와 함수 실행 권한을 다시 조회했습니다. 아래 항목은 이유 없이 무시하지 않으며, 공개 출시 전 각 후속 조치를 완료합니다.

| Advisor 항목 | 현재 판정 | 근거 | 출시 전 남은 조치 |
| --- | --- | --- | --- |
| `rls_enabled_no_policy`의 `account_deletion_audit`, `caregiver_legal_consents`, `export_jobs` | 승인된 내부 전용 경고 | 세 테이블은 RLS가 켜져 있고 anon/authenticated의 직접 테이블 접근 권한과 정책이 없다. 계정 삭제·동의·내보내기 보조 함수 또는 서버 작업만 접근한다. | 원격 권한 조회를 배포 직전에 다시 실행하고, 직접 `select`가 anon/authenticated에서 실패하는지 확인 |
| `extension_in_public`의 `pg_net` | 보완 필요 | 기록 리마인더 푸시 작업이 예약 실행을 위해 `pg_net`을 사용한다. 앱 클라이언트에는 실행 권한이 없다. | Supabase가 지원하는 비공개 schema 이전 방법을 별도 검증 프로젝트에서 확인한 뒤 이전하거나, 지원되지 않으면 위험 수용 사유와 접근 제어를 운영 기록에 남김 |
| `authenticated_security_definer_function_executable` | 승인된 앱 API 경고 | 앱은 기록 생성·수정·삭제, 가족 초대, 채팅, 푸시 토큰, 탈퇴, 동의 처리용 RPC를 호출한다. 해당 함수는 `auth.uid()` 또는 `current_caregiver()`로 호출자와 가족 소속을 확인하고, anon 실행 권한은 회수되어 있다. | 가족 A/B 실제 계정으로 다른 가족 ID를 전달한 호출이 거부되는지 검증하고, 새 RPC 추가 시 anon revoke·authenticated 최소 grant·고정 `search_path`를 검토 |
| `auth_allow_anonymous_sign_ins` | Dashboard 설정 완료 | 앱 코드에는 익명 로그인 호출이 없으며 2026-07-25에 **Allow anonymous sign-ins**가 꺼진 것을 확인했다. | 별도 검증 프로젝트에서 비회원 세션 생성과 보호된 API 접근이 거부되는지 확인 |
| `auth_leaked_password_protection` | 플랜 결정 대기 | Dashboard의 **Prevent use of leaked passwords**는 Pro 이상 전용이며 현재 Free 플랜에서는 켤 수 없다. | Pro 전환 시 활성화와 알려진 유출 테스트 비밀번호 거부를 검증하거나, Free 플랜으로 출시할 경우 위험 수용 사유와 비밀번호 정책을 운영 기록에 남김 |

앱 클라이언트가 직접 호출하는 RPC는 31개이며, 다음 범주만 `authenticated` 실행을 유지합니다.

- 인증 완료 및 최신 약관 동의: 이메일·Google 가입 완료, 동의 상태 조회 및 저장
- 가족 기록: 기록·성장·병원·예방접종·일정·할 일 생성 및 기록 수정·삭제
- 가족 협업: 초대 생성, 가족 채팅 전송, 채팅 접속 상태 갱신
- 개인 설정: 프로필, 푸시 환경설정·토큰, 기록 알림 규칙
- 탈퇴: 개인 탈퇴 요청, 가족 삭제 예약 및 취소

`enqueue_due_record_alarm_pushes`, `purge_due_family_deletions`, `claim_pending_push_notification_events`, 구형 가입·로그인·초대 RPC, 동의 기록 보조 함수는 일반 앱 사용자가 직접 실행할 수 없도록 유지합니다.

### P0-6. 미완성 또는 오해를 주는 기능 정리

- [x] Google Drive 백업을 실제 구현하거나 첫 출시에서 메뉴 제거
  - 실제 Google Drive 연동이 없어 첫 출시 화면과 라우트에서 제거했습니다.
- [x] 데이터 내보내기를 실제 파일 생성 및 다운로드까지 구현하거나 메뉴 제거
  - 파일 생성과 다운로드가 아직 없으므로 첫 출시 화면과 라우트에서 제거했습니다.
- [x] 고정된 최근 백업 날짜 제거
- [x] 동작하지 않는 버튼과 임시 화면 전체 점검
  - 2026-07-24 활성 라우트의 메뉴·탭·`Pressable`을 정적 점검했습니다. 고객지원 메뉴는 실제 `/support` 경로와 메일 작성으로 연결했고, 구현되지 않은 가족 나가기·성장 측정/기간 탭·예방접종 예정/완료 탭·백업/내보내기 화면은 제거하거나 탭 가능한 UI로 보이지 않게 정리했습니다.
  - `npm test` 83개, TypeScript 검사, 정적 web export 65개 route와 Playwright 고객지원 화면 검증을 통과했습니다. 로그인 후 네이티브 핵심 흐름은 P0-8 실기기 시나리오에서 별도로 검증합니다.
- [x] 샘플 및 목 데이터가 운영 빌드에 나타나지 않는지 정적 점검
  - 앱 화면 코드에서 샘플·목 데이터 및 고정 백업 데이터를 검색했고, 실제 API 응답 기반으로만 표시되는 것을 확인했습니다.
- [x] iPad를 지원할지 결정: 첫 출시에서는 미지원, 추후 지원 예정
- [x] iPad를 지원하지 않으면 `supportsTablet: false`로 변경
- [ ] 지원한다면 iPad 실기기 또는 Simulator UI와 스크린샷 검증

완료 기준:

- 사용자가 누를 수 있는 모든 버튼이 완료, 취소, 오류 상태를 포함해 실제로 동작함
- 준비되지 않은 기능은 사용자와 스토어 심사자에게 노출되지 않음

### P0-7. 앱 안정성 및 의존성 정리

- [x] `npx expo install --check`로 Expo SDK 55 호환 패치 버전 검토
  - 2026-09-02 `npx expo install --check`에서 현재 의존성이 권장 버전과 일치함을 확인했고, `npx expo-doctor` 20개 점검을 모두 통과했습니다.
- [x] SDK 55 권장 패치 버전으로 업데이트
  - Expo `55.0.31`, React Native `0.83.10`과 SDK 55 권장 Expo 모듈 패치 버전으로 맞췄습니다. 이후 `npm test` 182개, `npm run typecheck`, `npm run export:web`, `npm run verify:static-web`, `git diff --check`를 통과했습니다.
  - 2026-07-24 이전 소스의 Android Debug 및 production 빌드 이력은 있지만, 현재 패치 버전과 2026-09-02 보완 소스의 네이티브 production 빌드는 새로 생성해야 합니다.
- [x] `npm audit`의 high 취약점 해결
  - 2026-09-03 `npm audit --omit=dev` 결과는 critical 0건, high 0건, moderate 17건입니다. 중간 위험도 항목은 계속 추적하며 무조건적인 무결함 판정으로 해석하지 않습니다.
  - [Metro 0.83.8 공식 패치](https://github.com/react/metro/releases/tag/v0.83.8)가 취약한 `image-size` 의존성을 제거했습니다. Expo 경로뿐 아니라 RN `@react-native/community-cli-plugin@0.83.10` 경로도 기존 허용 범위 `^0.83.6` 안에서 0.83.8을 사용하도록 버전 한정 override를 적용했습니다. 모든 Metro 경로와 lockfile에서 `image-size` 제거를 확인했습니다.
  - 이 override는 RN CLI plugin 0.83.10에만 적용합니다. React Native 또는 Expo SDK 업그레이드 시 새 공식 의존성 범위를 확인하고 필요 없어진 override를 제거합니다. `npm audit fix --force`는 사용하지 않았습니다.
- [x] `npm audit fix --force`는 사용하지 않고 호환성을 확인하며 업데이트
  - `--force` 자동 수정은 적용하지 않았습니다.
- [x] iOS production 빌드 성공 이력 확인
  - 2026-07-24 로컬 EAS production 빌드에서 배포용 서명이 완료되어 `mobile/dist/ilog-production-p0.ipa`를 생성했습니다. SHA-256: `50e6a7d22a3a389f6b94c8b4b73f0c2b99637d014e22eaab85928ac72f3d573c`.
  - 이는 이전 소스의 산출물 검증입니다. 현재 소스로 새 IPA를 만들고 TestFlight 업로드와 실제 기기 설치를 다시 검증해야 합니다.
- [x] Android production AAB 빌드 성공 이력 확인
  - 2026-07-24 Java 17 환경에서 로컬 EAS production 빌드가 성공해 `mobile/dist/ilog-production-p0.aab`를 생성했습니다. SHA-256: `fba70e4bff69d69dfb3203d88ada2cf777ee1aff308f74ba8723bffc29fb00df`.
  - 로컬 Android 빌드는 JDK 17이 필요합니다. OpenJDK 25에서는 `react-native-worklets` CMake가 실패했습니다. 현재 소스로 새 AAB를 만들고 Play Console 내부 테스트와 Galaxy 신규 설치·업데이트를 다시 검증해야 합니다.
- [ ] 신규 설치와 기존 버전 업데이트 모두 테스트

완료 기준:

- Expo Doctor 전체 통과 또는 승인된 예외가 문서화됨
- 운영 의존성의 high 취약점이 없거나, 앱 런타임 영향·빌드 환경 접근 통제·업데이트 계획을 포함한 위험 수용 사유가 승인됨
- 동일 커밋에서 iOS와 Android production 빌드가 모두 성공함

### P0-8. 실제 기기 핵심 시나리오 검증

- [x] 자동으로 검증 가능한 알림·Realtime 경계 테스트 보강
  - 기록 리마인더의 카테고리별 문구·딥링크·최소 예약 시간과 가족 채팅 Realtime의 가족 ID 필터·손상 payload 차단을 단위 테스트로 검증했습니다. 실제 기기와 다계정 조합이 필요한 아래 항목을 대체하지는 않습니다.

- [ ] iPhone 소형 및 대형 화면 테스트
  - iPhone SE (3세대) Simulator에서 Debug 앱 설치와 개발 클라이언트 기동은 확인했습니다. 로컬 Metro가 현재 실행 환경에서 사용 중이지 않은 포트도 사용 중으로 오인해 시작하지 못해 로그인 화면까지의 UI 검증은 완료하지 못했습니다. 실제 소형·대형 iPhone 실기기 시나리오로 계속 검증합니다.
- [ ] Android 소형 및 대형 화면 테스트
- [ ] 가족 3계정과 기기 3대로 가족 격리 및 공유 흐름 테스트
- [ ] 이메일, Google, Apple 가입과 로그인 테스트
- [ ] 가족 초대, 가입, 탈퇴, 재초대 테스트
- [ ] 기록 생성, 수정, 삭제 및 통계 반영 테스트
- [ ] 사진 다중 업로드, 확대, 다운로드, 공유, 삭제 테스트
- [ ] 채팅 실시간 수신, 이미지, 태그, 스크롤, 키보드 테스트
- [ ] foreground, background, terminated 상태의 푸시 테스트
- [ ] 알림 터치 후 정확한 화면 이동 테스트
- [ ] 채팅방 접속 중 푸시 억제 및 미접속 가족에게만 전송되는지 테스트
- [ ] 로그아웃·비밀번호 재설정 뒤 현재 기기 푸시 토큰이 제거되고 기존 알림·예약 알림이 정리되는지 테스트
- [ ] 네트워크 끊김, 느린 네트워크, 세션 만료 테스트
- [ ] 접근 권한 거부 후 앱이 대체 흐름을 제공하는지 테스트

완료 기준:

- P0 시나리오 테스트 결과와 증빙 화면 또는 영상이 보관됨
- 심사용 계정에서 모든 핵심 기능을 재현할 수 있음
- 치명적 또는 높은 우선순위 결함이 0건임

### P0-9. 가족 공유 콘텐츠 안전 정책

- [x] 가족 채팅·댓글·사진·기록에 부적절한 콘텐츠를 신고하는 앱 내 경로 구현
- [x] 보호자 간 대화·댓글·태그·개인 알림을 차단하는 기능과 해제 관리 화면 구현
  - 공동 기록과 가족 권한은 보존하며, 차단을 가족 내보내기와 혼동하지 않도록 안내합니다. 서버 RLS·푸시 전송 직전 검증으로 구형 앱의 직접 조회도 제한합니다.
- [x] 신고 접수, 확인, 조치 기한과 운영 담당 채널을 문서화
  - 아동 안전 또는 불법 콘텐츠 신고: 접수 후 1시간 이내 1차 확인
  - 일반 콘텐츠 신고: 접수 후 24시간 이내 1차 검토, 72시간 이내 조치 또는 처리 결과 회신
  - 계정·가족 삭제 worker 오류: 발생 후 1시간 이내 감지, 자동 복구가 되지 않으면 3영업일 이내 수동 삭제 완료
  - 일반 고객 문의: 접수 후 2영업일 이내 1차 회신
  - 운영 담당 채널: `ilog-support@ilog.io.kr`
  - 위 시간은 출시 운영 기준입니다. 메일 수신 알림과 담당자 연락망을 연결하고 실제 접수·조치 기록을 남길 수 있어야 완료로 판단합니다.
- [x] 서버 게시 전 금칙 표현 필터와 사진·첨부 접근 제한 구현
  - 자동 이미지 내용 심사 기능은 아니며, 신고·운영 검토를 병행합니다.
- [x] 사용자가 쉽게 확인할 수 있는 고객지원 연락처 공개
- [ ] 2026-09-03 콘텐츠 안전 migration 2개와 푸시 함수 운영 배포
- [ ] 개인정보 없는 상태 점검 도구의 정기 실행·실제 수신 채널·담당자 연결
- [ ] 최신 앱에서 실제 신고 접수·조치·회신과 Android/iOS 기기 동작 확인

앱 내 신고·차단과 서버 예방 조치는 소스에 구현했습니다. 신고는 참조와 설명만 비공개로 보관하고, 해결 후 90일 이내 정리합니다. 운영 배포·담당자 알림·실기기 검증은 별도 출시 게이트입니다. `CONTENT_SAFETY_OPERATIONS.md`에 조치 RPC, 실행 방법, 보유 기간과 남은 한계를 기록했습니다. 가족 전용 비공개 서비스라도 콘텐츠 안전 운영이 필요하며, 소스 구현만으로 스토어 승인이나 실제 운영 완료를 보장하지 않습니다.

2026-09-03 검증 기록:

- 분리된 새 DB에 전체 migration 적용 후 기존 RLS/OAuth/삭제 fixture와 13종 신고 대상·양방향 차단·Storage·push 재검사·운영 조치 fixture 통과. 운영 사용자 데이터는 테스트하지 않았습니다.
- Playwright CLI: 412×700에서 신고 사유/설명 검증, 30초 갱신 중 대화·기록 신고 초안 보존, 대화·사진·기록 신고 후 숨김과 재진입, 차단/해제 및 공동 기록 보존, 관리 목록 오류 후 재시도 확인. 1280×800 관리 화면도 확인했습니다.
- 정상 흐름에서 예상하지 않은 브라우저 오류는 없었습니다. 별도 오류 검사에서 의도한 503 응답과 금칙 표현 거부를 확인했고, 한국어 안내·재시도·입력 보존을 검증했습니다.
- 실제 로컬 Auth 세션을 사용해 보호 화면 및 새로고침을 검증했습니다. 웹 CAPTCHA 우회 기능을 앱에 추가하지 않았으며 네이티브 Google/Apple 로그인이나 기기 push 검증을 대신하지 않습니다.
- 화면 증거는 Git 제외 `output/playwright/safety-*.png`에 보관합니다. 새 IPA/AAB 빌드와 공개 스토어 제출은 보류 상태입니다.

## 4. P1 - 베타 종료 전 완료 권장

### P1-1. 장애 감지와 운영 모니터링

- [ ] Sentry 또는 Crashlytics 연동
- [ ] 앱 버전, 플랫폼, 사용자 비식별 식별자를 포함한 오류 문맥 수집
- [ ] Supabase Edge Function 오류 알림 설정
- [x] 신고·삭제·Apple 해지·푸시의 건수 전용 상태 RPC와 점검 스크립트 구현
  - `node scripts/check_release_operations.mjs`는 읽기 전용, `--notify`는 운영자 지정 webhook으로 집계만 전송합니다. 실제 정기 실행과 수신 확인은 아직 별도 연결이 필요합니다.
- [ ] 푸시 전송 성공률과 실패 토큰 정리 지표 준비
- [ ] DB 용량, Storage 용량, Edge Function 사용량 알림 설정
- [ ] 치명적 장애 대응 연락망과 롤백 절차 작성
- [x] 개인정보가 클라이언트 로그에 남지 않도록 정적 점검 및 필터링
  - 2026-07-25 앱과 Edge Function 소스의 `console.*` 호출을 점검했습니다. 원본 `Error` 객체를 전달하던 앱 경고는 고정된 실패 문구만 남기도록 변경했고, 인증 토큰·이메일·가족 기록·사진 URL을 로그로 출력하는 호출은 없습니다.
  - 추후 Sentry 또는 Crashlytics를 연동할 때도 이벤트 전송 전 같은 항목을 제거하는 필터를 별도로 적용합니다.

### P1-2. 성능과 사용성

- [ ] 홈 첫 진입과 사진 목록 로딩 성능 측정
- [x] 썸네일 렌더링 및 캐시 정책 점검
  - 홈과 앨범은 React Native 이미지의 `force-cache`를 우선 사용하며, Android에서는 `resizeMethod="resize"`와 progressive rendering을 적용합니다. 서버 측 별도 썸네일 변환은 아직 없으므로, 실제 기기에서 저속 네트워크 측정 시 원본 사진의 다운로드량을 함께 확인합니다.
- [x] 대용량 사진 업로드 전 리사이즈 및 압축 확인
  - 가족 사진은 긴 변 1,600px 초과 또는 1.2MB 초과, HEIC/HEIF일 때 JPEG 품질 0.78로 재인코딩하고 6MB 초과 업로드를 막습니다. 프로필 사진은 긴 변 512px, JPEG 품질 0.78로 별도 최적화합니다.
- [ ] 채팅 전송, 실시간 수신, 푸시 지연 시간 측정
- [ ] 느린 네트워크에서 로딩, 재시도, 중복 전송 방지 확인
- [ ] 접근성 라벨, 글자 확대, 명암 대비 확인
  - 주요 버튼, 사진, 탭에는 `accessibilityRole`과 한국어 `accessibilityLabel`을 적용했습니다. 2026-07-25에 아이콘 전용인 홈 알림·설정, 날짜 이동, 공통 헤더, 채팅 사진 추가·전송, 하단 탭의 이름과 탭 선택 상태를 추가로 점검했습니다.
  - Playwright 접근성 트리에서 로그인·약관 이동과 약관 화면의 `이전 화면` 버튼 노출을 확인했습니다. 실제 VoiceOver/TalkBack, 시스템 글자 확대, 명암 대비 확인은 실기기 P0-8과 함께 수행합니다.

### P1-3. 고객지원 운영

- [x] 고객지원 이메일 생성
  - `ilog-support@ilog.io.kr`로 고객지원 및 개인정보 관련 문의를 수신합니다.
- [ ] 문의 유형과 예상 응답 시간 공개
  - 앱 및 정적 웹 소스에는 일반 문의 2영업일, 아동 안전·불법 콘텐츠 1시간, 일반 콘텐츠 신고 24시간 이내 1차 확인을 표시했고 작은 화면 Playwright 검증을 통과했습니다. 공개 도메인 재배포 후 완료 처리합니다.
- [x] 개인정보 열람, 정정, 삭제 요청 처리 양식 준비
  - 고객지원과 외부 계정 삭제 화면의 메일 작성 버튼에 가입 이메일, 요청 범위와 요청 내용을 미리 채워 넣습니다.
- [x] 버그 신고 시 앱 버전과 기기 정보를 확인하는 절차 준비
  - 고객지원 화면과 메일 작성 양식에 화면, 발생 시각, 앱 버전, 기기 종류를 포함하도록 안내합니다.
- [ ] App Store 및 Google Play 리뷰 답변 담당자 지정

## 5. P2 - 첫 공개 출시 후 가능

- [ ] 실제 클라우드 백업과 복원
- [ ] PDF, Excel, CSV 데이터 내보내기
- [ ] iPad 전용 레이아웃
- [ ] 해외 출시와 다국어 정책 문서
- [ ] EU 지역 배포와 trader 정보 확장
- [ ] 유료 구독 또는 인앱 구매
- [ ] 고급 통계와 데이터 분석
- [ ] 가족 역할 및 권한 세분화

P2 기능은 첫 출시에서 화면에 미완성 상태로 노출하지 않습니다.

## 6. App Store 출시 체크리스트

- [ ] Apple Developer 계약 및 계정 상태 확인
- [ ] App Store Connect 앱 정보와 Bundle ID 확인
- [ ] Sign in with Apple capability와 로그인 검증
- [ ] 앱 이름, 부제, 설명, 키워드 확정
- [ ] 실제 앱 화면 기반 iPhone 스크린샷 준비
- [ ] iPad 지원 시 iPad 스크린샷 준비
- [ ] 개인정보 처리방침 URL 등록
- [ ] Support URL 등록
- [ ] App Privacy 항목을 실제 수집 데이터에 맞게 작성
- [ ] 연령 등급 작성
- [ ] 암호화 수출 규정 작성
- [ ] 규제 의료기기가 아님을 확인하고 의료적 오해가 없는 설명 작성
- [ ] 심사용 데모 계정과 가족 데이터 준비
- [ ] 심사 노트에 로그인, 가족 초대, 푸시, 건강 정보의 용도 설명
- [ ] 사용자 생성 콘텐츠 신고·차단·필터링과 계정 삭제 시 작성 콘텐츠 처리 검증
- [ ] 가격과 출시 국가 결정
- [ ] EU 출시 시 DSA trader 상태 확정
- [ ] TestFlight 내부 및 외부 베타 완료
- [ ] 수동 출시 또는 단계적 출시 설정

## 7. Google Play 출시 체크리스트

- [ ] Play Console 개발자 계정과 신원 인증 완료
- [ ] 앱 생성 및 `com.ilog.mobile` 등록
- [ ] Play App Signing 설정
- [ ] production Android App Bundle 생성
- [ ] 내부 테스트 트랙 배포
- [ ] 필요한 경우 12명 이상, 14일 연속 비공개 테스트 진행
- [ ] production 접근 신청
- [ ] 앱 이름, 짧은 설명, 자세한 설명 확정
- [ ] 실제 Android 화면 기반 스크린샷과 feature graphic 준비
- [ ] 개인정보 처리방침 URL `https://ilog.io.kr/privacy-policy` 등록
- [ ] 고객지원 URL `https://ilog.io.kr/support`와 고객지원 이메일 `ilog-support@ilog.io.kr` 등록
- [ ] 외부 계정 삭제 URL `https://ilog.io.kr/delete-account` 등록
- [ ] Data Safety 양식을 실제 수집 데이터에 맞게 작성
- [ ] Health Apps 선언에서 건강 기능 사용 여부와 용도를 실제 앱 동작에 맞게 작성
- [ ] 수면, 영양 및 체중, 예방접종, 약 복용 등 앱에서 취급하는 건강 관련 데이터 범주를 Data Safety 및 Health Apps 양쪽에 일관되게 선언
- [ ] 대상 연령, 콘텐츠 등급, 광고 여부 작성
- [ ] 심사용 계정과 가족 데이터, 로그인 및 핵심 기능 확인 절차를 준비하고 Review access에 등록
- [ ] Google Cloud/Firebase의 Android OAuth 클라이언트에 Play App Signing 인증서 SHA-1을 등록하고 production AAB에서 Google 로그인 확인
- [ ] Play Console에서 실제 앱 listing URL이 생성된 뒤 EAS production에 `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.ilog.mobile` 등록
- [ ] 단계적 production rollout 설정

Google Play Console의 앱 생성, 스토어 등록정보 작성, 내부 테스트와 선언 초안은 공개 제출 전에 진행할 수 있습니다. 다만 P0-9의 앱 내 신고·차단·예방 필터, 실기기 인증·탈퇴·알림 검증, 운영 모니터링이 남아 있으므로 현재는 production 공개 제출을 보류합니다.

## 8. 권장 실제 작업 순서

아래 순서대로 진행하며 각 단계가 완료되기 전 다음 단계의 공개 배포를 시작하지 않습니다.

1. **인증 체계 정비**: 이메일 인증 원격 적용, 비밀번호 재설정 실기기 검증, Apple 로그인 실기기 검증, CAPTCHA
2. **계정 탈퇴 구현**: 가족 공유 데이터 삭제 정책 포함
3. **Supabase 정비**: migration history, RLS, RPC, Storage, 비밀번호 보호
4. **정책 확정**: 약관, 개인정보, 보호자 동의, 운영자 및 문의 정보
5. **정적 웹 준비**: 정책, 지원, 삭제 요청, 초대 딥링크
6. **미완성 기능 정리**: 백업, 내보내기, iPad 지원 범위
7. **의존성 및 빌드 정리**: Expo Doctor, audit, iOS IPA, Android AAB
8. **운영 관측성 추가**: 크래시, 서버 오류, 푸시, 사용량 알림
9. **실기기 베타**: TestFlight와 Google Play 비공개 테스트
10. **스토어 문서 제출**: 개인정보, 건강 앱, 심사 계정, 스크린샷
11. **단계적 공개 출시**: 대한민국부터 제한적으로 시작
12. **출시 후 모니터링**: 크래시, 리뷰, 푸시 실패, 고객문의 확인

## 9. 최종 출시 게이트

다음 조건을 모두 만족해야 공개 출시를 승인합니다.

- [ ] P0 체크리스트 전체 완료
- [ ] 정책 문서와 실제 데이터 처리가 일치
- [ ] 계정 생성, 비밀번호 재설정, 탈퇴가 모두 동작
- [ ] 가족 간 데이터 격리 검증 완료
- [ ] iOS와 Android production 빌드 완료
- [ ] iOS와 Android 실기기 핵심 시나리오 통과
- [ ] 스토어 심사용 계정과 데이터 준비
- [ ] 개인정보 및 건강 관련 스토어 선언 완료
- [ ] 크래시 및 서버 장애 감지 수단 준비
- [ ] 고객지원과 개인정보 요청 대응 경로 공개
- [ ] 백업과 복구 절차 확인
- [ ] 출시 버전에 미완성 또는 목 기능이 노출되지 않음

## 10. 반복 검증 명령

모바일 프로젝트에서 실행합니다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss/mobile
npm test
npm run typecheck
npx expo-doctor
npx expo install --check
npm audit --omit=dev
```

Supabase 프로젝트 루트에서 실행합니다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss
npx supabase migration list
npx supabase db advisors --linked --type security --level warn
npx supabase db advisors --linked --type performance --level warn
```

브라우저 화면 검증은 로컬 웹 서버를 실행한 뒤 저장소의 Playwright smoke 스크립트를 사용합니다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss/mobile
npm run web -- --port 19006
```

다른 터미널에서 실행합니다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss
scripts/run_playwright_smoke.sh
```

Playwright smoke는 연결된 Supabase에 테스트 데이터를 생성할 수 있으므로 운영 프로젝트가 아닌 별도 검증 프로젝트에서 실행하는 것을 원칙으로 합니다.

## 11. 공식 정책 참고 자료

- Apple App Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>
- Apple 앱 내 계정 삭제 안내: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Apple App Privacy 관리: <https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/>
- Google Play 계정 삭제 요건: <https://support.google.com/googleplay/android-developer/answer/13327111>
- Google Play Data Safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Google Play Health Apps 선언: <https://support.google.com/googleplay/android-developer/answer/14738291>
- Google Play 신규 개인 계정 테스트 요건: <https://support.google.com/googleplay/android-developer/answer/14151465>
- 개인정보보호위원회 개인정보 처리방침 작성지침: <https://m.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=G010030000>
