#! /bin/bash
set -e
set -x

[[ -f secret.sh ]] && source secret.sh
TAG=$1

shift
FILES=$@

upload_url=$(curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/jiachengpan/bitmex-dataset/releases/tags/$TAG" |
  jq '.upload_url' | sed 's#{.*}##' | sed 's#"##g')

for FILE in ${FILES}; do
  curl \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: $(file -b --mime-type $FILE)" \
    --data-binary @$FILE \
    "${upload_url}?name=$(basename $FILE)"
done
