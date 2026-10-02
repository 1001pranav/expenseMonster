# ExpenseMonster — UI/UX audit (Oct 2026)

Benchmarked against the Indian personal-finance apps people already use daily (CRED, Jupiter, Fi, INDmoney, Axio/Walnut, GPay/PhonePe money views). ExpenseMonster's architecture is strong: offline, private, paise-exact, SMS + screenshot capture, a real card-cycle ledger. The gaps were in **brand identity, first-run experience, discoverability and a few correctness/privacy bugs**, not in the domain logic.

## Bugs found and fixed

| Issue | Where | Fix |
|---|---|---|
| "Hide amounts" leaked figures | Home "Due soon" total, Insights takeaway + category chips + budgets, Budgets list, loan schedule & prepayment result, biller insight, heat calendar tooltip | `useMoneyText()` hook masks every amount used inside text |
| "Saved" showed a negative number | Home hero | Label switches to **Overspent** with the absolute value |
| Next-month arrow looked active but did nothing at the current month | Insights | Disabled state on `IconButton` |
| Budget CTA was plain text inside a card that went to Insights | Home hero | Real "Set budget →" button |
| Last-7-days labels showed `09-28` for days in the previous month | Home | Weekday initials + "Today" |
| Rule engine never used for manual entry | Transaction form | Category auto-picked from payee (learned rules + history) |
| App icon and splash were Expo's template placeholders | `assets/` | New brand mark (below) |

## Visual identity (new)

- **Aurora**: the signature surface. Deep ink lit by violet, rose and marigold glows with faint coin rings. Used on hero cards (Home, Dues, Tax saver), the lock screen, onboarding and the splash, so the app opens on the same surface every time.
- **Brand mark**: a friendly coin-monster ("ExpenseMonster"), drawn as SVG (`BrandMark`). The icon set (iOS, Android adaptive + themed monochrome, splash, favicon) is generated from `scripts/brand/mark.js`.
- **Sora** display face for headings and hero figures; Inter stays for body text.
- **Gradient tiles** (violet, sunset, mint, ocean, rose, marigold, ink) for quick actions, the + sheet, due cards, empty states and the floating + button.
- **Card faces** with the card's colour as a gradient, EMV chip and contactless mark.
- Tab bar with an active pill and a raised gradient + button.

## Experience improvements

- **Home**: greeting with avatar, month-over-month change on comparable days, budget progress with **₹/day left**, quick actions (Insights, Budgets, Tax saver, Scan), review badge on a bell, **setup checklist** for new users, overdue warning, "you're all clear" state.
- **Tax saver** (new): 80C / 80D / 24(b) / 80E for the current FY, built from premiums paid through Dues and the principal/interest split of tracked home and education loans, with the limit left in each section. Clearly labelled old regime and an estimate.
- **Budgets**: summary with daily pace; limit suggestions from last month and the 3-month average.
- **Activity**: step back through past months; a clearer in/out summary; search empty state with "Clear search".
- **Transaction form**: payee autocomplete from history; the selected category stays visible even if it isn't one of the top eight; tinted amount panel per type.
- **Lock screen**: on Aurora, greets by name, shakes and buzzes on a wrong PIN.

## Missing features (prioritised)

**P0: trust and daily use**
1. **Account balances / net worth.** Accounts store an opening balance but no balance is ever shown. This needs a data-model change: a transfer has no destination account (`accountId` only), so any balance computed today would be wrong for transfers. Add `toAccountId` first, then balances, then net worth (cash + bank − card outstanding − loans).
2. **Recurring and subscription detection.** Netflix, Spotify and SIPs show up as repeating payee + amount in SMS. Suggest turning them into billers.
3. **Notifications inbox / activity feed.** The bell currently opens Review. A real feed (bill generated, budget at 80%, card statement ready) would make the app feel alive.

**P1: depth that top apps have**
4. **Investments**: SIPs, FDs/RDs, PPF/EPF/NPS balances (manual entry is enough offline). This also feeds 80C in Tax saver.
5. **Savings goals** with a target date and monthly contribution.
6. **Credit-score hygiene card**: utilisation across all cards and on-time payment streak (data already exists).
7. **Split with people outside the household** (trip with friends), with a UPI collect link.
8. **Calendar view of dues** (month grid) next to the list.
9. **Receipts on manual entries** (camera/gallery attachment); attachments exist only for captures today.
10. **Home-screen widget**: today's spend and the next due item.

**P2: polish**
11. A swipe-to-dismiss gesture on the + sheet and on `Sheet`.
12. Skeleton loaders instead of the bootstrap spinner.
13. Bigger-text layout pass (the app caps the font multiplier at 1.6 but some rows truncate).
14. Hindi and regional-language strings.
15. Export a monthly PDF statement for the household.

## Things I'd push back on

- **Two "Settings" entry points** (Home header and the Household header). Keep one. The Home gear is the expected place.
- **Household tab mixes three jobs** (members, sync, a "Manage" menu). Budgets and Insights were hidden there; the quick actions now cover them, but long term "Manage" belongs in Settings or a "More" sheet.
- **The keypad is always open on new entries.** That's great for speed, but on small phones it pushes category and payee below the fold. Consider collapsing it once an amount is entered and a category is tapped.
