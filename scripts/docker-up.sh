#!/bin/bash 

SCRIPT_DIR=$(dirname $(readlink -f "$0"))
PROJECT_DIR=$(readlink -f "$SCRIPT_DIR/..")

cd "$PROJECT_DIR/docker"

docker compose rm --force

docker compose up \
  --build \
  --force-recreate \
  --no-deps \
  -d