#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
OUT_DIR="${2:-${ROOT_DIR}/backups}"

timestamp="$(date +"%Y%m%d-%H%M%S")"
archive="${OUT_DIR}/bakarr-backup-${timestamp}.tar.gz"

mkdir -p "${OUT_DIR}"

paths=(
  "config.toml"
  "data/bakarr.db"
  "images"
)

existing_paths=()
for path in "${paths[@]}"; do
  if [ -e "${ROOT_DIR}/${path}" ]; then
    existing_paths+=("${path}")
  fi
done

if [ "${#existing_paths[@]}" -eq 0 ]; then
  echo "No backup targets found under ${ROOT_DIR}."
  exit 1
fi

tar -czf "${archive}" -C "${ROOT_DIR}" "${existing_paths[@]}"

echo "Backup created: ${archive}"
