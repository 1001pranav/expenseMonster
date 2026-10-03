#!/usr/bin/env bash
# Reports which build settings are present and whether each looks right, without printing any
# value. Prints a table to the log and the run summary. Exits 1 if a value is set but wrong, so a
# bad secret fails in seconds instead of after a 20-minute Gradle build. Missing optional values
# only warn: the build still works without cloud sync or a release key.
#
# Reads: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, ANDROID_KEYSTORE_BASE64,
#        ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
set -uo pipefail

ROWS=()
ERRORS=0
WARNINGS=0

row() { # name, status (OK|MISSING|INVALID|WARN), note
  ROWS+=("$1|$2|$3")
  case $2 in
    INVALID) ERRORS=$((ERRORS + 1)); echo "::error title=$1::$3" ;;
    MISSING | WARN) WARNINGS=$((WARNINGS + 1)); echo "::warning title=$1::$3" ;;
  esac
}

# Role claim of a legacy JWT key ("anon" / "service_role"), empty if it isn't one.
jwt_role() {
  local p
  p=$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')
  while [ $(( ${#p} % 4 )) -ne 0 ]; do p="$p="; done
  printf '%s' "$p" | base64 -d 2>/dev/null | jq -r '.role // empty' 2>/dev/null
}

# --- Cloud sync (Supabase) --------------------------------------------------------------------
URL=${EXPO_PUBLIC_SUPABASE_URL:-}
KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}

if [ -z "$URL" ]; then
  row EXPO_PUBLIC_SUPABASE_URL MISSING "Not set: cloud sync is left out. Add it in Settings → Environments → DEV."
elif [[ $URL =~ [[:space:]\"\'] ]]; then
  row EXPO_PUBLIC_SUPABASE_URL INVALID "Contains spaces or quotes. Paste only the URL."
elif [[ $URL =~ ^https://[a-z0-9-]+\.supabase\.co/?$ ]]; then
  row EXPO_PUBLIC_SUPABASE_URL OK "Supabase project URL"
elif [[ $URL =~ ^https:// ]]; then
  row EXPO_PUBLIC_SUPABASE_URL WARN "https but not *.supabase.co. Fine for a custom domain, otherwise copy Project Settings → Data API → Project URL."
else
  row EXPO_PUBLIC_SUPABASE_URL INVALID "Must start with https://, e.g. https://abcd.supabase.co"
fi

if [ -z "$KEY" ]; then
  row EXPO_PUBLIC_SUPABASE_ANON_KEY MISSING "Not set: cloud sync is left out. Use the publishable key (sb_publishable_…)."
elif [[ $KEY == sb_secret_* ]]; then
  row EXPO_PUBLIC_SUPABASE_ANON_KEY INVALID "This is the SECRET key and would ship inside the APK. Use the publishable key (sb_publishable_…), then rotate this secret key in Supabase."
elif [[ $KEY == sb_publishable_* ]]; then
  row EXPO_PUBLIC_SUPABASE_ANON_KEY OK "Publishable key"
elif [[ $KEY == eyJ* ]]; then
  case $(jwt_role "$KEY") in
    anon) row EXPO_PUBLIC_SUPABASE_ANON_KEY OK "Legacy anon JWT" ;;
    service_role) row EXPO_PUBLIC_SUPABASE_ANON_KEY INVALID "This is the service_role key and would ship inside the APK. Use the anon / publishable key, then rotate the service_role key." ;;
    *) row EXPO_PUBLIC_SUPABASE_ANON_KEY INVALID "Looks like a JWT but has no anon role. Copy it again from Project Settings → API Keys." ;;
  esac
else
  row EXPO_PUBLIC_SUPABASE_ANON_KEY INVALID "Not a Supabase publishable (sb_publishable_…) or anon (eyJ…) key."
fi

if { [ -n "$URL" ] && [ -z "$KEY" ]; } || { [ -z "$URL" ] && [ -n "$KEY" ]; }; then
  row "Cloud sync" INVALID "Only one of the two Supabase values is set. Set both, or neither."
fi

# --- Release signing --------------------------------------------------------------------------
SIGN_VARS=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
MISSING_SIGN=()
for v in "${SIGN_VARS[@]}"; do [ -z "${!v:-}" ] && MISSING_SIGN+=("$v"); done

if [ ${#MISSING_SIGN[@]} -eq ${#SIGN_VARS[@]} ]; then
  row "Release signing" MISSING "No ANDROID_* secrets: APK is debug-signed, and later builds won't install over it."
elif [ ${#MISSING_SIGN[@]} -gt 0 ]; then
  row "Release signing" INVALID "Missing secret(s): ${MISSING_SIGN[*]}. Add all four, as secrets (not variables)."
else
  KS=$(mktemp)
  trap 'rm -f "$KS"' EXIT
  if ! printf '%s' "$ANDROID_KEYSTORE_BASE64" | tr -d ' \r\n\t' | base64 -d > "$KS" 2>/dev/null || [ ! -s "$KS" ]; then
    row ANDROID_KEYSTORE_BASE64 INVALID "Not valid base64. Create it with: base64 -w0 expensemonster.keystore"
  else
    export KSP="$ANDROID_KEYSTORE_PASSWORD" KP="$ANDROID_KEY_PASSWORD"
    if ! out=$(keytool -list -keystore "$KS" -storepass:env KSP 2>&1); then
      if grep -qi 'password' <<< "$out"; then
        row ANDROID_KEYSTORE_PASSWORD INVALID "Wrong keystore password."
      else
        row ANDROID_KEYSTORE_BASE64 INVALID "Decoded file is not a keystore: $(head -1 <<< "$out")"
      fi
    else
      row ANDROID_KEYSTORE_BASE64 OK "Valid keystore"
      row ANDROID_KEYSTORE_PASSWORD OK "Opens the keystore"
      if ! info=$(keytool -list -v -keystore "$KS" -storepass:env KSP -alias "$ANDROID_KEY_ALIAS" 2>&1); then
        aliases=$(keytool -list -v -keystore "$KS" -storepass:env KSP 2>/dev/null | grep -oP '^Alias name: \K.*' | paste -sd, -)
        row ANDROID_KEY_ALIAS INVALID "Alias not in the keystore. Aliases found: ${aliases:-none}"
      else
        row ANDROID_KEY_ALIAS OK "Found"
        # certreq needs the private key, so it only succeeds with the right key password.
        if keytool -certreq -keystore "$KS" -storepass:env KSP -alias "$ANDROID_KEY_ALIAS" -keypass:env KP > /dev/null 2>&1; then
          row ANDROID_KEY_PASSWORD OK "Unlocks the key"
        else
          row ANDROID_KEY_PASSWORD INVALID "Wrong key password for alias $ANDROID_KEY_ALIAS."
        fi
        # Public certificate details: safe to show, and the fingerprint tells you whether two
        # builds were signed with the same key (they must be, for updates to install).
        sha=$(grep -m1 -oP 'SHA256:\s*\K\S+' <<< "$info")
        until=$(grep -m1 -oP 'until:\s*\K.*' <<< "$info")
        row "Signing certificate" OK "SHA-256 ${sha:-?}, valid until ${until:-?}"
      fi
    fi
  fi
fi

# --- Report -----------------------------------------------------------------------------------
{
  echo "### Build configuration"
  echo
  echo "| Setting | Status | Note |"
  echo "|---|---|---|"
  for r in "${ROWS[@]}"; do
    IFS='|' read -r n s note <<< "$r"
    case $s in OK) icon="✅" ;; MISSING | WARN) icon="⚠️" ;; *) icon="❌" ;; esac
    echo "| \`$n\` | $icon $s | $note |"
  done
  echo
  echo "Values are never printed. Errors: $ERRORS, warnings: $WARNINGS."
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

[ "$ERRORS" -eq 0 ]
