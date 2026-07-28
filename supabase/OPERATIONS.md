# Supabase 운영 복구 절차

이 문서는 아이로그 운영 Supabase 프로젝트의 데이터 복구와 권한 검증을 위한 실행 기준이다. 운영 DB에 `db push`, `db pull`, `migration repair`, `db reset`을 실행하지 않는다.

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

## 현재 마이그레이션 이력 불일치

운영 원격 이력에는 로컬에 없는 버전이 있고, 로컬에도 원격에 없는 버전이 있다. 이 상태에서 `migration repair`, `db pull`, `db push`를 사용하면 이미 적용된 테이블, 함수, RLS 정책이 중복되거나 누락될 수 있다.

정합화 순서:

1. 암호화 백업과 무결성 검증을 완료한다.
2. 원격 전용 migration의 원본 SQL을 Git 과거 이력, 이전 개발 PC, 배포 산출물에서 확보한다.
3. 빈 로컬/검증 프로젝트에서 전체 체인을 적용하고 `family_rls_isolation.sql`을 통과시킨다.
4. 함수, RLS, 트리거, grant 차이를 비교한다.
5. 그 결과를 바탕으로 운영 이력 보정 여부를 별도 승인 후 결정한다.

운영 이력 보정은 독립된 작업으로 취급하며, 백업과 복구 검증 없이 실행하지 않는다.
