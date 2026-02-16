#!/bin/bash

SCRIPT_DIR=$(dirname $(readlink -f "$0"))
PROJECT_DIR=$(readlink -f "$SCRIPT_DIR/..")

cd "$PROJECT_DIR"

mkdir -p logs/archive

docker compose build

docker compose rm --stop --force

docker compose up \
  --force-recreate \
  --no-deps \
  -d

docker compose logs -f --tail 100
