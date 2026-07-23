# 아이로그 정식 서비스 출시 체크리스트

작성 기준일: 2026-07-23
대상 앱: 아이로그 (`com.ilog.mobile`)
대상 플랫폼: iOS, Android
초기 출시 권장 범위: 대한민국, 보호자용 육아 기록 서비스

## 1. 현재 출시 판정

현재 단계는 **TestFlight 및 내부 베타 테스트 가능**, **공개 스토어 출시 보류**입니다.

기본 기능과 자동화 테스트는 갖춰져 있지만 계정 삭제, 비밀번호 재설정, Apple 로그인, 고객지원, 정책 문서, 운영 보안처럼 공개 서비스에 필수적인 항목이 완성되지 않았습니다. 아래 P0 항목을 모두 해결한 뒤 공개 심사를 신청합니다.

### 현재 확인된 상태

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 단위 테스트 | 통과 | 58개 통과 |
| TypeScript 검사 | 통과 | `npm run typecheck` |
| Expo Doctor | 보완 필요 | 19개 중 18개 통과, SDK 55 패치 버전 12개 불일치 |
| npm 운영 의존성 감사 | 보완 필요 | high 3건 포함 14건 |
| iOS 배포 | 베타 단계 | TestFlight 경로와 App Store Connect 앱이 준비되어 있음 |
| Android 배포 | 미완료 | production AAB 및 Play Console 출시 절차 필요 |
| Supabase 보안 Advisor | 보완 필요 | WARN 47건, 개별 검토 필요 |
| Supabase migration 이력 | 보완 필요 | 로컬과 원격 이력이 불일치함 |
| 정식 약관 및 개인정보 처리방침 | 미완료 | 앱 내부 문서는 초안 상태 |

## 2. 작업 우선순위

| 우선순위 | 의미 | 출시 판단 |
| --- | --- | --- |
| P0 | 심사, 보안, 개인정보, 핵심 사용 흐름에 직접 영향 | 하나라도 남으면 출시 보류 |
| P1 | 장애 대응과 서비스 품질에 영향 | 베타 종료 전 완료 권장 |
| P2 | 출시 범위 확장 및 편의 기능 | 첫 공개 출시 후 진행 가능 |

## 3. P0 - 공개 출시 전 반드시 해결

### P0-1. 인증 체계 정비

- [ ] 이메일 회원가입과 로그인을 Supabase Auth 표준 흐름으로 통합
- [ ] 가입 이메일 소유 확인 구현
- [ ] 비밀번호 재설정 메일과 앱 복귀 딥링크 구현
- [ ] Google 로그인과 동일한 계정으로 중복 가입되지 않도록 계정 연결 정책 확정
- [ ] Apple 로그인 실제 구현 또는 Google 로그인을 첫 출시 범위에서 제거
- [ ] 로그인 반복 시도 제한과 CAPTCHA 적용
- [ ] 네이티브 세션 저장소를 `AsyncStorage`에서 보안 저장소로 변경
- [ ] 기존 테스트 계정과 보호자 데이터 마이그레이션 또는 초기화 계획 수립

완료 기준:

- 이메일, Google, Apple 계정으로 가입과 재로그인이 가능함
- 비밀번호를 잊은 사용자가 운영자 도움 없이 재설정할 수 있음
- 한 사람이 로그인 방법을 바꿔도 중복 보호자 계정이 생기지 않음
- 로그아웃 후 세션과 민감한 로컬 데이터가 정리됨

### P0-2. 계정 탈퇴 및 데이터 삭제

- [ ] 앱 내부 `계정 탈퇴` 기능 구현
- [ ] 외부 계정 삭제 요청 웹페이지 또는 요청 양식 준비
- [ ] 탈퇴 전 재인증 및 확인 절차 구현
- [ ] 보호자 개인 탈퇴와 가족 전체 삭제의 차이를 화면에서 설명
- [ ] 작성한 기록, 채팅, 사진, 푸시 토큰, 초대 정보의 삭제 범위 확정
- [ ] 법정 보관 대상이 있다면 항목과 기간을 개인정보 처리방침에 명시
- [ ] 삭제 요청과 처리 결과를 감사 가능한 형태로 기록

완료 기준:

- 사용자가 앱과 외부 웹 경로 양쪽에서 삭제를 요청할 수 있음
- 탈퇴 후 해당 사용자가 다시 데이터에 접근할 수 없음
- 가족 구성원이 남아 있는 경우 공유 기록 처리 규칙이 문서와 실제 동작에서 일치함

### P0-3. 약관, 개인정보, 보호자 동의

- [ ] 이용약관 초안을 정식 문서로 교체
- [ ] 개인정보 처리방침 초안을 정식 문서로 교체
- [ ] 운영자명, 주소 또는 사업장 정보, 고객지원 연락처 확정
- [ ] 개인정보 보호 담당 연락처와 권리 행사 절차 명시
- [ ] 보호자 정보와 아이 정보의 수집 항목, 목적, 보유 기간 명시
- [ ] Supabase, Google, Expo 등 수탁자와 국외 이전 내용을 실제 설정에 맞춰 명시
- [ ] 가족 구성원에게 사진, 기록, 채팅이 공유된다는 점 명시
- [ ] 건강 관련 수치는 기록 및 참고용이며 진단이나 처방이 아니라는 점 명시
- [ ] 가입 시 필수 동의와 선택 동의를 분리
- [ ] 동의한 문서 종류, 버전, 시각을 데이터베이스에 저장
- [ ] 정책 변경 시 재동의 또는 변경 안내 절차 구현

완료 기준:

- 앱 내부와 외부 HTTPS 페이지에서 동일한 최신 문서를 확인할 수 있음
- 앱의 실제 데이터 처리와 스토어 개인정보 선언이 문서 내용과 일치함
- 정책 문서에서 `초안`, `정식 운영 전` 같은 임시 문구가 모두 제거됨

주의:

- 최종 문서는 개인정보보호위원회 최신 작성지침을 기준으로 작성하고 법률 전문가 검토를 권장합니다.
- 아이가 앱 회원으로 가입하는 구조가 아니라 성인 보호자가 아이 정보를 관리하는 서비스로 대상 사용자를 명확히 합니다.

### P0-4. 공개 웹페이지와 딥링크

전체 웹서비스를 만들 필요는 없지만 다음 정적 HTTPS 페이지는 필요합니다.

- [ ] `/privacy` 개인정보 처리방침
- [ ] `/terms` 이용약관
- [ ] `/support` 고객지원 및 문의
- [ ] `/delete-account` 계정 삭제 요청
- [ ] `/invite` 가족 초대 랜딩 및 앱 설치 안내
- [ ] iOS `apple-app-site-association` 설정
- [ ] Android `assetlinks.json` 설정
- [ ] 앱 미설치 시 App Store 또는 Google Play로 이동하는 초대 흐름 구현
- [ ] EAS production 환경에 초대 및 스토어 URL 등록

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

- [ ] 원격 DB를 백업하고 복구 가능 여부 확인
- [ ] 로컬 전용 및 원격 전용 migration 목록을 각각 검토
- [ ] migration history를 실제 원격 스키마와 일치하도록 복구
- [ ] 새로운 빈 Supabase 프로젝트에서 전체 migration 재현 테스트
- [ ] 익명 인증이 필요한 범위와 종료 시점을 확정
- [ ] RLS 정책을 가족 A와 가족 B 격리 시나리오로 검증
- [ ] `SECURITY DEFINER` 함수 18개의 외부 실행 필요 여부 검토
- [ ] 내부 helper 함수는 exposed schema 밖으로 이동하거나 실행 권한 회수
- [ ] 모든 함수에 고정 `search_path` 적용
- [ ] 유출 비밀번호 보호 기능 활성화
- [ ] Storage의 사진 조회, 업로드, 삭제 정책 검증
- [ ] 서비스 역할 키가 앱 번들 및 공개 환경에 포함되지 않았는지 확인

완료 기준:

- `npx supabase migration list`에서 로컬과 원격 이력이 일치함
- 보안 Advisor 경고가 0건이거나 승인된 예외 목록과 사유가 문서화됨
- 다른 가족 ID를 조작해도 기록, 사진, 채팅, 푸시 토큰을 조회하거나 변경할 수 없음
- 운영 DB를 백업에서 복구하는 절차를 실제로 한 번 검증함

### P0-6. 미완성 또는 오해를 주는 기능 정리

- [ ] Google Drive 백업을 실제 구현하거나 첫 출시에서 메뉴 제거
- [ ] 데이터 내보내기를 실제 파일 생성 및 다운로드까지 구현하거나 메뉴 제거
- [ ] 고정된 최근 백업 날짜 제거
- [ ] 동작하지 않는 버튼과 임시 화면 전체 점검
- [ ] 샘플 및 목 데이터가 운영 빌드에 나타나지 않는지 확인
- [ ] iPad를 지원할지 결정
- [ ] iPad를 지원하지 않으면 `supportsTablet: false`로 변경
- [ ] 지원한다면 iPad 실기기 또는 Simulator UI와 스크린샷 검증

완료 기준:

- 사용자가 누를 수 있는 모든 버튼이 완료, 취소, 오류 상태를 포함해 실제로 동작함
- 준비되지 않은 기능은 사용자와 스토어 심사자에게 노출되지 않음

### P0-7. 앱 안정성 및 의존성 정리

- [ ] `npx expo install --check`로 Expo SDK 55 호환 패치 버전 검토
- [ ] SDK 55 권장 패치 버전으로 업데이트
- [ ] `npm audit`의 high 취약점 해결 경로 검토
- [ ] `npm audit fix --force`는 사용하지 않고 호환성을 확인하며 업데이트
- [ ] iOS production 빌드 성공 확인
- [ ] Android production AAB 빌드 성공 확인
- [ ] 신규 설치와 기존 버전 업데이트 모두 테스트

완료 기준:

- Expo Doctor 전체 통과 또는 승인된 예외가 문서화됨
- 운영 의존성의 high 취약점이 없거나 앱 런타임에 영향이 없는 사유가 문서화됨
- 동일 커밋에서 iOS와 Android production 빌드가 모두 성공함

### P0-8. 실제 기기 핵심 시나리오 검증

- [ ] iPhone 소형 및 대형 화면 테스트
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
- [ ] 네트워크 끊김, 느린 네트워크, 세션 만료 테스트
- [ ] 접근 권한 거부 후 앱이 대체 흐름을 제공하는지 테스트

완료 기준:

- P0 시나리오 테스트 결과와 증빙 화면 또는 영상이 보관됨
- 심사용 계정에서 모든 핵심 기능을 재현할 수 있음
- 치명적 또는 높은 우선순위 결함이 0건임

## 4. P1 - 베타 종료 전 완료 권장

### P1-1. 장애 감지와 운영 모니터링

- [ ] Sentry 또는 Crashlytics 연동
- [ ] 앱 버전, 플랫폼, 사용자 비식별 식별자를 포함한 오류 문맥 수집
- [ ] Supabase Edge Function 오류 알림 설정
- [ ] 푸시 전송 성공률과 실패 토큰 정리 지표 준비
- [ ] DB 용량, Storage 용량, Edge Function 사용량 알림 설정
- [ ] 치명적 장애 대응 연락망과 롤백 절차 작성
- [ ] 개인정보가 로그에 남지 않도록 필터링

### P1-2. 성능과 사용성

- [ ] 홈 첫 진입과 사진 목록 로딩 성능 측정
- [ ] 썸네일 생성과 캐시 정책 확인
- [ ] 대용량 사진 업로드 전 리사이즈 및 압축 확인
- [ ] 채팅 전송, 실시간 수신, 푸시 지연 시간 측정
- [ ] 느린 네트워크에서 로딩, 재시도, 중복 전송 방지 확인
- [ ] 접근성 라벨, 글자 확대, 명암 대비 확인

### P1-3. 고객지원 운영

- [ ] 고객지원 이메일 생성
- [ ] 문의 유형과 예상 응답 시간 공개
- [ ] 개인정보 열람, 정정, 삭제 요청 처리 양식 준비
- [ ] 버그 신고 시 앱 버전과 기기 정보를 확인하는 절차 준비
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
- [ ] 개인정보 처리방침 URL 등록
- [ ] 외부 계정 삭제 URL 등록
- [ ] Data Safety 양식을 실제 수집 데이터에 맞게 작성
- [ ] Health Apps 선언 작성
- [ ] 수면, 영양 및 체중, 예방접종, 약 복용 등 해당 기능을 정확히 선언
- [ ] 대상 연령, 콘텐츠 등급, 광고 여부 작성
- [ ] 심사용 계정과 안내 준비
- [ ] 단계적 production rollout 설정

## 8. 권장 실제 작업 순서

아래 순서대로 진행하며 각 단계가 완료되기 전 다음 단계의 공개 배포를 시작하지 않습니다.

1. **인증 체계 정비**: 이메일 인증, 비밀번호 재설정, Apple 로그인, 보안 저장소
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
- Apple App Privacy 관리: <https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/>
- Google Play 계정 삭제 요건: <https://support.google.com/googleplay/android-developer/answer/13327111>
- Google Play Data Safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Google Play Health Apps 선언: <https://support.google.com/googleplay/android-developer/answer/14738291>
- Google Play 신규 개인 계정 테스트 요건: <https://support.google.com/googleplay/android-developer/answer/14151465>
- 개인정보보호위원회 개인정보 처리방침 작성지침: <https://m.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=G010030000>
