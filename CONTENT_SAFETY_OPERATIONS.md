# 콘텐츠 안전 운영 안내

기준일: 2026-09-03. 코드 구현과 운영 배포·담당자 연결은 별개의 출시 조건입니다.

## 정책과 사용자 동작

- 대화, 댓글, 사진, 기록, 일정·분담, 보호자의 메뉴에서 신고합니다. 신고는 신고자 화면에서 해당 항목을 숨기고 운영 검토를 요청합니다. 다른 가족에게 신고자나 사유를 공개하지 않습니다.
- 차단은 보호자 사이의 대화·댓글·태그·개인 알림을 양방향으로 제한합니다. 가족에서 내보내기, 공동 육아 기록 삭제, 보호자 권한 변경은 아닙니다. 공동 기록·일정·사진은 별도로 신고할 수 있습니다.
- 금칙 표현은 서버의 게시 전 필터로 제한합니다. 좁은 표현 목록을 사용하므로 모든 유해 콘텐츠를 자동 판별하지는 않습니다. 사진 의미를 분석하는 자동 이미지 심사 기능은 없으며 신고와 운영 검토를 병행합니다.
- 신고에는 대상 종류·ID, 신고자·대상 보호자 참조, 사유와 사용자가 입력한 설명만 저장합니다. 원본 사진·본문 사본은 만들지 않습니다. 신고 설명에 아동의 주소·연락처·건강 정보 등을 적지 않도록 안내합니다.
- 해결·기각된 신고는 정상적인 정리 작업 실행 시 완료 후 90일 이내 삭제합니다. 신고자 탈퇴나 가족 삭제 시 연결된 신고도 제거합니다. 아직 미처리인 신고는 이 기간으로 자동 종결하지 않습니다.
- 이미 발급된 사진 signed URL은 최대 10분간 유효할 수 있고 이미 외부로 전송한 알림은 회수할 수 없습니다. 이후 URL 발급과 대기·전송 직전 푸시는 서버에서 다시 제한합니다.
- 과거 타임라인 자동 요약은 원본 기록 ID가 없는 독립 메시지입니다. 기록 신고가 그 요약까지 자동으로 숨기지는 않으며, 요약 자체의 메뉴에서 별도로 신고할 수 있습니다.

## 운영 배포 순서

새 앱 배포 전에 다음을 적용해야 합니다. 운영 반영은 프로젝트 확인과 사용자 승인 후에만 수행합니다.

1. `20260902232214_family_content_safety_controls.sql`: 비공개 신고·차단 테이블, 검증 RPC, RLS, Storage·푸시 제한, 2026-09-03 약관 동의, 정리 cron.
2. `20260902232320_release_operations_health.sql`: 서비스 전용 집계 상태 RPC.
3. `send-push-notifications` Edge Function: 각 기기 전송 직전 신고·차단 상태 재검사. 기존 cron 인증 설정을 유지합니다.
4. 익명·일반 사용자에게 운영 RPC가 거부되는지, 기존 삭제·Apple 해지 cron이 중복되지 않는지 확인합니다. 운영 사용자로 가짜 신고·차단·탈퇴 테스트를 만들지 않습니다.
5. 운영 알림 수신과 처리 담당자를 연결한 뒤 최신 공개 약관 웹과 앱을 배포합니다. 네이티브 빌드·제출은 별도 승인된 일정에 따릅니다.

2026-09-03 운영 반영: 위 migration 2개와 `20260903010606_monitor_release_cron_and_http_health.sql`, `send-push-notifications`, `check-release-operations`를 적용했습니다. 운영 RPC의 anon/authenticated 실행 거부, 전용 모니터 비밀키 없는 HTTP 401 및 올바른 키의 집계 HTTP 200을 확인했습니다. 신규 신고 정리 cron의 첫 성공은 2026-09-03 01:17 UTC이며, 01:17:46 UTC 점검에서 11개 이상 건수가 모두 0이었습니다. 기존 삭제·Apple 해지·푸시 작업을 포함한 필수 cron 4개는 각각 하나만 활성화되어 있습니다.

## 신고 확인과 조치

운영 콘솔 화면은 별도로 만들지 않았습니다. 신뢰할 수 있는 서버/운영 터미널에서만 service role 자격 증명으로 아래 RPC를 호출합니다. 일반 사용자와 익명 역할에는 실행 권한이 없습니다. 비밀 키나 신고 내용은 Git, CI 공개 로그, 메신저에 붙여 넣지 않습니다.

| RPC | 입력 | 용도 |
| --- | --- | --- |
| `list_safety_reports_checked` | `p_status`, `p_limit`(최대 100), `p_before_id` | 비공개 신고 목록. 기본 50건, 다음 페이지는 마지막 ID 사용 |
| `moderate_safety_report_checked` | `p_report_id`, `p_action`, `p_operator_note` | 신고 검토와 조치. 비식별 메모만 남김 |
| `get_content_safety_operations_status_checked` | 없음 | 개인정보 없는 대기·지연 건수 |

조치는 `IN_REVIEW`(검토 시작), `DISMISS`(기각), `HIDE_CONTENT`(가족 화면에서 숨김), `RESTORE_CONTENT`(운영 숨김 복원), `RESTRICT_USER`(게시 제한), `UNRESTRICT_USER`(게시 제한 해제) 중 하나입니다. 게시자 본인에게는 자신의 운영 숨김 콘텐츠가 계속 보일 수 있습니다. 신고자의 개인 숨김은 운영 복원과 별개입니다. 사용자 차단을 운영자가 임의 해제하지 않습니다.

목록의 참조 대상으로 필요한 원본만 제한적으로 검토하고, 삭제된 원본의 복원을 시도하지 않습니다. 운영 메모에는 조치 근거와 시각만 남기며 신고 원문을 복제하지 않습니다. 현재 앱에는 신고 처리 이력 조회 화면이 없으므로 필요한 결과 안내·이의 제기는 지원 메일로 처리합니다.

## 개인정보 없는 상태 점검

서버의 secret 저장소에 아래 값을 등록합니다. 모바일 `.env`, EAS 공개 환경이나 `EXPO_PUBLIC_*`에는 넣지 않습니다.

- `ILOG_OPERATIONS_SUPABASE_URL`: 점검할 Supabase 프로젝트 URL
- `ILOG_OPERATIONS_SERVICE_ROLE_KEY`: 해당 프로젝트 서버 전용 service role 키
- `ILOG_OPERATIONS_ALERT_WEBHOOK_URL`: 선택한 운영 알림 수신기의 HTTPS URL (`--notify` 사용 시)

```bash
node scripts/check_release_operations.mjs
node scripts/check_release_operations.mjs --notify
```

기본 명령은 읽기 전용입니다. `--notify`는 조치할 건수가 있을 때만 지정 수신기로 집계 JSON을 전송합니다. 사용자 ID, 가족 ID, 신고 본문, 이메일, 토큰, 원본 오류를 출력하거나 전송하지 않습니다. 수신기는 일반 HTTPS JSON webhook 계약에 맞게 구성해야 하며 특정 메신저에 자동 연동된 상태는 아닙니다.

종료 코드: `0` 정상, `1` 확인할 건수 있음, `2` 설정·통신 오류. 스케줄러는 `1`뿐 아니라 `2`와 실행 누락도 알림으로 처리해야 합니다. 권장 실행 간격은 5분이며, 중복 알림 억제·해결 알림은 수신 측에서 구성합니다. 이 스크립트를 추가한 것만으로 정기 실행이나 담당자 알림이 활성화되지는 않습니다.

집계는 미처리 신고, 1시간 초과 아동 안전·폭력 신고, 24/72시간 초과 신고, 삭제 지연·실패, Apple 수동 해지·지연, 최근 푸시 실패·지연을 포함합니다. 추가 집계는 필수 cron 4개의 누락·중복·비활성·일정 변경·실패·성공 지연과 최근 15분 pg_net HTTP 실패입니다. pg_net 응답에는 요청 URL 연결 정보가 없으므로 모든 pg_net 실패를 보수적으로 집계합니다. 응답이 아예 생성되지 않는 pg_net 정지와 각 worker의 업무 완료는 별도 heartbeat 없이는 모두 감지하지 못합니다.

## 외부 이메일 점검

GitHub Actions `.github/workflows/release-operations.yml`이 약 5분 간격으로 전용 Edge API를 호출합니다. Supabase 자체 HTTP 장애도 GitHub에서 별도로 메일 발송을 시도합니다. 사용자 승인 수신자는 GitHub Secret에만 저장하며, 공개 코드나 앱에 개인 메일 주소를 넣지 않습니다.

- 발송은 기존 Auth SMTP와 분리한 Resend Sending access 키를 사용하며 도메인은 `ilog.io.kr`로 제한합니다.
- 정상(모든 건수 0)은 메일을 보내지 않습니다. 미처리 신고·운영 이상 또는 상태 조회 실패일 때 비식별 상태와 건수만 보냅니다.
- 시간대·동일 상태의 Resend idempotency key로 중복을 제한합니다. 건수가 바뀌면 새 메일, 같은 미해결 상태는 다음 시간대에 다시 알립니다. 별도 복구 메일은 구현하지 않았습니다.
- `workflow_dispatch`의 `test_email=true`는 운영 데이터를 만들거나 조회하지 않는 명시적인 검증 메일입니다. 같은 시간대의 검증 메일도 중복 제한됩니다.
- GitHub variable `ILOG_OPERATIONS_MONITOR_ENABLED=true`일 때만 실행합니다. 중단은 이 값을 `false`로 변경합니다. 키는 `ENVIRONMENT_MATRIX.md`대로 서버 secret에만 저장합니다.
- 실행 로그에는 고정된 상태만 출력합니다. 신고 원문·가족/사용자 ID·비밀키·수신자 주소는 출력하지 않습니다. 전송 실패나 설정 오류는 작업 실패로 표시합니다.

2026-09-03 실제 지정 수신자로 검증 메일을 발송했고 Resend `delivered`를 확인했습니다. 이는 수신 메일 서버 전달 확인이며 사용자의 읽음이나 받은편지함/스팸함 분류까지 보장하지 않습니다. GitHub에서 실행한 [운영 상태 점검](https://github.com/chlwlgus4/ilog/actions/runs/33703060732)은 `healthy / not_needed`, [검증 메일 발송](https://github.com/chlwlgus4/ilog/actions/runs/33703139999)은 `test / accepted`로 성공했습니다. 두 기록은 수동 실행이며, 예약은 활성화된 상태에서 첫 자동 실행을 별도로 확인합니다.

GitHub 예약 실행은 best-effort라 지연·누락될 수 있고, 공개 저장소는 60일간 활동이 없으면 예약 작업이 비활성화될 수 있습니다. GitHub·Resend 자체 장애나 메일 한도 초과 시 이 경로만으로는 알림을 보장할 수 없습니다. 월 1회 작업 실행 이력과 메일 한도, Gmail 스팸함을 확인하고 GitHub Actions 실패 알림도 켭니다. 엄격한 24시간 SLA가 필요하면 독립적인 uptime/dead-man 모니터와 SMS/전화 또는 메신저 보조 채널, 대체 담당자를 추가해야 합니다. 서비스 사용량·용량 알림과 네이티브 앱 크래시 수집은 이 점검에 포함되지 않습니다.

참고: [GitHub 예약 실행 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Resend 중복 발송 방지](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 담당자가 확정할 항목

- 지원 메일 `ilog-support@ilog.io.kr`의 수신 확인과 휴일·부재 시 대체 담당자
- 긴급 신고 1시간, 일반 신고 24시간 최초 검토·72시간 조치/회신, 삭제 예외 3영업일, 일반 문의 2영업일 기준을 실제로 지킬 운영 체계
- GitHub 예약 실행 누락·메일 발송 실패를 확인할 대체 연락처와 부재 시 담당자
- 실제 요청 접수 → 검토 → 조치 → 사용자 회신을 시험한 기록

위 운영 조건, 최신 앱 실기기 검증, 스토어 선언이 끝나기 전 공개 제출을 완료로 판단하지 않습니다. 기준 출처: [Apple App Review Guidelines 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Google Play 사용자 제작 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ko).
