#!/usr/bin/env bash
# Deploys the shell's fragment function. First run: CREATE=1 shells/web/infra/deploy.sh
# Then, once, add it to the distribution:
#   shells/web/infra/cloudfront-vertical.sh <distribution-id> shell <function-endpoint-hostname>
set -euo pipefail
exec "$(dirname "$0")/../../../scripts/lambda-deploy.sh" shells/web rsc-mfe-shell-web
