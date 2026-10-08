#!/bin/sh
# Removes what the daemon-only fork does not build; run it after merging an upstream tag.
set -eu
cd "$(dirname "$0")"

git rm -r -q --ignore-unmatch -- \
    macosx qt gtk po news icons dist release extras cli android \
    .github .tx Transmission.xcodeproj appveyor.yml \
    icon.png CONTRIBUTING.md code_style.sh update-version-h.sh

# Of the documentation only the RPC reference stays.
git ls-files docs | while IFS= read -r file; do
    if [ "$file" != "docs/rpc-spec.md" ]; then
        git rm -q --ignore-unmatch -- "$file"
    fi
done
