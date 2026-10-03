#!/usr/bin/env bash
# Decodes $ANDROID_KEYSTORE_BASE64 into the file given as $1. Shared by the configuration check and
# the signing step so both read the secret the same way.
#
# Tolerates what common encoders add: line wrapping, Windows line endings, surrounding quotes,
# `certutil -encode` BEGIN/END lines, URL-safe characters, missing padding, and a few stray
# characters picked up while copying (e.g. the `%` zsh shows after output with no final newline).
# Dropping those is safe: they aren't base64, so they carry no key data, and a damaged keystore
# would still fail the password/integrity check afterwards. Anything dropped is described on
# stderr (exit 0). On failure it prints a reason on stderr without revealing the value, and exits 1.
set -uo pipefail
export LC_ALL=C
MAX_STRAY=8

out=${1:?usage: decode-keystore.sh <output file>}
raw=${ANDROID_KEYSTORE_BASE64:-}

clean=$(printf '%s' "$raw" | tr -d '\r' | grep -v -- '^-----' | tr -d " \t\n\"'" | tr -- '-_' '+/')
stray=$(printf '%s' "$clean" | tr -d 'A-Za-z0-9+/=')
note=""
if [ -n "$stray" ] && [ ${#stray} -le $MAX_STRAY ]; then
  for (( i = 0; i < ${#stray}; i++ )); do
    c=${stray:i:1}
    pre=${clean%%"$c"*}
    pos=$(( ${#pre} + 1 ))
    if [ $pos -eq 1 ]; then where="at the start"; elif [ $pos -eq ${#clean} ]; then where="at the end"
    else where="at character $pos of ${#clean}"; fi
    if [[ $c =~ [[:graph:]] ]]; then shown="'$c'"; else shown=$(printf '0x%02X' "'$c"); fi
    note+="${note:+, }$shown $where"
  done
  note="Ignored ${#stray} stray character(s) that aren't base64: $note. Probably copied along with the value; the rest decoded fine."
  clean=$(printf '%s' "$clean" | tr -cd 'A-Za-z0-9+/=')
fi
while [ $(( ${#clean} % 4 )) -ne 0 ] && [ $(( ${#clean} % 4 )) -ne 1 ]; do clean="$clean="; done

# A keystore starts with a DER sequence (PKCS12, keytool's default) or the JKS/JCEKS magic number.
# Checking that keeps a lenient decode of some other text from passing as a keystore.
is_keystore() {
  case $(head -c 4 "$1" | od -An -tx1 | tr -d ' \n') in 30*|feedfeed|cececece) return 0 ;; *) return 1 ;; esac
}

if [ -n "$clean" ] && printf '%s' "$clean" | base64 -d > "$out" 2>/dev/null && [ -s "$out" ] && is_keystore "$out"; then
  [ -n "$note" ] && echo "$note" >&2
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
elif [ ${#stray} -gt $MAX_STRAY ]; then
  echo "Contains ${#stray} characters that are not base64, so it isn't base64 text: probably the raw keystore file or other text was pasted."
elif [ $(( ${#clean} % 4 )) -eq 1 ]; then
  echo "Length (${#clean} characters) can't be complete base64: the value was probably cut off while copying."
elif [ ${#clean} -lt 1000 ]; then
  echo "Too short for a keystore (${#clean} characters; a keystore is usually 2,500+). It may be cut off, or not the keystore at all."
else
  echo "Decodes, but not to a keystore (${#clean} characters). Make sure you encoded the .keystore/.jks file keytool created, and that nothing was cut off."
fi >&2
exit 1
