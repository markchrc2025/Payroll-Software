# PAY-73: the daily backup check (Mark, 25 Nov 2026: backups stay on RustFS on
# the mail server). PostgreSQL 18 to match the live server, so pg_restore can
# read Dokploy's dumps and a throwaway server is right here to restore into.
# The S3 client is Debian's own awscli package, so nothing is downloaded from
# outside the Debian archive.
FROM postgres:18-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends awscli jq ca-certificates util-linux \
 && rm -rf /var/lib/apt/lists/*
# Built from the repository root (Dokploy build path /).
COPY ops/backup-check/check.sh ops/backup-check/run.sh /opt/backup-check/
# /backups is the files copy; a Docker volume mounted here starts with this
# owner, so the check (running as postgres) can write to it.
RUN chmod +x /opt/backup-check/*.sh && mkdir -p /backups && chown postgres:postgres /backups
USER postgres
WORKDIR /tmp
ENTRYPOINT ["/opt/backup-check/run.sh"]
