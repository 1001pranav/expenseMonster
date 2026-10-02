# ExpenseMonster

An offline household finance app for Android (Expo / React Native). It tracks expenses, income, loans and EMIs, credit cards, bills and insurance. There is no backend: data lives encrypted on the phone and moves between family phones as encrypted files.

## Features

| Area | What it does |
|---|---|
| Transactions | Expense, income, transfer and settlement. Category splits, equal split with family members, private entries |
| Capture | **Payment screenshots**: share from GPay / PhonePe / Paytm, read on the phone with ML Kit OCR. **Bank SMS is optional**: the app asks once and reads nothing unless you allow it (and stops if the permission is revoked). Without it, **paste a bank SMS** or add entries manually. **Teach your bank's format**: paste a sample and tap the amount, payee, date and so on; only a pattern is stored, and it is shared with family phones. Every capture goes to a **Review** inbox and nothing is booked until you approve it. Duplicates are detected by UPI ref, or same amount within ±10 min |
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
   - **GitHub Actions:** repository **Settings → Secrets and variables → Actions → New repository secret**, named `APP_ENV`, with the same lines as `.env.local` as its value.

   Without them, the cloud option is hidden. A test fails the build if a secret / service_role key is set.

The anon key ships inside the APK, so anyone can call the two functions. They can't read anything they don't hold the key for, junk uploads fail to decrypt and are skipped, and `emx_push` caps uploads per mailbox per hour.

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
- Nothing is sent over the network unless you turn on cloud sync, and then only end-to-end encrypted household rows. ML Kit's bundled model works offline.
- Raw SMS text is never stored, only the parsed fields plus a hash. Only the last 4 digits of cards and accounts are kept. Captured screenshots are deleted after approval by default.
- Backups are encrypted with your passphrase (PBKDF2-SHA256 → AES-GCM). CSV export escapes formula characters.

## Build and run

Needs Node 20+, and for local builds the Android SDK and JDK 17. Expo Go won't work because ML Kit, SQLCipher and the SMS module are native code.

```bash
npm install
npx expo run:android            # dev build on a connected phone / emulator
# or with EAS (cloud build):
npx eas-cli@latest build -p android --profile development   # dev client
npx eas-cli@latest build -p android --profile preview       # sideloadable APK
npx eas-cli@latest build -p android --profile play          # Play Store bundle, no READ_SMS
```

### Production APK via GitHub Actions

`.github/workflows/android-release.yml` builds the production APK on GitHub. Push a tag (`git tag v1.0.1 && git push origin v1.0.1`) and the APK is attached to a GitHub Release. You can also run the workflow manually from the Actions tab (artifact only).

**Set a signing key before relying on it.** Without one, each build gets a different debug signature. Android then refuses to update, and uninstalling deletes all on-phone data. One-time setup:

```bash
keytool -genkeypair -v -keystore expensemonster.keystore -alias expensemonster -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 expensemonster.keystore   # → secret ANDROID_KEYSTORE_BASE64
```
Add the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`expensemonster`) and `ANDROID_KEY_PASSWORD`. Back up the keystore: if you lose it, you can never update the installed app.

**Play Store note:** Google only allows `READ_SMS` for default SMS apps and approved exceptions. The `play` profile drops it (`STORE=play`), and screenshot capture still works. SMS capture is for the sideloaded `preview` APK. iOS cannot read SMS at all.

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
src/services/       OCR, SMS capture, notifications, UPI, sync/backup, secure storage
src/ui/             theme, components, charts, forms
modules/sms-reader/ local Expo module (Kotlin) that reads the SMS inbox on demand
```

## Known limitations

- Native features (OCR, SMS, biometrics, notifications, UPI, SQLCipher) have to be tested on a device. CI covers the domain logic and type/lint checks only.
- OCR and SMS parsing are heuristic. That is why everything goes through Review. Bank SMS formats change, so add new samples to `src/domain/__tests__/sms.test.ts` when one isn't recognised.
- Sync is manual (file based), not real-time.
- Receiving `.emx` files works through *Receive file*. The app only registers for shared images so it doesn't clutter every share sheet.
