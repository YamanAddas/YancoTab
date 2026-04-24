#!/usr/bin/env bash
# scripts/guard-bash.sh
#
# PreToolUse hook (matcher: Bash). Reserved for future Bash-command guarding
# (e.g. detecting heredocs that would blow past the file-size cap, or catching
# `npm install` attempts that would violate the no-runtime-deps rule).
#
# Currently a no-op stub. Exits 0 to let the Bash call proceed.

exit 0
