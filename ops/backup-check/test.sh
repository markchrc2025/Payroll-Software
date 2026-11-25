#!/usr/bin/env bash
# PAY-73: run check.sh end to end on this machine, with buckets as folders
# (ops/backup-check/fake-aws stands in for awscli) and a real pg_dump of the
# database at $TEST_DATABASE_URL. Needs the PostgreSQL 18 client and server
# binaries, and root (it runs the check as the postgres user, as the image does).
#   TEST_DATABASE_URL=... sudo -E bash ops/backup-check/test.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pgbin=${PG_BIN:-/usr/lib/postgresql/18/bin}
t=$(mktemp -d /tmp/backup-check-test.XXXXXX)
mkdir -p "$t/bin" "$t/s3/dokploy-backups/postgres/sentire_payroll" "$t/s3/sentire-payroll/tenants/t1" "$t/s3/payroll-backup-reports" "$t/files"
cp "$here/fake-aws" "$t/bin/aws"; chmod +x "$t/bin/aws"
"$pgbin/pg_dump" -Fc "$TEST_DATABASE_URL" | gzip > "$t/s3/dokploy-backups/postgres/sentire_payroll/$(date -u +%FT%H-%M-%S-000Z).sql.gz"
echo "payslip" > "$t/s3/sentire-payroll/tenants/t1/a.pdf"
chown -R postgres "$t"
su postgres -s /bin/bash -c "export PATH=$t/bin:$pgbin:\$PATH FAKE_S3=$t/s3 SRC_S3_BUCKET=dokploy-backups FILES_S3_BUCKET=sentire-payroll REPORT_S3_BUCKET=payroll-backup-reports FILES_DIR=$t/files/files; bash $here/check.sh" || true
jq . "$t/s3/payroll-backup-reports/latest.json"
