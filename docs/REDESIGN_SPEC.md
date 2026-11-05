# Expense Monster: redesign spec (Nov 2026)

This spec builds on what is already in the repo: Expo SDK 57, Expo Router, the `(tabs)` layout, `TxnForm`, `AmountPad`, `SwipeRow`, `useDues`, `budgetUsage` and the hide-amounts mode. It replaces the "Glass ledger" theme in `src/ui/theme.ts` and changes how logging works. Where your brief and the codebase disagree with me, I say so (§0).

---

## 0. Where I disagree with the brief (read this first)

1. **"3 taps from app open" can't be met as written while the app has a lock screen.** Typing ₹450 is already 3 key presses. I measure it like this instead: **at most 3 taps that aren't digits, and under 5 s, counted from the unlocked Home screen.** Biometric unlock runs on its own when the app opens, so it costs time but no tap. For the case where the 5 s limit really matters (standing at a shop counter), add a **home-screen widget and app-shortcut "Log expense"** that opens the sheet directly after biometric unlock. You already have `modules/home-widgets`, so this is cheap to build.
2. **The four questions in 2 seconds are too many for one glance.** Today, this week, this month and the next 15 days of dues are four numbers. Nobody takes in four numbers in 2 s. I rank them: one hero answer (*"Am I okay today?"*, shown as **safe-to-spend today**), then one line for week and month, then dues. If all four get the same weight, none of them is the answer.
3. **Drop "first half of the month vs second half" for dues. Use a rolling 15 days.** A rule that changes the window by date means the same screen shows different things on the 14th and the 16th, and users won't know why. A rolling "next 15 days" already covers month-end bills (on the 25th it reaches the 10th of next month). If the real need is the **salary cycle** (most of your users are paid on the 1st or the last working day), make the period start on payday (a setting, defaulting to the 1st). That is the change that actually matters, not a split by date.
4. **"One accent colour" and "never colour alone for income vs expense" pull against each other**, unless expense stays uncoloured. My answer: **expenses are plain ink.** They are 95% of rows, and painting them red all day works against a "calm" brand. Income gets green plus a `+` sign plus an arrow-in icon. Red is used only for *status* (overspent, overdue), never for an ordinary expense.
5. **Your current theme is the "AI look" you're reacting to.** Specifically: emerald plus cobalt glows (`glowA/glowB`), translucent glass cards, big radii (22/28), Manrope ExtraBold at −1.8 letter-spacing, and a card around every block (the review counted 115). Changing the colour alone won't fix it. The structure has to change too: fewer boxes, more hairline-divided lists, smaller radii, and type that doesn't shout.

---

## 1. Information architecture

### Tabs (4 tabs plus a centre action)

```
  Home      Activity     ( + )      Plan       Insights
  today     the past     log it     what's     patterns
                                    coming
```

| Tab | Holds | Why it's here |
|---|---|---|
| **Home** | Safe-to-spend today, week/month line, next 15 days of dues, things to review, last 3 entries | The 2-second glance. Nothing to set up or manage lives here. |
| **Activity** | Every transaction, grouped by day, with search and filters | The ledger. Opened second most, after logging. |
| **+** (centre) | Opens the Quick Add sheet straight away (not a menu) | The main habit gets the best spot in the thumb zone. |
| **Plan** | Dues calendar (bills, EMIs, cards, policies) **and** Budgets, as a segmented control | Both look forward: "what's committed" and "what I've allowed myself". Today Budgets is a stand-alone route that three screens link to. |
| **Insights** | Monthly report, category breakdown, trends, Tax saver | Both look back. Each chart answers one question (§2.6). |

**Settings is not a tab.** The avatar (top-left of Home) opens **You & household**: profile, members & settle up, accounts, categories & rules, recurring income, investments, sync & backup, security, SMS capture, appearance, about. Settings gets opened about once a month, so it doesn't get one of the five best spots on screen.

**What changes from today:** the `dues` tab becomes `plan` (dues plus budgets). `/budgets` stops being its own top-level route. The "Set up a reminder" sheet (`add.tsx`) moves into Plan's own `+ Add due` button, so the centre + always means "log a payment". Today + means "expense", while `add.tsx` means "set up". Keep that split, but give it consistent names.

**Trade-off:** investments, loans and policies become two levels deep. That's right for a *spending* app, but if you see investment-tracking users opening it every day, it can earn a row on Home. It doesn't get a tab.

---

## 2. Screens

ASCII wireframes are at 360 dp width. `▔▔` marks a hairline divider, not a card.

### 2.1 Home

**Purpose:** answer "am I okay today?" in under 2 s. The second thing it offers is getting you into logging.

```
┌────────────────────────────────────┐
│ (P)  November            👁   🔔•3 │  ← avatar→hub · hide amounts · review
│                                    │
│ Safe to spend today                │  label, text2, 15
│ ₹1,240                             │  hero 40/48, tabular
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────│  today: ₹380 spent of ₹1,620
│ ₹380 spent today · 2 payments      │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
│ This week   ₹6,820   ▲ 12% vs last │  two compact rows, no cards
│ November    ₹31,400 of ₹45,000     │
│             ████████████░░░░  70%  │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
│ Next 15 days · ₹27,560 due   See all│
│  ⚠ HDFC card     Overdue 2d  ₹12,300│ ← overdue first, red text and icon
│  ⚡ BESCOM        Fri 8      ₹1,860 │
│  🏠 Home loan EMI Mon 11    ₹13,400 │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
│ 3 from bank SMS to check   Review → │  only when > 0
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
│ Recent                              │
│  🍜 Swiggy        Food    −₹380     │
│  🚕 Uber          Travel  −₹212     │
├────────────────────────────────────┤
│ Home  Activity  (＋)  Plan  Insights│
└────────────────────────────────────┘
```

**How safe-to-spend works:**
`(monthly budget − spent this month − dues left this period that aren't already budgeted) ÷ days left`, worked out once per morning. The day doesn't drift as you spend: the bar fills as you spend instead. If there's no budget, the hero becomes **"Spent today ₹380"**, with a one-line "Set a budget to see what's safe to spend" link. That's what the current Home does, so this falls back gracefully.

**Status, never shown by colour alone:**
- On track: plain ink hero, no icon.
- Above 85% of today's allowance: amber text plus a `◐` icon and "Close to today's limit".
- Over: red text plus a `!` icon and "₹140 over today. Tomorrow's adjusted to ₹1,180".

That last line matters. It tells the user what happens next, not just that they failed.

**Components:** Header bar, HeroAmount, ProgressBar (4 dp), MetricRow ×2, DueRow, AttentionRow, TxnRow.

**States:**
- *Empty (day 1):* the hero reads "₹0 spent today". Below it, a **3-step checklist**: log first expense, set a budget, add a card or bill. The mascot appears here (small, 48 dp) with "Feed me your first expense." The checklist goes away after 3 steps or when dismissed.
- *Loading:* the local DB is usually ready in under 100 ms, so **render nothing for 150 ms**, then show skeletons. That stops the skeleton from flashing.
- *Error (DB read fails):* inline row "Couldn't read your data. Your entries are safe. Retry". Never show a blank Home.
- *Hidden amounts:* every figure becomes `₹ ••••`. Bars stay visible, because proportions without values are fine to show.

**Why:** the current Home has 9 blocks (see `UI_UX_REVIEW.md` §2.1). This one has 5, and only 2 of them always appear. The month figure moved *below* today on purpose: you can act on today, but by the 20th you can only regret the month.

---

### 2.2 Quick Add (bottom sheet): the main flow

**Purpose:** log an expense in under 5 s. Covers about 90% of entries. The full `TxnForm` is still there for splits, transfers and bill payments.

```
┌────────────────────────────────────┐
│               ───                  │  grabber
│ Expense ▾            Today ▾   ✕   │  type toggle · date chip
│                                    │
│                ₹450                │  48/56, tabular, live
│        Swiggy · Food  (suggested)  │  smart-default line
│                                    │
│ [🍜 Food] [🛒 Groceries] [🚕 Travel]│  6 chips: predicted first,
│ [⛽ Fuel] [💊 Health]  [ ••• More ] │  then most used
│                                    │
│  Paid with: [UPI · HDFC ▾]   Note ✎ │  sticky default from last entry
│ ┌──────┬──────┬──────┐             │
│ │  1   │  2   │  3   │   ⌫         │
│ │  4   │  5   │  6   │             │
│ │  7   │  8   │  9   │  ┌───────┐  │
│ │  .   │  0   │ 00   │  │ Save  │  │  primary, bottom-right = thumb
│ └──────┴──────┴──────┘  └───────┘  │
└────────────────────────────────────┘
```

**Tap path:** `+` (1) → digits → `Save` (2). If the suggested category is wrong, tap a chip (3). **That's 2 or 3 taps.** Tapping a chip doesn't save on its own: if it did, a mis-tap would save the wrong thing, and the undo toast costs more than one extra tap.

**Smart defaults (all on-device, no network):**
- **Category:** chosen by time of day and recent pattern (8–10 am → "Breakfast/Coffee", if that's your history). If a payee is typed, use your existing rules engine and history (`TxnForm` already does this).
- **Payment method:** the last one used. In India that's UPI almost every time.
- **Date:** today. The chip goes amber if the date isn't today, so a back-dated entry is obvious.
- **"Again?" row:** if the amount matches a recent entry (₹40 chai, ₹212 Uber), show one chip above the keypad, "Swiggy · ₹380 · Food". **Tapping it saves at once, in one tap.** You already have this ("Again? One tap fills it all"), but it's buried in the form.

**Details:**
- The keypad is custom (`AmountPad`), not the system keyboard: no layout jump, and the keys are 64 × 56 dp.
- Indian grouping updates live (`1,00,000`). Paise are optional: you only see `.` once you type it.
- `Save` is disabled at ₹0. A **long-press on Save** opens the full form with these values already filled in (for power users). "More details" as a text link does the same for everyone else.
- The `Expense ▾` toggle changes it to Income: the keypad stays and the amount turns green with `+`.

**States:**
- *Empty:* "₹0", keypad live, Save disabled.
- *Error:* a write failure (very rare with SQLite) shows inline: "Couldn't save. Tap to retry". The sheet doesn't close and the amount isn't lost.
- *Offline:* nothing changes. It's offline-first, so it never says "offline" here.

**Feedback on save:** the sheet closes (200 ms), a light haptic plays, and a toast reads **"₹450 · Food logged · Undo"** (4 s). Home's safe-to-spend number counts down to its new value over 250 ms.

---

### 2.3 Activity (transaction list)

**Purpose:** "where did that ₹2,000 go?" Find, check and fix entries.

```
┌────────────────────────────────────┐
│ Activity                       ⚲   │
│ [November ▾] [All ▾] [Category ▾]  │  filter chips, scroll horizontally
│ Out ₹31,400 · In ₹85,000           │  summary for the current filter
│                                    │
│ TODAY · Thu 5 Nov          −₹592   │  sticky day header + day total
│  🍜 Swiggy         Food     −₹380  │
│  🚕 Uber           Travel   −₹212  │
│ YESTERDAY                 −₹1,240  │
│  ⬇ Salary · Acme   Income +₹85,000 │  green + "+" + arrow-in icon
│  …                                  │
└────────────────────────────────────┘
```

- **Row:** 56 dp min. Category icon (24 dp in a 40 dp neutral circle), payee (body), category · method (small, text2), amount right-aligned in tabular figures. Pending SMS captures show a dotted outline icon and "Needs check".
- **Search** (⚲) expands in place and matches payee, note, category and **amount** (typing "380" finds ₹380).
- **Filters:** month, type (all / out / in / transfers), category, account, member. The active filter count shows on the chips. "Clear" appears when any are set.
- **Swipe:** left → Delete (red bg, trash icon, "Delete" label) with an undo toast and no confirm dialog. Right → Edit. A full swipe left deletes; a partial swipe shows the button. Use the existing `SwipeRow`.
- **States:** *Empty month:* "Nothing logged in November yet" + `Log an expense` button. *No search results:* "No match for 'zomto'" + "Clear search". *Loading:* 6 row skeletons.

### 2.4 Transaction detail / edit

**Purpose:** check one entry and fix it. It opens **already editable** (no separate view and edit modes), because most people open an entry to fix it.

Top to bottom:
1. Amount (36/44, editable on tap → keypad sheet)
2. Payee
3. Category (chip row)
4. Date and time
5. Paid with
6. Note
7. Collapsed **"More"**: split with members, keep private, counts as transfer/settlement, attached screenshot or SMS source (shown read-only, so the user can trust where the figure came from)
8. At the bottom: `Delete` (text button, red) and `Save` (primary, full width)

`Save` only appears once something has changed. Before that the bar shows "Logged 5 Nov, 9:42 pm from SMS · HDFC". That line is how capture earns trust.

**Why:** today `TxnForm` puts every field at the same level (1,400 lines). Daily fields go first and the household and accounting ideas go under "More". Same data, less to read.

### 2.5 Plan: Dues and Budgets

**Segment 1, Dues:** a 15-day list by default, grouped **Overdue · This week · Next week · Later**. Each row shows name, due date, amount, and a `Pay` button (UPI intent via the existing `openPay`) or `Mark paid`. A month-calendar toggle (dots on due dates) is there for planners. The total at the top is "₹27,560 due in the next 15 days · ₹12,300 overdue".

**Segment 2, Budgets:** one overall monthly budget at the top, then category budgets sorted by **how much of the budget is used**, not alphabetically. Each row has the name, "₹3,200 left · ₹160/day", and a bar. Status uses colour **plus** text: "On track", "Close", "Over by ₹400".
- *Empty:* "Set one monthly number. You can split it later." One input, filled in with the last month's spend rounded up to ₹1,000.

### 2.6 Insights

Every chart gets a question as its title. One chart, one question.

| Question (title) | Chart | Why this form |
|---|---|---|
| **Where did my money go in November?** | Horizontal bar list, top 6 categories + "Other", sorted | Bars are easier to compare than a donut. The labels sit inline. |
| **Am I spending faster than last month?** | Cumulative line: this month (accent) vs last month (grey dashed), x = day of month | Answers pace, not just a total. |
| **Which days do I overspend?** | 7-bar weekday average | Patterns you can act on ("Saturdays cost 2.3× a Tuesday"). |
| **What's growing?** | List of categories with Δ vs 3-month average, ▲/▼ + % | Text beats a chart here. |
| **How much tax can I still save?** | Progress rows per section (80C, 80D…) | Moves the existing Tax saver here. |

Each chart has a **one-sentence takeaway** written in plain words above it ("Food was 28% of spending, up ₹2,100 from October"). On a glance, people read the sentence, not the chart.

Chart styling: no gridlines except a baseline. One accent for "this period", neutral grey for comparisons. Labels go directly on the marks, never in a legend. Values use tabular figures. Tapping a bar opens Activity with that filter applied.

- *Not enough data (< 7 days):* "Insights appear after a week of logging. 4 more days." with a progress dot row. Don't draw a chart from 3 data points.

### 2.7 Categories management

Reached from Hub → Categories & rules, and from "More" in the Quick Add chips.
- Two lists: **Expense** and **Income**. Each row: drag handle, icon, name, count of entries this month. Tap → edit name/icon (curated icon grid, about 60 icons, **no colour picker**: icons stay one colour, see §3.6).
- **Hide** instead of delete if the category has entries. Delete only when it's empty, otherwise offer "Move 23 entries to…".
- **Order here = chip order in Quick Add**, unless the prediction overrides slot 1. Say so in a hint line.
- *Rules* (payee → category) sit in a second section, "Auto-categorise", built from what you've corrected before.

### 2.8 Settings (You & household hub)

Grouped list, no cards:
- **You:** name, household, members, settle up
- **Money:** accounts, categories & rules, recurring income, investments, pay day (period start)
- **Capture:** SMS, screenshot scan, reminders
- **Privacy & data:** app lock (biometric/PIN, auto-lock after N min), hide amounts by default, **encryption status** ("Your data is encrypted on this phone. Key in secure enclave"), sync & devices, backup & export, erase everything
- **Appearance:** theme, text size preview
- **About:** version, privacy policy, report a problem (error log)

The **encryption/offline status line at the top** of the hub is the brand promise made visible: "🔒 Encrypted · Stored on this phone · Last backup 2 days ago". Make it a row someone can tap and read, not a marketing badge.

### 2.9 Onboarding (3 screens max)

1. **Promise.** Mascot (small), "Your money, on your phone only." Three lines with icons: works offline, encrypted on device, no account needed. Buttons: `Get started` / `Restore from backup`.
2. **One number.** "How much do you want to spend in a month?" Keypad with a smart placeholder. `Skip` is allowed. This one number makes Home's hero work on day 1.
3. **Lock.** "Lock with fingerprint?" Turn on / Not now. Then go **straight into Quick Add**, open, with "Log what you last spent" as the hint.

**Things I deliberately left out:** SMS permission, cards, bills and household. Ask for each one later, when it becomes relevant (the Home checklist, the first card payment seen in SMS). Asking for SMS access before showing any value is how people end up uninstalling.

### 2.10 Empty states (system-wide pattern)

Structure: the mascot (only on empty, success and onboarding screens, 48–64 dp, a flat single-colour line drawing) + one sentence that says what goes here + one action. Copy can be playful but must stay clear:

| Where | Copy | Action |
|---|---|---|
| Activity, empty | "No expenses yet. The monster's hungry." | Log an expense |
| Dues, empty | "Nothing due in the next 15 days." | Add a bill or EMI |
| Budgets, empty | "Set one monthly number. That's all it takes." | Set budget |
| Search, no match | "No match for 'zomto'." | Clear search |
| Review, done | "All caught up." | (none) |

Rule: the monster never appears on error screens, overdue states or anything to do with money owed. Making a joke there costs trust.

---

## 3. Design system

### 3.1 Colour tokens

Concept: **paper and ink.** Warm off-white paper, near-black ink, one fountain-pen blue accent. No glows, gradients or translucency. All text pairs below were checked for WCAG contrast (ratio vs `bg`, and vs `surface` in brackets).

**Light**

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `bg` | `#F6F5F1` | Page | |
| `surface` | `#FFFFFF` | Sheets, inputs, rare cards | |
| `sunken` | `#EDEBE5` | Keypad keys, chips (unselected), skeletons | |
| `divider` | `#E2DFD7` | Hairlines (decorative, not a UI boundary) | |
| `border-input` | `#8D897F` | Input/control outlines | 3.2 (3.5) ✅ 3:1 non-text |
| `text` | `#1A1A17` | Primary text, **expense amounts** | 16.0 (17.4) |
| `text2` | `#57554E` | Secondary text | 6.8 (7.5) |
| `text3` | `#66635B` | Captions, timestamps | 5.5 (5.0 on sunken) |
| `accent` | `#2747A0` | Primary buttons, links, selected state, "this period" in charts | 7.7 (8.4) |
| `on-accent` | `#FFFFFF` | Text on accent | 8.4 |
| `accent-soft` | `#E7ECF8` | Selected chip bg (accent text on it: 7.1) | |
| `positive` | `#17703F` | Income amounts, "on track" | 5.6 (6.1) |
| `warning` | `#8A5300` | Close to limit, due soon | 5.8 (6.3) |
| `negative` | `#B42318` | Overspent, overdue, delete | 6.0 (6.6) |
| `*-soft` | 8–10% tint of each | Status row backgrounds (sparingly) | |

**Dark** (warm near-black, not blue-black, so it doesn't look like a template):

| Token | Hex | Contrast vs bg (surface) |
|---|---|---|
| `bg` | `#121210` | |
| `surface` | `#1C1B18` | |
| `raised` | `#252420` (sheets, keypad) | |
| `divider` | `#2E2D29` | |
| `border-input` | `#6B685F` | 3.1 on surface ✅ |
| `text` | `#F2F0EA` | 16.5 (15.1) |
| `text2` | `#B5B2A8` | 8.8 (8.1) |
| `text3` | `#97948A` | 6.2 (5.7) |
| `accent` | `#9DB4F5` (on-accent `#10183A`, 8.5) | 9.2 (8.4) |
| `positive` | `#6FCF97` | 9.9 |
| `warning` | `#F0B860` | 10.5 |
| `negative` | `#FF8A80` | 8.2 |

**Rules:**
- Accent covers one thing: *"what you can tap / what's selected / this period"*. Status colours are never used as decoration.
- **Expense amounts use `text`, not red.** Income uses `positive` + `+` + arrow-in icon. Transfers use `text2` + `⇄`.
- Category colour: **none.** Categories are told apart by icon and label. With 15 colours on screen you no longer have one accent, which was the point.

### 3.2 Typography

**Use the system font** (SF Pro on iOS, Roboto on Android) and drop Manrope. Reasons: it has the best dynamic type support, true tabular figures on both platforms, nothing to load, and it reads as "native and trustworthy" rather than "template". Copilot and Apple Wallet do the same. The brand comes from colour, mascot and copy, not the typeface.

| Style | Size/Line | Weight | Use |
|---|---|---|---|
| `amount-hero` | 40/48 | 600 | Home hero, Quick Add amount (48/56) |
| `amount-lg` | 28/34 | 600 | Detail amount, section totals |
| `title` | 22/28 | 600 | Screen titles |
| `headline` | 17/22 | 600 | Section headers, row titles that need weight |
| `body` | 16/22 | 400 | Rows, inputs (16 avoids iOS zoom) |
| `body-num` | 16/22 | 500 | Row amounts |
| `subhead` | 14/20 | 400 | Secondary row text |
| `caption` | 12/16 | 500 | Day headers (uppercase +0.5 tracking), timestamps |

- **All numbers:** `fontVariant: ['tabular-nums']`. `₹` stays in the same weight but at 0.8× size for hero amounts, so the digits carry the visual weight.
- **Letter-spacing:** 0 everywhere except captions. The current −1.8 on display text is one of the main reasons it looks "AI-made".
- **Dynamic type:** support up to 200% on body text. Hero amounts scale to 130% max and then shrink to fit (`adjustsFontSizeToFit`), so ₹1,00,00,000 never truncates. At ≥ 150%, rows stack the amount *below* the payee.

### 3.3 Spacing, radii, elevation

- **Grid:** 4 pt base. Tokens `4, 8, 12, 16, 24, 32, 48`. Screen gutter 16. Gap between sections 24. Row vertical padding 12.
- **Radii:** `sm 8` (chips, keys), `md 12` (buttons, inputs, the rare card), `lg 20` (top of the bottom sheet). Pill only on status pills. Today's 22/28 makes everything look like a toy.
- **Elevation:** only two levels. Level 0 = page; the hierarchy comes from hairlines and spacing. Level 1 = bottom sheets, toasts and menus: light `0 -2 16 rgba(0,0,0,0.08)` in light mode, and in dark mode `raised` colour plus a 1 px `divider` top border instead of a shadow.
- **Cards:** use them only when a group is *tappable as one unit* (Home hero → today in Activity). Everything else is a list section with hairlines.

### 3.4 Iconography

- One set: **Ionicons outline** (already a dependency) at 1.5–2 px visual stroke. 24 dp in rows, 20 dp inline, 28 dp in the tab bar. Filled variant only for the selected tab.
- Category icons sit in a 40 dp circle filled with `sunken`, icon in `text2`. They're neutral on purpose.
- Mascot: one flat, single-colour (accent) line character with 5 poses (hungry, happy, sleeping, thinking, waving). No 3D, no gradient. It replaces the current `BrandMark` gradient treatment.

### 3.5 Charts

- Baseline only, no gridlines, no 3D, no donut (exception: a single-value ring for "budget used" is fine).
- Colours: `accent` = current, `text3` at 40% = comparison or other. Status colours only when the data *is* a status (an over-budget bar turns `negative` **and** gets a "Over" label).
- Labels sit directly on bars. Axis labels are `caption` in `text3`. Values are tabular.
- Every chart has: a question as its title, a one-line takeaway, and a tap target that goes to the matching filtered Activity view.

### 3.6 Components

| Component | Spec |
|---|---|
| **Button: primary** | 48 dp tall, `accent` bg, `on-accent` 16/600, radius 12. Pressed: 92% opacity + scale 0.98. Disabled: `sunken` bg, `text3`. |
| **Button: secondary** | 48 dp, 1 px `border-input`, `text`. |
| **Button: text** | 44 dp hit area, `accent` 16/600. Destructive uses `negative`. |
| **Input** | 52 dp, `surface`, 1 px `border-input`, radius 12. Focus: 2 px `accent`. Label above (14, `text2`), error below (14, `negative` + ⚠ icon). |
| **Chip** | 36 dp visual / 44 dp hit, radius 8. Unselected: `sunken` bg, `text`. Selected: `accent-soft` bg + `accent` text + ✓ icon (the ✓ means it isn't shown by colour alone). |
| **List row** | 56 dp min (72 with two-line subtitle), 16 gutter, leading 40 icon, trailing amount or chevron. Divider inset to text start. |
| **Section header** | `caption` uppercase `text3` + optional right-aligned total / "See all" text button. |
| **Bottom sheet** | `surface`/`raised`, radius 20 top, 32×4 grabber, drag to dismiss (> 120 dp or velocity > 900, as in `add.tsx` today), backdrop `rgba(0,0,0,0.4)`. |
| **Toast** | Bottom, above the tab bar, `text` bg / `bg` text (inverse), radius 12, 48 dp, 4 s, with one action ("Undo"). One at a time; a new toast replaces the old one. |
| **Progress bar** | 4 dp (6 on hero), radius 2, track `sunken`, fill `accent` / `warning` / `negative` **plus** a text status next to it. |
| **Skeleton** | `sunken` blocks matching the final layout, one shimmer sweep of 1.2 s; disabled with Reduce Motion. |

---

## 4. Interaction details

**Gestures**
- Swipe left on a row → Delete; swipe right → Edit. Undo toast for 4 s, then the delete is committed. An accessibility action is added for each ("Delete", "Edit") for screen-reader users.
- Pull down on Home/Activity → re-scan SMS if it's enabled. Otherwise no pull-to-refresh: an offline app has nothing to refresh, and a fake spinner would be lying.
- Long-press `+` → a small menu: Income, Transfer, Scan receipt, Set up a bill.

**Haptics** (via `expo-haptics`, which is already a dependency)
- Keypad key: `selection`. Save: `impactAsync(Light)`. Delete: `notificationAsync(Warning)`. Budget crossed: `notificationAsync(Warning)` once per day per budget, never on every entry.
- No haptic on scroll, tab switch or chip select. Too much buzzing gets ignored.

**Motion** (all < 300 ms, `Easing.out(cubic)`; Reduce Motion → crossfade only)
- Sheet in 220 ms / out 180 ms. Toast slide-up 160 ms. Hero number counts to its new value over 250 ms. Row delete: height collapse over 200 ms. Tab switch: no animation, which feels instant.

**Loading:** local data loads in about 100 ms, so skeletons only appear after a 150 ms delay and are kept on screen for at least 300 ms once shown, to avoid flicker.

**Errors:** say what happened, that the data is safe, and what to do: "Couldn't save. Your entry is still here. Try again." Never show raw error codes. Link to "Report a problem" (the diagnostics screen) only after a second failure.

**Offline state:** the app *is* offline. Only the parts that sync or back up talk about network: a quiet line in the hub, "Backup waiting for Wi-Fi · 3 changes". **No global offline banner.** It would suggest something is broken, and here nothing is.

---

## 5. Accessibility checklist

- Every text pair above passes AA (≥ 4.5:1); control borders pass 3:1.
- Touch targets ≥ 44×44 dp. Keypad keys 64×56. Tab items 72×52.
- Income/expense/status always use **sign + icon + label**, and colour is only an extra cue.
- Amounts are read as words: `accessibilityLabel="Spent 380 rupees on Swiggy, Food, today"`, not "minus rupee three eight zero".
- Dynamic type up to 200%, with the stacked-row layout from §3.2. Test at the largest Android font scale, because that's where RN layouts break.
- Hide amounts: the screen reader says "amount hidden".
- Focus order in Quick Add: amount → suggested category → chips → Save.

---

## 6. Trade-offs I made

1. **Expenses aren't red.** A calmer screen, but users of apps like Walnut expect red. Risk: "is this spending or income?" for the first few days. The `−` sign and `+`/icon on income cover it, but test it.
2. **Safe-to-spend instead of "spent today" as the hero.** It's more useful, but it depends on a budget and on a formula users have to trust. If they can't explain it back to you, it's worse than a raw total.
3. **Plan merges Dues and Budgets.** Fewer tabs, but Budgets is now one segment-tap deeper.
4. **System font.** Less brand character, much better a11y and numbers. Brand comes from the mascot, colour and copy.
5. **No category colours.** Cleaner, but scanning Activity by colour (some users do this) is gone; the icons have to carry it.
6. **The chip doesn't auto-save.** Costs one tap compared with the fastest possible flow, and protects against mis-taps.

## 7. What I'd user-test first (in this order)

1. **Time-to-log, with a stopwatch.** 8 participants, a "you just paid ₹212 for an auto" scenario, starting from a locked phone. Measure tap count, time, and how often the predicted category is correct. **Pass: median < 5 s, prediction correct ≥ 60%.** If the prediction is below 60%, the 2-tap path is fiction and the chip row needs to come first.
2. **Can people explain safe-to-spend?** Show Home for 2 s, hide it, and ask "Are you okay today? How much more can you spend?" If more than 1 in 4 get it wrong, fall back to "Spent today" as the hero.
3. **Uncoloured expenses.** Show Activity with mixed income/expense rows and ask them to point at the income. Watch for hesitation.
4. **Dues window.** Show it on the 3rd and on the 27th. Ask "what do you need to pay before your next salary?" This tests whether the rolling 15-day window or a payday-aligned window matches how people think.

---

## 8. Implementation order (for this codebase)

1. Replace `palette`, `type`, `radius` and `fonts` in `src/ui/theme.ts`. Delete `Aurora.tsx`, the `gradients` map and the glass tokens. Most screens then change appearance with no other edits.
2. Create `src/ui/sheets/QuickAdd.tsx` from `AmountPad` + the category prediction in `TxnForm`. Route the centre `+` to it (a `formSheet` presentation in Expo Router), with long-press for the menu.
3. Home rewrite (`(tabs)/index.tsx`): add a pure `safeToSpend()` in `src/domain/budget.ts` with unit tests before any UI work.
4. Rename `dues` → `plan` and add the Budgets segment.
5. Insights: give each chart a question title and a takeaway sentence.
6. Widget/app-shortcut deep link `expensemonster://quick-add`.

---

## 9. Implementation status (Nov 2026)

Built on branch `claude/serene-dijkstra-uc9n5r`. Where the build differs from the spec above, the build wins and the reason is noted.

| Area | Status | Differences from the spec |
|---|---|---|
| Theme (§3.1–3.3) | Done | Token names kept from the old theme so screens changed without edits. Manrope package still installed but unused. |
| Quick Add (§2.2) | Done, `src/app/quick-add.tsx` | Category guess needs ≥3 hits and a majority in a ±90 min window. Payee isn't in the quick flow. |
| Home (§2.1) | Done | Safe-to-spend subtracts EMIs, bills and premiums still due this period (they become expenses when paid); card bills are excluded (transfers). |
| Activity (§2.3) | Done | No swipe-right-to-edit (tapping the row edits). Expenses carry no "−" sign. |
| Detail (§2.4) | Done | Built on the existing `TxnForm`, not a new screen. |
| Plan (§2.5) | Done | Route stays `/dues` so notifications keep working; `?view=budgets` opens Budgets. |
| Insights (§2.6) | Done | Existing charts kept, retitled as questions with one-line answers; Budgets moved to Plan. |
| Budget period | Added (not in the original spec) | Calendar month or pay day to pay day (1–28), per phone. Activity and Insights stay on calendar months. |
| Whole-month budget | Added | Stored as a budget with category id `overall`. |
| Onboarding (§2.9) | Done | Fresh start skips the name (saved as "Me"); joining a family phone still asks. |
| Icon and splash | Done | Regenerated from `scripts/brand/mark.js`; needs a new native build. |

Not done: categories management screen changes (§2.7), the settings hub regrouping (§2.8), mascot poses and empty-state copy (§2.10), pull-to-rescan SMS (§4).
