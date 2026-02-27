#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/restore.sh <backup-archive.tar.gz> [target-dir]"
  exit 1
fi

archive="$1"
target_dir="${2:-$(pwd)}"

if [ ! -f "${archive}" ]; then
  echo "Backup archive not found: ${archive}"
  exit 1
fi

mkdir -p "${target_dir}"

tar -xzf "${archive}" -C "${target_dir}"

echo "Restore complete to: ${target_dir}"
echo "If Bakarr is running as a service, restart it now."
