# Plan: automatic bank SMS capture

## Why this is the most important missing feature
Today a bank SMS reaches the app only when the user long-presses it in Messages, copies it, opens ExpenseMonster, opens + → Paste SMS, pastes and taps Read. That is 6 steps per transaction, and nobody repeats them for a ₹40 chai. Coverage decays within a week, and once coverage drops every number in Insights is wrong. Every Indian tracker that people keep using (Axio/Walnut, Money Manager, CRED's spends view) reads bank SMS automatically.

The parsing is already done: `parseSms` (`src/domain/parsers/sms.ts`) extracts amount, payee, direction, card/account last-4, UPI ref and even `balance`; `captureText(text, sender)` routes results into Review with dedupe; taught formats (`sms_formats`) cover unknown banks. **What's missing is ingestion, not intelligence.**

## The trade-off to decide first
The README and Settings promise "never asks for SMS permission". Auto-capture breaks that promise, so it must be:
- **opt-in**, off by default, with the paste flow kept;
- **bank senders only:** filtered by DLT sender header in native code before the text ever reaches JS. Personal SMS and OTPs are never read into the app. OTP messages are dropped by pattern even from bank senders;
- **on-device only**, with no network, the same as today;
- **raw text short-lived:** held in an encrypted native queue only until parsed (seconds to hours), then deleted. Only the parsed fields plus the hash are kept, as today. The privacy copy must say this exactly; "never stored" would no longer be strictly true.

## Distribution constraint (decides the architecture)
- **Google Play:** `READ_SMS` / `RECEIVE_SMS` are restricted to default SMS handlers plus declared exceptions approved through the Permissions Declaration Form. Whether a money-management exception is currently accepted **must be confirmed on the form before relying on it**; I could not verify the current exception list.
- **Sideloaded APK** (the GitHub Releases path in the README): no Play policy applies. On Android 13+, sideloaded apps may hit **"restricted settings"** for some sensitive permissions, and the user must enable "Allow restricted settings" in App info. The setup screen needs a guided step for this; verify which permissions it covers on Android 13–16.

So build **two capture sources behind one interface**, and choose per build:

| Source | Permission | Works when app closed | Play-safe |
|---|---|---|---|
| A. SMS broadcast + inbox read | `RECEIVE_SMS`, `READ_SMS` | Yes | Only with approved declaration |
| B. Notification listener (reads the posted notification of the Messages app and of UPI apps) | `BIND_NOTIFICATION_LISTENER_SERVICE` (user enables in system settings) | Yes | Generally allowed with prominent disclosure; check the sensitive-API policy |
| C. Paste (today) | none | n/a | Yes |

Source B also catches **GPay / PhonePe / Paytm payment notifications**, which closes the gap for UPI payments where the bank SMS is late or missing. It is worth building even for the sideload flavour.

## Architecture
```
Native (Kotlin, config plugin, no hand-edited android/)
  SmsReceiver (SMS_RECEIVED) ─┐
  InboxImporter (content://sms, one-time backfill) ─┼─► SenderFilter ─► OtpFilter ─► EncryptedQueue (Keystore AES-GCM file)
  NotificationListener ───────┘                                              │
                                                                   posts local notification
JS (on app start / foreground / unlock, and via the notification tap)        │
  drainQueue() ─► captureText(body, sender) ─► Review / auto-approve ◄────────┘
                 └► update account "last balance" from parsed.balance
```
- **Config plugin** `plugins/withSmsCapture.js`: adds the receiver, the listener service and the permissions to the manifest **only when** `EXPO_PUBLIC_SMS_CAPTURE` (or an EAS profile flag) is set. The Play build without an approved declaration ships with none of it. This follows the existing `withShareReceiver.js` pattern.
- **Native module** `modules/sms-capture` (Expo module):
  - `isAvailable()`, `permissionState()`, `requestPermissions()`, `openNotificationAccessSettings()`;
  - `drain(): {id, sender, body, receivedAt, source}[]` and `ack(ids)`;
  - `importInbox({sinceDays, senders})`.
- **Sender filter:** match Indian DLT headers (`XX-HDFCBK`, `VM-ICICIT`, `JD-SBIUPI`…) against a curated bank list. Store the list in TS and pass it to native at startup so taught `sms_formats.sender` values extend it automatically.
- **Why a queue and not a headless JS task:**
  - The DB is SQLCipher behind one serialised queue (commit 86688a7). Writing from a headless task while the app is locked or mid-sync risks exactly the races that commit fixed.
  - Review is already the "process later" inbox, so draining on next open fits the existing model.
  - The notification is generic until drained ("New bank message: tap to review"). If you want "₹250 at Swiggy" in the notification itself, port only the amount and payee regex to Kotlin later.
- **Drain points:** app start (after unlock, alongside `rescheduleAll`), `AppState` active, a notification tap, and a pull-to-refresh on Review. Respect `syncHold` the way screenshot capture does.

## UX
1. **Opt-in card** (Home "Needs attention" stack and Settings → Capture): "Record bank payments automatically. Reads only messages from banks, on this phone." It shows exactly which senders qualify.
2. **Permission flow:** an explanation screen, then the system prompt, then (sideload, Android 13+) a guided "Allow restricted settings" step with a screenshot and a deep link to App info.
3. **Backfill offer** right after granting: "Import the last 3 months from your bank SMS?" This is the biggest day-1 win, because Insights, budgets and month-on-month fill up immediately. Run it in chunks with a progress bar, dedupe against existing entries, and land everything in Review with a prominent "Approve N high-confidence".
4. **Auto-approve** (ties to §10.2 of `UI_UX_REVIEW.md`): high-confidence SMS from known formats and known payees go straight in, with a weekly "auto-added" marker. Everything else goes to Review.
5. **Unrecognised bank SMS** go to Review as "Not understood: teach this format" (reuses `/settings/sms-format` with the text pre-filled) instead of being silently dropped.
6. **Account balance:** `parsed.balance` updates "Last balance ₹X · from SMS, 2 h ago" on the account. This gives trustworthy balances without computing them (§7.6 of the review).
7. **Settings → Capture:** an on/off switch, sources (SMS / payment-app notifications), a list of senders seen with per-sender mute, "Import older messages", and "Pause for 24 h".
8. **Privacy copy:** update the README, onboarding chips ("No SMS access" becomes "SMS only if you allow") and the Settings privacy text.

## Data and code changes
- `transactions.source`: add `'sms-auto'` and `'notification'`, so Activity can show the origin and the "auto" marker.
- `accounts`: add `lastBalance`, `lastBalanceAt` (an append-only migration in `src/db/schema.ts`). Never sync `lastBalance` across phones unless the account is shared.
- `services/capture.ts`: add `captureQueued(items)`, which batches `captureText` and returns a summary for the notification and Review banner.
- `services/smsCapture.ts`: wraps the module, drains, acks, handles the permission state and settings.
- `settings`: `smsCapture: 'off' | 'sms' | 'notifications' | 'both'`, `smsAutoApprove: boolean`, `smsMutedSenders: string[]`.
- Parser: add an OTP/promo guard test corpus and a `sender`-aware bank hint (already accepted by `captureText`).

## Testing
- **Domain (Jest):** fixtures of real-format SMS per major bank (HDFC, ICICI, SBI, Axis, Kotak, IDFC, Federal, card issuers), the OTP and promo rejection corpus, and dedupe between SMS, screenshot and notification for the same UPI ref.
- **Native:** a receiver test with `adb emu sms send` on an emulator; inbox import over seeded `content://sms`; the queue survives process death and reboot.
- **Device matrix:** Android 10, 13 (restricted settings), 15/16 (edge-to-edge, background limits). Check OEM battery killers (Xiaomi, Oppo, Vivo, Samsung) for the receiver and the listener.
- **Battery and privacy check:** the receiver does no work for non-bank senders; nothing touches the network.

## Phases
1. **Native module + plugin + sideload flavour (Source A) with backfill.** About 4–5 days.
2. **Drain → Review, Settings UI, opt-in and permission flow, privacy copy.** About 3 days.
3. **Auto-approve, last-balance on accounts, "teach this format" from Review.** About 2–3 days.
4. **Notification listener (Source B) and the Play flavour decision** once the declaration outcome is known. About 3–4 days.

## Decisions needed from you
1. Is the primary channel the sideloaded APK or Play? This decides whether Source A ships first.
2. Is it OK to change the "never asks for SMS permission" promise to "only if you allow, banks only"?
3. Should auto-approve be on by default for SMS (my recommendation: yes for known formats, with Undo)?
