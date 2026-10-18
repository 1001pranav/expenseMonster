# ExpenseMonster

An offline household finance app for Android (Expo / React Native). It tracks expenses, income, loans and EMIs, credit cards, bills and insurance. There is no backend: data lives encrypted on the phone and moves between family phones as encrypted files, or optionally through an end-to-end encrypted cloud mailbox.

All money, date, parsing and sync rules live in a pure TypeScript core (`src/domain/`) with its own Jest tests. Screens and native modules only call into it. See [Architecture](#architecture) and [Testing locally](#testing-locally).

## Features

| Area | What it does |
|---|---|
| Transactions | Expense, income, transfer and settlement. Category splits, equal split with family members, private entries. Monthly activity list with search by payee, note or amount |
| Accounts & categories | Bank accounts, cash and wallets with an optional opening balance. Custom expense and income categories with colour and icon. **Learned rules** remember "merchant → category" after you confirm or correct one |
| Recurring income | Salary and other regular income, with a frequency per source |
| Capture | **Payment screenshots**: share from GPay / PhonePe / Paytm, read on the phone with ML Kit OCR. **Paste a bank SMS**: the app never asks for SMS permission or reads your inbox; copy a bank message and paste it, or add entries manually. **Teach your bank's format**: paste a sample and tap the amount, payee, date and so on; only a pattern is stored, and it is shared with family phones. Every capture goes to a **Review** inbox and nothing is booked until you approve it. Duplicates are detected by UPI ref, or same amount within ±10 min |
| Loans & EMIs | Borrowed and lent loans, reducing or flat interest, amortisation schedule, prepayment simulator, overdue EMIs |
| Credit cards | Statement day and due day per card. Purchases on or before the statement day go on this bill; anything after goes on the next one. Refunds reduce the cycle. Bill payments are **transfers, not expenses**, so spending is never counted twice. Bank statement amounts can override the computed total |
| Bills | Variable bills (electricity/water/gas, with units), fixed bills (rent/internet, created each cycle automatically), prepaid recharges (validity tracking), LPG (predicts the next booking), autopay (warns if no debit shows up) |
| Insurance | Premiums and renewals with alerts 30, 7 and 1 day before |
| Reminders | Local notifications for every due item, with **Pay now / Mark paid / Snooze** actions |
| Payments | UPI hand-off (`upi://pay`) to any UPI app. The app then asks whether the payment succeeded, because UPI apps don't report the result back |
| Household | Members, who-owes-whom, simplified settle-up |
| Insights | Category donut, 12-month income vs expense, savings trend, daily heat-calendar, budgets, card spend, debt payoff projection, [financial health](#financial-health-and-the-optional-on-device-assistant) |
| Budgets | Monthly limit per category. Suggested limits come from what you actually spent, rounded up to the next ₹500 |
| Tax saver | Old-regime deduction estimate for the current financial year, from insurance premiums and home or education loan EMIs the app already tracks. An estimate to prompt planning, not tax advice |
| Assistant | Optional on-device model that answers questions about your money (see [below](#financial-health-and-the-optional-on-device-assistant)) |
| Backup & export | Passphrase-encrypted backup and restore. CSV export for this month, last month or this year |
| Diagnostics | Error log with warnings and shared-screenshot steps, which you can share when reporting a bug |

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

## Architecture

The code is layered so that every rule that decides a number lives in one place you can test without a phone.

```
src/app/  ──►  src/data/  ──►  src/db/ · src/services/  ──►  src/domain/
screens        actions, hooks   SQLCipher, OCR, sync I/O,     pure rules
src/ui/                         notifications, UPI            (no React, no native, no I/O)
```

Imports point in one direction only: towards `src/domain/`. Nothing in `src/domain/` imports from `app`, `data`, `db`, `services` or `ui`.

### The domain core (`src/domain/`)

| Module | Owns |
|---|---|
| `money.ts`, `dates.ts`, `recurrence.ts` | Paise arithmetic and formatting, local `YYYY-MM-DD` dates, "31st stays 31st" recurrence |
| `transactions.ts`, `budget.ts`, `health.ts` | Spending totals, budgets (splits honoured, card bill payments never counted as spend), financial-health ratings |
| `emi.ts` | Reducing and flat EMI, amortisation, prepayment simulation, loan progress |
| `creditCard.ts` | Statement cycles, refunds, what is payable when |
| `bills.ts`, `dues.ts` | Bill cycles per biller, the combined "due soon" list |
| `settle.ts` | Who owes whom, simplified to at most n−1 transfers |
| `tax.ts` | Old-regime deduction estimate per financial year |
| `dedupe.ts` | Duplicate detection for captures |
| `parsers/` | Bank SMS, user-taught SMS formats, payment-screenshot and bill OCR text |
| `sync/` | Bundle format, AES-GCM envelope, merge and conflict rules, cloud mailbox rules |
| `assistant/` | Read-only assistant tools, the number check, the answer loop |
| `types.ts`, `ids.ts` | Row types shared by every layer, UUID v7 |

Rules for code in `src/domain/`:

- **No React, React Native or Expo imports, and no I/O.** No database, files, network or notifications. If a rule needs data, the caller passes it in. The one platform dependency is `globalThis.crypto` (`ids.ts`), which `expo-crypto` polyfills in the app and Node provides in tests.
- **Time is a parameter.** Functions take `today` / `now` instead of reading the clock. Where a default exists (`todayYMD(now = new Date())`, `uuidv7(now = Date.now())`), tests pass a fixed value.
- **Money is integer paise; calendar dates are `YYYY-MM-DD` strings; stored timestamps are UTC ISO-8601.** No floats for amounts and no `Date` objects for calendar days.
- **External effects are injected.** The assistant's model call is a function argument (`generateText` in the app, a fake in tests), so the grounding logic is tested without the model.
- **Screens don't re-implement rules.** If a screen needs a figure, add or extend a domain function and call it from `src/data/hooks.ts`. The assistant tools call the same functions, so the screens and the assistant can't disagree.

When adding a feature, write the rule in `src/domain/` with a test first, then wire it through `db` / `services` / `data` and build the screen last.

## Testing locally

Run the same three checks CI runs (step *Typecheck, lint and test* in `.github/workflows/android-release.yml`) before every push:

```bash
npm ci              # once; also applies patches/ via patch-package
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint (eslint, expo config)
npm test            # jest
```

Useful while working:

```bash
npx jest emi                     # only test files whose path matches "emi"
npx jest -t "amortises"          # only tests whose name matches
npx jest --watch                 # re-run on save
npx jest --coverage              # coverage report in coverage/
```

### How the tests are set up

- `jest.config.js` uses the **`jest-expo/node`** preset: tests run in plain Node, with no simulator, emulator or phone. A full run takes seconds.
- Test files live next to the code they cover, in `__tests__/` folders under `src/` and named `*.test.ts`: `src/domain/__tests__/` for business rules, `src/services/__tests__/` and `src/config/__tests__/` for the few service and config checks.
- `src/domain/__tests__/fixtures.ts` has row builders (`base`, `txn`, `card`, `biller`, `bill`) with sensible defaults. Override only the fields the test is about. Use `at('2026-09-10')` for a timestamp at local noon, so tests don't break in other time zones.
- Write amounts in paise with digit separators so they read like rupees: `10_00_000_00` is ₹10,00,000.
- Check against an outside reference where there is one. The EMI tests, for example, compare against bank calculator figures.
- `src/config/__tests__/supabase.test.ts` **fails the run if a secret / `service_role` Supabase key is configured**. If it fails locally, check `.env.local`.

### Writing a test

- **Domain logic:** call the function with fixtures and fixed dates, then assert on the result. No mocks needed. If you find yourself mocking something to test a rule, the rule probably belongs in `src/domain/`.
- **Services:** mock the native modules with `jest.mock('expo-…')` and test what's left (see `src/services/__tests__/diagnostics.test.ts`). Keep these few; most logic should be testable without mocks.
- **A bank SMS or screenshot that isn't recognised:** add the real text, with personal details changed, as a case in `src/domain/__tests__/sms.test.ts` or `ocr.test.ts`, watch it fail, then fix the parser.
- **A bug fix:** add a test that fails without the fix.

### What the tests don't cover

Screens, navigation and native modules (ML Kit OCR, SQLCipher, biometrics, notifications, UPI hand-off, share intent, widget and shortcuts) have no automated tests. Check them on a device with a development build (`npx expo run:android`, or `npx eas-cli@latest build -p android --profile development`). Expo Go doesn't work. Every pull request from a branch of this repository also builds an installable APK in CI, for testing on a phone before merging.

## Project layout

```
src/app/            expo-router screens ((tabs)/ Home · Activity · Dues · Household, plus flows)
src/domain/         pure TypeScript business rules: no React / native / I/O (see Architecture)
  parsers/          bank SMS, taught formats, screenshot / bill OCR parsers
  sync/             bundle format, AES-GCM envelope, merge rules, cloud mailbox rules
  assistant/        read-only assistant tools, number check, answer loop
  __tests__/        Jest tests and fixtures for all of the above
src/db/             schema, migrations, SQLCipher client, repository, in-memory store
src/data/           app actions (mark paid, captures…) and React hooks that call the domain
src/services/       OCR, pasted-SMS capture, notifications, UPI, sync/backup, secure storage
src/ui/             theme, components, charts, forms
plugins/            config plugins (Android shortcuts, home-screen widget, share receiver)
supabase/           SQL migration for the optional cloud mailbox
```

## Known limitations

- Native features (OCR, biometrics, notifications, UPI, SQLCipher) have to be tested on a device. CI covers the domain logic and type/lint checks only.
- OCR and SMS parsing are heuristic. That is why everything goes through Review. Bank SMS formats change, so add new samples to `src/domain/__tests__/sms.test.ts` when one isn't recognised.
- Sync isn't real-time. File sync is manual. Cloud sync (optional) runs when the app opens or returns to the foreground, after edits and on *Sync now*, but never in the background.
- Receiving `.emx` files works through *Receive file*. The app only registers for shared images so it doesn't clutter every share sheet.
