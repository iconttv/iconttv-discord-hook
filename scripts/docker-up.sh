#!/bin/bash

SCRIPT_DIR=$(dirname $(readlink -f "$0"))
PROJECT_DIR=$(readlink -f "$SCRIPT_DIR/..")

cd "$PROJECT_DIR"

mkdir -p logs/archive

docker compose rm --stop --force --volumes

docker compose up \
  --build \
  --force-recreate \
  --no-deps \
  -d

docker compose logs -f --tail 100
