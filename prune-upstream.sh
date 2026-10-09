#!/bin/sh
# Removes what the daemon-only fork does not build; run it after merging an upstream tag.
set -eu
cd "$(dirname "$0")"

git rm -r -q --ignore-unmatch -- \
    macosx qt gtk po news icons dist release extras cli android \
    .github .tx Transmission.xcodeproj appveyor.yml \
    icon.png CONTRIBUTING.md code_style.sh update-version-h.sh

# Upstream's web client; web/ holds the fork's own, with its own package.json.
git rm -r -q --ignore-unmatch -- \
    web/assets web/public_html web/CMakeLists.txt web/README.md \
    web/esbuild.mjs web/generate-buildonly.js web/package.json.buildonly \
    web/prettier.config.js web/stylelint.config.js web/.nvmrc web/.prettierignore
git ls-files 'web/src/*.js' | while IFS= read -r file; do
    git rm -q --ignore-unmatch -- "$file"
done

# Of the documentation only the RPC reference stays.
git ls-files docs | while IFS= read -r file; do
    if [ "$file" != "docs/rpc-spec.md" ]; then
        git rm -q --ignore-unmatch -- "$file"
    fi
done
