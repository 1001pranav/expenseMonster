# ExpenseMonster

An offline household finance app for Android (Expo / React Native). It tracks expenses, income, loans and EMIs, credit cards, bills and insurance. There is no backend: data lives encrypted on the phone and moves between family phones as encrypted files.

## Features

| Area | What it does |
|---|---|
| Transactions | Expense, income, transfer and settlement. Category splits, equal split with family members, private entries |
| Capture | **Payment screenshots**: share from GPay / PhonePe / Paytm, read on the phone with ML Kit OCR. **Paste a bank SMS**: the app never asks for SMS permission or reads your inbox; copy a bank message and paste it, or add entries manually. **Teach your bank's format**: paste a sample and tap the amount, payee, date and so on; only a pattern is stored, and it is shared with family phones. Every capture goes to a **Review** inbox and nothing is booked until you approve it. Duplicates are detected by UPI ref, or same amount within ±10 min |
| Loans & EMIs | Borrowed and lent loans, reducing or flat interest, amortisation schedule, prepayment simulator, overdue EMIs |
| Credit cards | Statement day and due day per card. Purchases on or before the statement day go on this bill; anything after goes on the next one. Refunds reduce the cycle. Bill payments are **transfers, not expenses**, so spending is never counted twice. Bank statement amounts can override the computed total |
| Bills | Variable bills (electricity/water/gas, with units), fixed bills (rent/internet, created each cycle automatically), prepaid recharges (validity tracking), LPG (predicts the next booking), autopay (warns if no debit shows up) |
| Insurance | Premiums and renewals with alerts 30, 7 and 1 day before |
| Reminders | Local notifications for every due item, with **Pay now / Mark paid / Snooze** actions |
| Payments | UPI hand-off (`upi://pay`) to any UPI app. The app then asks whether the payment succeeded, because UPI apps don't report the result back |
| Household | Members, who-owes-whom, simplified settle-up |
| Insights | Category donut, 12-month income vs expense, savings trend, daily heat-calendar, budgets, card spend, debt payoff projection |

## Data storage

- SQLite with **SQLCipher**. The 256-bit key is generated on first launch and kept in the Android Keystore (`expo-secure-store`).
- Money is stored as **integer paise**. Calendar dates are local `YYYY-MM-DD` strings.
- Every row has `id` (UUID v7), `createdAt`, `updatedAt`, `deletedAt` (soft delete, so deletions sync), `deviceId` and `scope` (`personal` | `household`).
- Schema lives in `src/db/schema.ts` and migrations are append-only (`PRAGMA user_version`).

## Phone-to-phone sharing

1. **Pair once:** Household → Sync → *Show my QR* on one phone, *Scan to join* on the other. The QR carries a household AES key, and both phones show the same fingerprint.
2. **Send:** builds the household rows changed since the last send to that phone, gzips them, encrypts them with **AES-256-GCM** (household id as associated data) and opens the share sheet (WhatsApp, Nearby Share, Bluetooth…).
3. **Receive:** *Receive file*, then pick the `.emx` file.
4. **Merge:** rows changed on only one side are applied, and tombstones carry deletions. Re-importing the same file is a no-op. All timestamps are UTC ISO-8601.
5. **Conflicts** (the same entry changed on both phones since the last sync). You choose the policy in Sync:
   - **Ask me** (default): both versions are shown side by side and you keep mine or use theirs, per entry or for all. *Keep mine* re-stamps the entry so it wins on the other phone after your next send.
   - **Newest edit:** the later UTC timestamp wins, with `deviceId` as tie-break. The import warns if the sender's clock looks ahead.
   - **File wins:** the opened file overwrites this phone. Opening an *old* file undoes newer edits.

Rows marked **private** never leave the phone.

## Optional cloud sync (Supabase)

Off by default. When a phone turns it on (Sync → *Sync through the cloud*), it swaps the same encrypted bundles automatically instead of you sending files:

- **The server can't read your data.** Each upload is a sealed `EMX1.` bundle, exactly like a `.emx` file. The household key never leaves the paired phones.
- **Mailbox:** bundles are stored under `HKDF-SHA256(household key, household id)`, so only paired phones can address them. The table is closed to clients; the only way in is two `SECURITY DEFINER` functions (`emx_push`, `emx_pull`), so mailboxes can't be listed.
- **When it syncs:** when the app opens or returns to the foreground, about 10 s after an edit, and when you tap *Sync now*. Each run downloads new bundles from other phones, merges them with your chosen conflict policy, then uploads changes made since this phone's last upload.
- **Retention:** bundles older than 90 days are deleted. Every phone re-uploads all household rows every 30 days, so a phone that joins later still gets old entries. A phone that has been offline for more than 90 days should use *Send all* / *Receive* once.
- **What the server can see:** the mailbox id, device ids, bundle sizes and timestamps (when your household is active), but not amounts, payees or names.

Setup:

1. Create a Supabase project and run `supabase/migrations/20261002000000_emx_cloud_sync.sql` (SQL editor, or `supabase db push`).
2. Give the build the project URL and the **publishable / anon** key (never the `service_role` / secret key). They are compiled into the APK; nothing is fetched at runtime:
   - **Local builds:** `cp .env.example .env.local` and fill it in. The file is git-ignored.
   - **GitHub Actions:** the build job uses the `DEV` environment (**Settings → Environments → DEV**). Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` there as variables (they end up in the APK anyway, so they aren't secret), or add one secret `APP_ENV` holding the same lines as `.env.local`. If both are set, the separate values win. Repository-level secrets and variables still work too.

   Without them, the cloud option is hidden. A test fails the build if a secret / service_role key is set.

The anon key ships inside the APK, so anyone can call the two functions. They can't read anything they don't hold the key for, junk uploads fail to decrypt and are skipped, and `emx_push` caps uploads per mailbox per hour.

## Optional cloud backup (password-encrypted)

Off by default. Settings → *Cloud backup* keeps a copy of **everything on the phone, private entries included**, on the same Supabase project, so a lost or replaced phone can be restored. It is separate from household cloud sync and works without pairing.

- **Password stays on the phone.** The key is derived on the phone (PBKDF2-SHA256, 300k rounds, random salt) and the snapshot is sealed with AES-256-GCM before upload. Neither the password nor the key is sent or stored on the server. The derived key is kept in the Keystore so background backups don't ask for the password; the password itself is never saved.
- **Recovery code.** Each backup gets a random 24-character code (`XXXX-XXXX-…`, 120 bits). The server finds the backup by this code, never by the password, so equal passwords never collide and the server can't be probed with password guesses. Restoring on a new phone needs the code **and** the password. Forget the password and the backup cannot be opened by anyone.
- **What the server stores** (`emx_vaults`): the code, the salt and round count, the ciphertext, a version number, and `sha256` of a random write token. The token travels inside the encrypted payload, so only phones that opened the backup can overwrite or delete it.
- **When it runs:** with the same triggers as cloud sync (app opened, about 10 s after an edit, *Back up now*). Each run checks the version; if another phone changed the backup it downloads, merges (newest edit wins) and then uploads one snapshot if anything changed. Writes are compare-and-swap on the version, so two phones never overwrite each other's edits.
- **Change password:** asks for the current one, re-encrypts with a new salt. Other phones using the backup ask for the new password once.
- **Turn off:** forgets the key on this phone; optionally deletes the backup from the cloud.

Setup: run `supabase/migrations/20261008000000_emx_vault.sql` as well. It only adds a new table and functions and leaves the household mailbox alone.

## Financial health and the optional on-device assistant

**Financial health** (Insights) is plain code, so it works on every phone. It shows the savings rate and EMIs as a share of income (both averaged over the last 3 complete months), credit card utilisation, and this month's budgets. Each is rated good / watch / risk against common thresholds: saving 20%+, EMIs ≤30% (≤50% at most), utilisation ≤30%. Source: `src/domain/health.ts`.

**Assistant (optional model pack).** Settings → *On-device assistant* downloads Google's Gemma 4 E2B (about 2.6 GB, SHA-256 verified) into app-private storage. The LiteRT-LM runtime ships in the APK through [`expo-ai-kit`](https://github.com/saidkaban/expo-ai-kit) and adds about 21 MB. Removing the pack frees the space. Questions and data never leave the phone; the download is the only network use.

How answers stay honest:
- The model never sees the database. It calls **read-only tools** (`src/domain/assistant/tools.ts`) that run the same domain code as the screens and return pre-formatted figures (`"₹12,400"`, `"34%"`). No tool can write, pay or send anything.
- **Number check** (`grounding.ts`): every number in a reply must appear in a tool result, the question, or an earlier verified answer. If it doesn't, the model is asked once more with the bad numbers named. If it still fails, the app shows the tool figures directly instead of the model's text (`answer.ts`).
- Payee names and notes are clipped and marked as data in the system prompt (prompt-injection guard). The prompt also rules out specific investment, insurance and tax recommendations.
- The model is unloaded after 2 minutes idle and whenever the app goes to the background, freeing about 1.5 GB.

Device gate: hidden below 4 GB RAM and on emulators. Phones with 4–6 GB get a "will be slow" warning.

## Home screen: shortcuts and widget

- **Shortcuts:** long-press the app icon for **Expense, Scan, Dues, Ask**. Each can also be dragged onto the home screen as its own icon. They appear right after install.
- **Quick add widget:** long-press the home screen → Widgets → ExpenseMonster → *Quick add*. It's a resizable bar with **Expense / Income / Scan** buttons; the logo opens the app.

Both are deep links on `expensemonster://`, so Expo Router opens the screen and the app lock still covers it. The widget deliberately **shows no amounts**: home-screen widgets sit outside the app lock and screenshot blocking. Both are generated at prebuild by `plugins/withAndroidShortcuts.js` and `plugins/withAndroidWidget.js`. Icons come from `assets/source/render-glyphs.sh`.

## Security

- App lock: biometrics and/or a 6-digit PIN. The PIN is stored as a salted PBKDF2 hash in the Keystore. Auto-lock timeout is configurable, and you can opt in to an erase after 10 wrong PINs.
- `FLAG_SECURE` blocks screenshots and the recent-apps preview. You can turn it off.
- Nothing is sent over the network unless you turn on cloud sync (end-to-end encrypted household rows) or cloud backup (everything, encrypted with your password). ML Kit's bundled model works offline.
- Raw SMS text is never stored, only the parsed fields plus a hash. Only the last 4 digits of cards and accounts are kept. Captured screenshots are deleted after approval by default.
- Backups are encrypted with your passphrase (PBKDF2-SHA256 → AES-GCM). CSV export escapes formula characters.

## Build and run

Needs Node 20+, and for local builds the Android SDK and JDK 17. Expo Go won't work because ML Kit and SQLCipher are native code.

```bash
npm install
npx expo run:android            # dev build on a connected phone / emulator
# or with EAS (cloud build):
npx eas-cli@latest build -p android --profile development   # dev client
npx eas-cli@latest build -p android --profile preview       # sideloadable APK
npx eas-cli@latest build -p android --profile play          # Play Store bundle (AAB)
```

### Production APK via GitHub Actions

`.github/workflows/android-release.yml` builds the production APK on GitHub. Push a tag (`git tag v1.0.1 && git push origin v1.0.1`) and the APK is attached to a GitHub Release. You can also run the workflow manually from the Actions tab (artifact only).

**Set a signing key before relying on it.** Without one, each build gets a different debug signature. Android then refuses to update, and uninstalling deletes all on-phone data. One-time setup:

```bash
keytool -genkeypair -v -keystore expensemonster.keystore -alias expensemonster -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 expensemonster.keystore   # → secret ANDROID_KEYSTORE_BASE64
```
In **Settings → Environments → DEV**, add the secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`, plus `ANDROID_KEY_ALIAS` (`expensemonster`; a secret or a variable). `ANDROID_KEY_PASSWORD` is only needed if your key has its own password; keystores made by current `keytool` (PKCS12) use the keystore password for both. The *Check build configuration* step on each run shows which values are missing or wrong. Back up the keystore: if you lose it, you can never update the installed app.

## Checks

```bash
npm run typecheck   # tsc
npm run lint        # eslint (expo config)
npm test            # jest: domain logic (EMI, card cycles, bills, parsers, sync crypto/merge…)
```

## Project layout

```
src/app/            expo-router screens ((tabs)/ Home · Activity · Dues · Household, plus flows)
src/domain/         pure TypeScript business logic + tests (no React / native imports)
  parsers/          bank SMS + screenshot / bill OCR parsers
  sync/             bundle format, AES-GCM envelope, merge rules
src/db/             schema, migrations, SQLCipher client, repository, in-memory store
src/data/           app actions (mark paid, captures…) and React hooks
src/services/       OCR, pasted-SMS capture, notifications, UPI, sync/backup, secure storage
src/ui/             theme, components, charts, forms
```

## Known limitations

- Native features (OCR, biometrics, notifications, UPI, SQLCipher) have to be tested on a device. CI covers the domain logic and type/lint checks only.
- OCR and SMS parsing are heuristic. That is why everything goes through Review. Bank SMS formats change, so add new samples to `src/domain/__tests__/sms.test.ts` when one isn't recognised.
- Sync is manual (file based), not real-time.
- Receiving `.emx` files works through *Receive file*. The app only registers for shared images so it doesn't clutter every share sheet.
