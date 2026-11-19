#!/usr/bin/env bash
# Installs what the database workflows (backup, restore drill, role inventory) need on
# the self-hosted Oracle runner, whose image is minimal: the PostgreSQL 18 client
# (from the PGDG apt repository), gpg, and the AWS CLI v2 (for Cloudflare R2).
# GitHub's ubuntu-latest machines ship these; ours do not. Safe to run twice.
set -euo pipefail

sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  ca-certificates curl gnupg lsb-release unzip >/dev/null

if [ ! -x /usr/lib/postgresql/18/bin/pg_dump ]; then
  echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | sudo gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/pgdg.gpg
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client-18 >/dev/null
fi
/usr/lib/postgresql/18/bin/pg_dump --version

if ! command -v aws >/dev/null 2>&1; then
  case "$(uname -m)" in
    x86_64|amd64)  AWS_ARCH=x86_64 ;;
    arm64|aarch64) AWS_ARCH=aarch64 ;;
    *) echo "unsupported architecture $(uname -m)"; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" -o "$TMP/awscli.zip"
  unzip -q "$TMP/awscli.zip" -d "$TMP"
  sudo "$TMP/aws/install" --update >/dev/null
  rm -rf "$TMP"
fi
aws --version
gpg --version | head -1
