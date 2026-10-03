#!/usr/bin/env bash
# Decodes $ANDROID_KEYSTORE_BASE64 into the file given as $1. Shared by the configuration check and
# the signing step so both read the secret the same way.
#
# Tolerates what common encoders add: line wrapping, Windows line endings, surrounding quotes,
# `certutil -encode` BEGIN/END lines, URL-safe characters and missing padding. On failure it prints
# a reason on stderr that describes the value without revealing it, and exits 1.
set -uo pipefail

out=${1:?usage: decode-keystore.sh <output file>}
raw=${ANDROID_KEYSTORE_BASE64:-}

clean=$(printf '%s' "$raw" | tr -d '\r' | grep -v -- '^-----' | tr -d " \t\n\"'" | tr -- '-_' '+/')
while [ $(( ${#clean} % 4 )) -ne 0 ] && [ $(( ${#clean} % 4 )) -ne 1 ]; do clean="$clean="; done

if [ -n "$clean" ] && printf '%s' "$clean" | base64 -d > "$out" 2>/dev/null && [ -s "$out" ]; then
  exit 0
fi

rm -f "$out"
trimmed=$(printf '%s' "$raw" | tr -d '\r' | grep -v -- '^-----' | tr -d '\n')
if [ -z "$clean" ]; then
  echo "The secret is empty once header lines and spaces are removed."
elif [ ${#trimmed} -lt 300 ] && { [[ $trimmed =~ \.(keystore|jks|p12|pfx)[[:space:]\"\']*$ ]] || [[ $trimmed =~ ^[\"\']?([A-Za-z]:\\|~/|/|\./) ]]; }; then
  echo "Looks like a file path. Paste the base64 of the file's contents, not its name."
elif [[ $trimmed =~ [A-Za-z]{3,}[[:space:]]+[A-Za-z]{3,} ]]; then
  echo "Contains ordinary words, e.g. an error message from the encoding command. Re-run the command for your OS and copy only its output."
elif printf '%s' "$clean" | grep -q '[^A-Za-z0-9+/=]'; then
  echo "Contains characters that are not base64 ($(printf '%s' "$clean" | tr -d 'A-Za-z0-9+/=' | wc -c) of them). It may be the raw keystore file instead of its base64."
elif [ $(( ${#clean} % 4 )) -eq 1 ]; then
  echo "Length (${#clean} characters) can't be complete base64: the value was probably cut off while copying."
else
  echo "Not decodable (${#clean} characters). The value was probably cut off or edited while copying."
fi >&2
exit 1
