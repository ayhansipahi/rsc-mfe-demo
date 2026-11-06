#!/usr/bin/env bash
# The orders app reads orders over HTTP from the orders service: logs only, no data grants.
set -euo pipefail
exec "$(dirname "$0")/../../../scripts/lambda-role.sh" rsc-mfe-orders-web
