#!/usr/bin/env bash
set -euo pipefail

verify() {
  local worktree="$1"
  local expected_head="$2"
  local expected_status="$3"
  local actual_head actual_status

  actual_head="$(git -C "$worktree" rev-parse HEAD)"
  actual_status="$(git -C "$worktree" status --porcelain=v1 -z | sha256sum | cut -d ' ' -f 1)"

  [[ "$actual_head" == "$expected_head" ]] || {
    printf 'HEAD changed: %s\n' "$worktree" >&2
    exit 1
  }
  [[ "$actual_status" == "$expected_status" ]] || {
    printf 'status changed: %s\n' "$worktree" >&2
    exit 1
  }
}

verify "/home/proyectos/jozeuzz-poc-candidata-a" \
  "40e4e5667e6049d2ab951fe0dd9cd5f58f58d541" \
  "19740a57cf4c430b4dcaa8cf73d39e73a3866c3953a5c84b67bb5ef68ae8e02f"
verify "/home/proyectos/jozeuzz/worktrees/historico/poc-drizzle-fix" \
  "5d8a9d918d0fb25bcd4d9c153a39cc5b7c603689" \
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
verify "/home/proyectos/jozeuzz-jz-agents" \
  "cb967b8a3f4b8480e701ce995965632ea5b5601d" \
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
