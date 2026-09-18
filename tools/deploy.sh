#!/bin/sh
# Build the site and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -e
cd "$(dirname "$0")/.."
REMOTE="$(git remote get-url origin)"
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Deployed. Pages will update in a minute or two."
