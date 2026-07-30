# Supabase 운영 복구 절차

이 문서는 아이로그 운영 Supabase 프로젝트의 데이터 복구와 권한 검증을 위한 실행 기준이다. 운영 DB에 `db push`, `db pull`, `migration repair`, `db reset`을 확인 없이 실행하지 않는다.

## 백업 범위

`scripts/create_encrypted_supabase_backup.sh`는 다음을 AES-256으로 암호화해 저장한다.

- Postgres 스키마와 데이터
- 데이터베이스 역할 정의
- 원격/로컬 마이그레이션 이력과 로컬 SQL 체크섬

Supabase Storage의 실제 사진 파일 바이트는 Postgres 덤프에 포함되지 않는다. `storage.objects` 메타데이터만 데이터 덤프에 들어갈 수 있으므로, 사진을 운영 복구 범위에 포함하려면 Storage 버킷도 별도 내보내기와 복구 검증을 해야 한다.

## 암호화 백업 만들기

백업 암호는 로컬 `.env`, 저장소, 셸 히스토리에 기록하지 않는다. macOS Keychain 같은 별도 비밀 저장소에서 일시적으로 주입한다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss
ILOG_BACKUP_PASSPHRASE="$(security find-generic-password -a "$USER" -s ilog-supabase-production-backup -w)" \
  ./scripts/create_encrypted_supabase_backup.sh
```

기본 저장 위치는 `~/Library/Application Support/ilog/backups`이며, 암호화 파일과 SHA-256 체크섬이 생성된다.

### Storage 백업

가족 사진과 채팅 첨부파일은 `family-media` Storage 버킷에 있으므로 DB 백업과 별도로 백업한다.

```bash
ILOG_BACKUP_PASSPHRASE="$(security find-generic-password -a "$USER" -s ilog-supabase-production-backup -w)" \
  ./scripts/create_encrypted_supabase_storage_backup.sh
```

이 명령은 연결된 운영 프로젝트에서 파일을 **읽기만** 하며, 객체를 수정하거나 삭제하지 않는다.

## 무결성 확인

복구 전에 항상 암호화 해제와 아카이브 체크섬을 확인한다.

```bash
ILOG_BACKUP_PASSPHRASE="$(security find-generic-password -a "$USER" -s ilog-supabase-production-backup -w)" \
  ./scripts/verify_encrypted_supabase_backup.sh \
  "$HOME/Library/Application Support/ilog/backups/ilog-supabase-db-YYYYMMDDTHHMMSSZ.tar.gz.enc"
```

이 명령은 아카이브 무결성만 확인한다. 복구 가능 여부는 격리된 검증 프로젝트 또는 로컬 Supabase에서 별도로 검증해야 한다.

Storage 백업도 별도로 확인한다.

```bash
ILOG_BACKUP_PASSPHRASE="$(security find-generic-password -a "$USER" -s ilog-supabase-production-backup -w)" \
  ./scripts/verify_encrypted_supabase_storage_backup.sh \
  "$HOME/Library/Application Support/ilog/backups/ilog-supabase-storage-YYYYMMDDTHHMMSSZ.tar.gz.enc"
```

## 격리된 로컬 DB 복구

운영 DB에는 절대 복구하지 않는다. 아래 복구 스크립트는 운영 프로젝트 ref를 포함한 URL을 거부하고, `ILOG_CONFIRM_ISOLATED_RESTORE=yes`가 있을 때만 실행된다.

```bash
ILOG_CONFIRM_ISOLATED_RESTORE=yes \
ILOG_BACKUP_PASSPHRASE="$(security find-generic-password -a "$USER" -s ilog-supabase-production-backup -w)" \
ILOG_ISOLATED_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
./scripts/restore_supabase_backup_to_isolated_local.sh \
  "$HOME/Library/Application Support/ilog/backups/ilog-supabase-db-YYYYMMDDTHHMMSSZ.tar.gz.enc"
```

`families`/`caregivers`와 `timeline_comments`에는 순환 외래키가 있으므로, 격리된 로컬 복구 중에만 트리거를 잠시 비활성화한다. DB 역할은 복구하지 않는다. Storage 복구는 격리 프로젝트의 버킷과 정책을 준비한 뒤 별도로 수행한다.

## 마이그레이션과 RLS 검증

운영과 연결되지 않은 로컬 Supabase에서만 전체 로컬 마이그레이션과 가족 A/B 격리를 확인한다.

```bash
cd /Users/choijihyeon/IdeaProjects/babyboss
npx supabase start
./scripts/validate_supabase_migrations_local.sh
```

검증 SQL은 두 개의 독립된 가족과 인증 사용자를 만들고, 다음을 확인한 뒤 트랜잭션을 롤백한다.

- 가족 A와 B는 서로의 기록과 사진 메타데이터를 조회하지 못한다.
- 가족 A와 B는 상대 가족에 기록을 생성하지 못한다.
- 비공개 `family-media` Storage 객체도 자기 가족 경로만 조회된다.

## 2026-07-28 마이그레이션 이력 정합화 결과

운영 원격 이력과 로컬 파일 이력의 불일치는 정리되었습니다. 이 작업은 운영 스키마나 사용자 데이터를 다시 적용하지 않고, 확인된 사실을 기준으로 migration history 메타데이터만 보정했습니다.

1. AES-256 암호화 백업과 스키마·데이터·Storage 객체 체크섬 검증을 먼저 완료했습니다.
2. 운영 DB 카탈로그를 읽기 전용으로 점검해 로컬 전용 12개 migration의 테이블·RPC·RLS·권한 결과가 이미 실제 스키마에 있음을 확인했습니다.
3. 원격 전용 14개 과거 버전은 동일 기능을 재실행하지 않는 no-op migration 파일로 로컬에 보존했습니다.
4. 이미 반영된 12개 버전에 한해 `migration repair --status applied`를 사용해 원격 history만 보정했습니다.
5. `npx supabase migration list`에서 로컬과 원격 버전이 모두 일치하고, `npx supabase db push --linked --dry-run`은 원격 DB가 최신이라고 확인했습니다.

### 이후 운영 원칙

- 새 migration은 로컬 SQL 파일 작성, Git 검토·커밋, 검증용 프로젝트 적용, 운영 적용 순서를 지킨다.
- 운영에서 `db pull`, `db push`, `migration repair`, Dashboard SQL을 실행하기 전에는 백업, 대상 스키마 비교, 영향 검토를 남긴다.
- 빈 검증 프로젝트에서 전체 migration 체인을 재현하고, 가족 A/B RLS 격리와 백업 복구 훈련을 완료하기 전에는 이 항목들을 별도 출시 검증 미완료로 유지한다.
