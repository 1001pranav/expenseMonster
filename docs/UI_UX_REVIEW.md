# ExpenseMonster: lead UI/UX review (Oct 2026)

I read every route in `src/app/` plus the shared UI in `src/ui/`. I came to it fresh and treated `UX_AUDIT.md` as one opinion among others. I disagree with parts of it (see §9).

---

## 0. The verdict in five lines

1. **The engine is excellent, but the product is organised around the data model, not around the user's day.** Users meet scope, transfer vs settlement, card cycles, conflict policies and file sync as UI concepts.
2. **Too many doors to the same rooms.** Review has 4 entry points, Insights 5, Budgets 3, Tax saver 3, Settings 2 and Scan 3. Every duplicate makes the screens longer and the app harder to learn.
3. **Colour is used for decoration, not meaning.** There are 8 gradients and they collide (rose means "Expense" *and* "Credit card"; mint means "Income", "Insurance" *and* "Tax saver"). Most status text **fails WCAG AA contrast** (§6).
4. **Everything is a card.** There are 115 `<Card>`s across the routes, with cards inside cards, three styles of "summary" card, and 16 tinted "explainer" boxes. The visual hierarchy is flat because everything is boxed.
5. **The two most frequent actions are slower than they should be:** adding an expense (FAB → sheet → tile → form with the fields in the wrong order) and approving a scanned screenshot (an artificial minimum delay of 2 s).

If you only do one thing, do the **IA change in §1**. Most of the other simplifications follow from it.

---

## 1. Information architecture: the core change

### Today
```
Tabs:  Home · Activity · (+) · Dues · Household
Home header: avatar→Household, eye, bell→Review, gear→Settings
Home quick actions: Insights, Budgets, Tax saver, Scan
Household tab: Members, Settle up, Sync, "Manage" (Accounts, Budgets, Categories, Recurring income, Insights, Tax, Backup)  + another Settings button
Settings: Security, Cloud backup, Assistant, SMS formats, Error log, Reminders, Appearance, Privacy, Erase
```

Problems:
- **The Household tab is the weakest tab in the app.** For a single user (every user on day 1, and many forever) it shows one member row and a "Manage" menu, which is a junk drawer of settings. A tab slot is the most valuable real estate in a mobile app.
- **Insights, the payoff of tracking at all, is not a tab.** It hides behind the hero card, a quick action, a section link and a menu row.
- **Backup is split across two screens in two different places:** *Backup & export* (file, under Household → Manage) and *Cloud backup* (under Settings).
- **Household and device names are edited inside Sync.** The error log sits under "Capture & reminders".

### Proposed
```
Tabs:  Home · Activity · (+) · Dues · Insights

Avatar (top-left of Home) → "You & household" hub:
  ├─ Members & settle up
  ├─ Devices & sync          (pairing, cloud sync, file send/receive as "offline mode")
  ├─ Backup                  (cloud backup + encrypted file + CSV export: one screen)
  ├─ Accounts · Categories & rules · Recurring income
  ├─ Security · Capture (SMS formats) · Reminders · Appearance
  └─ About → Privacy, Report a problem (error log), Erase
Insights tab: segmented  Overview · Budgets · Tax
```
This gives one place for each thing. It removes the gear icon from Home, the Settings button from Household, the Manage menu, the Home quick-action row and the separate Backup screen.

---

## 2. Screen by screen

### 2.1 Home: 9 blocks today, should be 4
Current order: header (4 controls) → Aurora hero → 4 quick actions → review card → setup checklist → due-soon carousel → donut → 7-day bars → recent 5.

| Block | Keep? | Why |
|---|---|---|
| Greeting header | Shrink | "Good afternoon, Pranav" takes 60 px and tells the user nothing. Keep the avatar (it becomes the hub entry point) and the eye toggle. Drop the gear, and fix the bell (below). |
| **Bell icon** | **Fix or remove** | It is labelled like notifications but opens Review. That breaks a universal convention. Review already shows as a card on Home *and* as a badge on the Home tab. |
| Hero | Keep, fix stats | "Income / Saved / On cards" mixes three unrelated ideas. "On cards" is a *subset* of spent, not a peer of income. If salary isn't tracked, "Saved" reads **Overspent** every month, which is false. Show "Saved" only when income exists for the month. Replace "On cards" with "Card bills due". |
| Quick actions (Insights/Budgets/Tax/Scan) | **Remove** | All four are duplicates: Insights becomes a tab, Budgets and Tax live in Insights, and Scan is in the + sheet. |
| Review card + overdue line + setup checklist | **Merge** into one "Needs attention" stack | Today three separately styled warnings compete with each other (a warn-bordered card, red inline text, a checklist card). Use one component, ordered overdue → to review → setup. |
| Due-soon carousel | Change to a vertical list of the top 3 | A horizontal carousel hides items. An overdue EMI can sit off-screen in position 4. Each 200 px card crams 6 elements. |
| Donut "Where it went" | **Remove** | It duplicates Insights. |
| Last 7 days bars | **Remove** (or one line: "₹2.3k this week, ₹400 less than last") | Low decision value. |
| Recent | Keep | This is the "did my entry land?" check. |

### 2.2 The + sheet: 12 tiles; it should be 1 tap for the 80% case
- **Most taps on + are "add expense".** Today that takes 2 taps plus an animation. Make **+ open the expense form directly**, with *Scan* and *Paste SMS* as chips at the top of the form. Long-press on + (or a "More" chip) opens "Set up a bill / EMI / card / policy".
- Duplicates and misplacements in the sheet:
  - "Transfer" duplicates the Expense/Income/Transfer segmented control inside the form.
  - "Income" and "Salary / income" sit side by side. Users can't tell one-off from recurring.
  - "Settle up" and "Member" are household actions, not "record" actions.
- Tile colours are random. Violet is used for both Scan and Loan; rose for both Expense and Credit card.

### 2.3 Transaction form: the field order works against the smart features
- **The payee comes after the category, yet the category is auto-suggested *from* the payee.** A user who goes top-down picks a category first, and because `categoryId && !autoCat` is then true, the suggestion never fires. Order should be **Amount → Paid to → (category pre-filled) → Paid with → Date**.
- The custom keypad, then the system keyboard for payee, then a date picker means three input modes in one form. Collapse the keypad once the amount is entered and the payee field gets focus (`UX_AUDIT.md` raised this too; I agree).
- "Paid with" offers 5 chips plus an Account chip row and a Card chip row, which can mean three rows of chips. Default to the last-used method and account per payee, and show the full rows only on tap.
- **Bug: the "Share new entries with family by default" setting is ignored for manual entries.** `TxnForm` initialises `scope` to `existing?.scope ?? 'household'` and passes it in the draft, which overrides `blankTxn`'s `settings.defaultTxnScope`. A user who turned sharing off still syncs every manual expense to family. This is a privacy bug, not polish. Fix it first.
- Editing a *settlement* shows "Expense" selected in the segmented control (`type === 'settlement' ? 'expense' : type`), which tells the user the wrong thing.
- "Note, split with family, privacy…" as a text link is good progressive disclosure. Keep it.

### 2.4 Review
- Each capture card offers **5 ways to act**: swipe right, swipe left, the Approve button, the Edit icon and the Reject icon, plus a cryptic outlined-card icon for "paid with credit card?" and up to 6 pills. That is too much for a queue meant to be cleared in seconds.
- Simplify: **tap = edit, swipe = approve/reject, one visible "Approve" button.** Move "credit card?" into the edit form, where the method is chosen anyway. Show at most 2 pills (the most severe ones).
- "Approve N high-confidence" is the best control on the screen. Make it the sticky footer when N ≥ 2.

### 2.5 Scan
- **`MIN_MS = 2000` deliberately keeps the user waiting**, with staged step reveals, even when OCR finished in 300 ms. This is the most-repeated flow in the app. Theatre is fine the first 2–3 times; after that it is a tax. Drop the minimum, or keep it only for the first few scans.
- Otherwise the flow is strong: amount confirmation before saving, and "show what was read".

### 2.6 Activity
- **The 8 filter chips mix two dimensions in one single-select row**: period (This month, Last 30 days, All time) and type (Card, UPI, Income, To review, Household). You can't ask for "card spends last month". Use a **period stepper** (already present) plus a **Filter** button that opens a multi-select sheet.
- The "Household" chip means `scope === 'household'`. Nobody will read it that way. Rename it "Shared", or drop it.
- After tapping a donut slice, the Activity *tab* opens with a category param, a back button and a category title. There is no visible chip to clear the filter, so the tab can stay "stuck" on that category. Show the active category as a removable chip.
- Missing: multi-select (bulk re-categorise or delete). With SMS and screenshot capture this is needed weekly.

### 2.7 Dues
- A second Aurora hero, plus "Next 45 days" and **ITEMS: 7**. A count of items is not a decision. 45 days is an arbitrary horizon next to the hero's 7 days.
- Each segment has its own summary style: Aurora (All), alt card (Loans, Insurance), nothing (Cards, Bills). Use one summary row per segment, with the same component everywhere.
- Credit card faces are roughly 200 px each. Four cards means scrolling before the first bill. Offer a compact list, with the card face on the detail screen only.
- A month calendar view is worth adding *as a toggle on "All"* (agree with the audit).

### 2.8 Insights (as a tab)
- **The Month/Quarter/Year control only affects the donut and card spend.** The 12-month bars and the savings trend ignore it. Users will think the control is broken. Either apply it to everything or put it only on the section it controls.
- The "Next month" label still shows in quarter and year mode.
- **The charts overlap.** The 12-month income-vs-expense bars and the savings line show the same data (net = income − expense). Merge them into one chart with a net line. The heat calendar and Home's 7-day bars answer the same question. Move debt payoff to the Loans segment and card spend to Cards.
- Financial health at the top is right. Keep it.

### 2.9 Budgets
- The only budget model is per category, so Home's "Set budget" lands on a list of ~15 categories all saying "No budget". Most people want **one monthly number first**. Add "Overall budget" as the first row, with categories optional.
- Every category is listed, budgeted or not. Show budgeted ones first and the rest under "Add a budget".

### 2.10 Tax saver
A good niche feature, but **a Home quick action is the wrong level of prominence**. The screen itself says the new regime is the default, and these deductions mostly don't apply under it. Make it a segment in Insights.

### 2.11 Household (moves into the hub)
- The members list, settle-up and per-member balances are good.
- "Settle up" rows have the text, amount and a "Settle" button in one row, which wraps on narrow phones. Stack the amount under the names.

### 2.12 Sync
It is one screen with 8 sections: how it works, conflicts, Show/Scan QR, paired phones (each with Send), Send all/Receive, cloud toggle, conflict policy and names.
- **When cloud sync is on, hide all file send/receive behind "Offline mode".** Two parallel mechanisms on one screen is confusing.
- **Remove "File wins".** The screen itself warns that it can undo newer edits. A footgun shouldn't be one tap away for non-technical family members. Keep "Ask me" and "Newest edit".
- Move "Names" to the hub.

### 2.13 Settings / Security
- **"Remove PIN" works without entering the current PIN**, and so does **"Erase all data"**. Anyone holding an unlocked phone with the app open can disable the lock. Require the PIN or biometrics for both.
- "Reminders" has a chevron but performs an action (permission plus reschedule) and doesn't navigate. Make it a button, or a real screen that lists upcoming reminders.
- The privacy section is a wall of 5 bullets in a tinted card. Turn it into an "About privacy" page linked from one row.
- Appearance is a bare segmented control outside any card, unlike every other section.

### 2.14 Detail screens (card, loan, biller, policy, member)
- **Destructive actions are inconsistent:**
  - Card, loan and biller: trash icon next to edit, with an Undo toast. Acceptable.
  - **Member: trash with no confirm and no undo** (`remove('members', …).then(back)`).
  - **Account and category delete: no confirm, no undo.** The effect on linked transactions is not explained ("Uncategorised"? orphaned account?).
  - Learned rules: one tap on "Forget" with no undo.

  Standardise on an Undo toast everywhere. Confirm only when the data can't be restored.
- Secondary state actions ("Mark loan closed", "Pause reminders", "Policy ended / lapsed") are ghost buttons at the very bottom. Move them into a **⋯ overflow menu** in the header, together with Delete, so the trash icon isn't 8 px from Edit.
- **The statement-amount override on the card detail is long-press only.** That is a hidden gesture, and the hint text explaining it shows only because the gesture is invisible. Add a visible "Edit amount" action on billed statements.

### 2.15 Onboarding
- **The order is wrong for 2 of the 3 user types.** Someone joining a family types their name and a *household name* (overwritten by the join), sets a PIN, and only then reaches "Joining your family?" on step 3. Restore from backup sits under the form fields on step 1.
- Ask the branching question first: **"Start fresh · Join my family · Restore a backup"**. Then the name, then the lock.
- Move the notification permission request out of onboarding. Ask when the first bill, EMI or card is saved; the user then understands why, and more people say yes.

### 2.16 Lock, Pay, Settle, Assistant
- Lock: good.
- Pay: good. "Already paid — record it" is honest copy. Remove "Opened from reminder" (it is faint debug text).
- Settle: fine.
- Assistant: the sparkles entry in the Insights header leads to "Not installed" for most users. Show it only once the model is installed. Advertise the assistant once, in Settings.

---

## 3. Colour combinations

### 3.1 Contrast: measured
WCAG 2.x contrast ratios computed from `src/ui/theme.ts` (AA needs 4.5 for body and small text, 3.0 for large text and icons):

| Pair (light theme unless noted) | Ratio | Used for | Verdict |
|---|---|---|---|
| `textFaint #9A96B4` on `bg` / `surface` | **2.62 / 2.84** | hints, "Tap to edit", tax tips, inactive tab labels | ❌ fails even large text |
| `warn` on `warnSoft` | **2.83** | "Check amount", "Due" pills | ❌ |
| `income` on `incomeSoft` | **2.97** | "Paid", "Fully repaid" pills | ❌ |
| `expense` on `expenseSoft` | **3.23** | "Overdue", "Possible duplicate" pills | ❌ for 11–13 px |
| `info` on `infoSoft` | 3.47 | info pills | ❌ |
| `warn` / `income` / `expense` text on white | 3.19 / 3.39 / 3.82 | small coloured status text ("2 EMI overdue", "Over by…") | ❌ |
| White on the `success` button (`income`) | 3.39 | "Approve" button label | ❌ |
| `textMuted` on surface | 6.53 | subtitles | ✅ |
| `primary` on `primarySoft` | 5.12 | selected chips, tab | ✅ |
| Dark: `primary` on `primarySoft` | 3.58 | selected tab label | ❌ |
| Dark: `textFaint` on bg | 3.78 | hints | ❌ |
| White icon on gradient light ends (marigold, mint, sunset, ocean) | **1.44–1.89** | + sheet, quick actions, due tiles | ❌ half of each tile is below 3:1 |

**So every status signal in the app (overdue, due, paid, duplicate, check amount) is rendered in a combination that fails AA.** For a finance app that is a correctness problem, not a taste problem: an overdue EMI shown in a pill that is hard to read is a missed payment.

**Fix: split each semantic colour into *fill* and *text* tokens.** Keep the current hues for fills, bars and icons, and add darker text variants (verified):

| New token | Value | On its soft bg | On white |
|---|---|---|---|
| `incomeText` | `#047857` | 4.81 | 5.48 |
| `warnText` | `#B45309` | 4.46 (≈AA, nudge to `#A84E08` to be safe) | — |
| `expenseText` | `#C81E3A` | 4.80 | — |
| `infoText` | `#0369A1` | 5.02 | — |
| `textFaint` (light) | `#6E6A8C` | 4.72 on bg | 5.12 |
| `textFaint` (dark) | `#8F88C0` | 5.57 on surface | — |
| `primary` on `primarySoft` (dark) | `#A79BFF` text | 5.99 | — |
| Success button | fill `#047857` | white text 5.48 | — |

For gradient tiles, darken the light stop (for example marigold `#F5A300 → #D97706`), or put the icon on a solid mid-tone.

### 3.2 Colour without meaning
Gradients are assigned per screen, so the same colour means different things:

| Gradient | Means… |
|---|---|
| rose | Expense, Credit card, card dues |
| mint | Income, Insurance, Tax saver, lent-loan dues, policy dues, income dues |
| violet | Insights, Scan, Loan/EMI, EMI dues |
| ocean | Scan (Home), Paste SMS, Member, prepaid dues |
| sunset | Budgets, Salary, LPG dues |

On Home alone, one viewport shows the violet/rose/marigold Aurora, 4 differently coloured gradient tiles, an amber-bordered review card, a green progress bar, gradient due tiles, a 6-colour donut and purple bars. With no constant mapping, the user's eye learns to ignore colour, and that includes the red that matters.

**Rule to adopt:** colour carries **state**, never **type**.
- Neutral surfaces with tinted icons for object types (bill, loan, card).
- Red = overdue or over budget. Amber = due soon or needs a check. Green = income, paid or on track. Brand violet = interactive or selected.
- Category colours appear only inside category UI (donut, chips).
- Keep **one** gradient (`brand`) for the + button and the Home hero. Retire the other 7.

### 3.3 Hard-coded colours
There are 17 × `'#fff'`, 10 × `'#FFFFFF'`, ~20 rgba-white variants (0.06 → 0.85 opacity, 12 different values), plus `#FBBF24` / `#A5F3C4` utilisation colours on card faces whose background the user picks. Add tokens: `onHero`, `onHeroMuted` (one opacity), `onHeroSubtle`, `utilOk`, `utilHigh`. Test the utilisation bar against all 7 `CARD_COLORS`.

### 3.4 Aurora
The Aurora is a good signature, but it is used on Home, Dues *and* Tax heroes, the lock screen, onboarding and the splash. A signature shown everywhere stops being one. Keep it on the lock screen, onboarding, the splash and the **Home hero only**. Dues and Tax summaries should use the standard summary component.

---

## 4. Cards and surfaces

1. **Card inside card:** the biller insight (`Card tone="alt"` inside a `Card`), the Tax empty state inside a `Card`, and Review items (Card → SwipeRow → padded View). Nested boxes create double padding and double radius. **Rule: one level of container.**
2. **Three summary-card styles** for the same job (Aurora hero, `tone="alt"` with captions, a plain card with an `h1`). Build one `SummaryHeader` component (label, big number, optional progress, ≤3 stats).
3. **16 `tone="alt"` explainer boxes** ("How it works", "Good to know", "Start with your top 3"…). Explanations in boxes compete with data. Show them once (dismissible) or as plain muted text under the title.
4. **Alerts are encoded three times:** coloured border + pill + coloured text (review card, overdue due card, conflicts card). Pick one: a leading icon plus text in the `…Text` token.
5. **Lists are grouped cards with dividers inset at `space(9)`**, while some lists have no dividers (Bills, Categories, Accounts). Pick one rule.
6. **Uneven card density:** DueCard packs 6 elements into 200 px, while the Insights health card spreads 4 rows of prose across the full screen width. Aim for 1 headline + 1 supporting line + 1 action per card.

---

## 5. Placement and consistency

| Pattern | Today | Standardise on |
|---|---|---|
| Primary action | Footer button on forms ✅; footer "Pay" on details ✅ | Keep |
| Edit / delete on details | Two header icons next to each other | Edit icon + **⋯ menu** (Delete, Close/Pause, Share) |
| State toggles (close loan, pause biller, lapse policy) | Ghost button at the bottom | In the ⋯ menu |
| Add on a list | Footer button (Accounts, Categories, Income) vs section link "Add" (Members) vs secondary button below the list (Dues segments) | Footer button on full-page lists; trailing "+ Add" row inside grouped lists |
| Explain text | Tinted card, muted text, faint text and toast, all in use | Muted text under the title; nothing else |
| Section actions | "See all", "Add", "Edit", "Ask", "Teach new", "Insights", "₹12k · See all" | "See all" for navigation; verbs only for creation |
| Money inside a section link | "₹12.4k · See all" | Put the number in the title: "Due soon · ₹12.4k" (as the "Last 7 days" section already does) |

---

## 6. What to remove (unwanted)

1. The Household tab (moves into the hub).
2. The Home quick-action row.
3. The Home donut and the 7-day bars.
4. The gear on Home and the Settings button on Household.
5. The bell icon that opens Review.
6. The "Transfer", "Settle up", "Member" and duplicate "Income" tiles in the + sheet.
7. The "File wins" conflict policy.
8. The Dues hero "ITEMS" count and the 45-day stat; the Aurora on Dues and Tax.
9. The separate "Savings trend" chart (merge it into the income/expense chart).
10. The minimum 2 s scan delay.
11. Permanent "How it works" boxes (show once).
12. "Opened from reminder" on Pay.
13. Seven of the eight gradients.
14. The Error log as a top-level settings row (it moves to About → Report a problem).

---

## 7. New features: prioritised, with reasoning

**P0: trust and speed (small, high impact)**
1. **Fix the default-scope privacy bug** (§2.3).
2. **Require the PIN or biometrics** to remove the PIN, change lock settings or erase data.
3. **One-tap expense:** + opens the expense form directly; Scan and SMS are chips in the form.
4. **Overall monthly budget** as an option ahead of per-category budgets.
5. **A "Needs attention" stack on Home** that replaces the bell, the review card, the overdue line and the checklist.

**P1: depth people will actually use**

6. **Balance from bank SMS.** Most Indian bank SMS include "Avl Bal". Show the *last reported balance per account* with its date. This gives balances without the drift of computing them from manual entries (see §9).
7. **Recurring and subscription detection** that suggests "Make this a bill". (I agree with the audit.)
8. **Bulk edit in Activity:** multi-select to re-categorise, mark private or delete.
9. **A month-end recap card** ("October: spent ₹48k, 12% less than September; top category Food"). This is the loop that brings people back, and the data already exists.
10. **Calendar toggle** on Dues → All.

**P2**

11. Receipt attachments on manual entries.
12. A large-text pass. Font scaling is capped at 1.6, and several rows truncate first.
13. Hindi and regional strings.
14. An overflow-menu component and a `SummaryHeader` component (these enable §4 and §5).

---

## 8. Suggested order of work

1. **Bugs and security:** default-scope bug, PIN-gated security actions, undo on member/account/category delete, the settlement segmented display. (½ day)
2. **Colour tokens:** add the `…Text` tokens and new `textFaint` values and swap `Pill`, `Txt tone` and the success button over. Do this before the IA work, because it changes every screen. (1 day)
3. **IA:** the Insights tab, the hub, the merged Backup screen, cleaning up Settings. (2–3 days)
4. **Home and + sheet** slim-down. (1 day)
5. **Form field order, Review simplification, Activity filters.** (1–2 days)
6. **Card and summary unification, ⋯ menus.** (1–2 days)

---

## 9. Where I disagree with `UX_AUDIT.md`

- **"Account balances / net worth" as P0: I disagree.** Balances computed from manual and captured entries drift after the first missed cash payment. A wrong balance is worse than none, because it destroys trust in every other number. Do "last balance from bank SMS" (§7.6) first. Do computed net worth only after reconciliation exists.
- **"Notifications inbox / activity feed" (P0): I disagree.** It is another place to check. A "Needs attention" stack on Home covers it with no new screen.
- **Investments and split with outsiders (P1): I disagree for now.** Both expand scope while the goal is to simplify. Splitwise and INDmoney own those jobs. Revisit after the IA is fixed.
- **The visual identity work (Aurora, 8 gradients):** it gave the app personality, but it went too far. See §3.2.
- **Agree:** collapse the keypad, add a calendar view, the large-text pass, the two Settings entry points problem, and Household mixing three jobs. My proposal resolves the last one by removing the tab, not by adding a "More" sheet.
