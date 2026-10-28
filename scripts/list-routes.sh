#!/usr/bin/env bash
# Print every static route path found in src/routes (one per line), plus a dynamic count on stderr.
# Shared by deploy-vps.sh (local release) and autodeploy.sh (VPS pull-and-build) so both check the
# same list and a new page can never be shipped without being probed.
#
# Dynamic segments ($id, $slug, ...) are counted but not printed: they cannot be probed without
# real IDs.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dynamic=0

while IFS= read -r file; do
  name="$(basename "${file}" .tsx)"
  [ "${name}" = "__root" ] && continue
  case "${name}" in
    *'$'*) dynamic=$((dynamic + 1)); continue ;;
  esac
  if [ "${name}" = "index" ]; then
    echo "/"
  else
    echo "/$(printf '%s' "${name%.index}" | tr '.' '/')"
  fi
done < <(find "${PROJECT_DIR}/src/routes" -maxdepth 1 -name '*.tsx' | sort)

echo "dynamic=${dynamic}" >&2
