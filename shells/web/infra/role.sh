#!/usr/bin/env bash
# The shell function serves static fragments: logs only.
set -euo pipefail
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-shell-web
