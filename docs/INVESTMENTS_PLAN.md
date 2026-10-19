# Investments: plan

Status: decisions agreed (§8). Phase 1 (buying and selling, §3a) is being built. Covers gold/silver, shares, and how investments interact with
spending, family sync and tax.

## 1. Where the request is right and where I disagree

**"Investment is outgoing money, so counting it as an expense is fine."** I disagree. It is fine
for cash flow, but it makes the numbers wrong:

- `monthTotals` treats `cat_invest` expenses as spending, so a ₹20,000 SIP looks like ₹20,000
  spent at a restaurant.
- `financialHealth` computes the savings rate as `(income − expense) / income`. A family that invests
  more gets a *worse* savings rate. A health score that punishes investing is wrong.
- Budgets, the category donut and the assistant's grounding all include it as spending.

Money moved into an investment is a **transfer to an asset you still own**, like paying a credit card
bill (which the app already models as a transfer). Proposal: record investments as `type: 'transfer'`
with `linkType: 'investment'`. Spending then excludes them for free (`monthTotals` only counts
`expense`/`income`). The dashboard gets a separate **Invested this month** figure, so the outflow
stays visible: income − spent − invested = cash left.

Exception: costs that never come back (jewellery making charges, GST, brokerage, STT) are
real spending. They are stored on the trade (§3) and reported as costs. They are not booked as
separate expenses, because one payment should not become two entries in Activity.

**"Pick a city and the app fills in that day's gold rate."** Good instinct, wrong primary
input:

- For a purchase, what matters (cost basis, capital gains, "did I overpay") is **what you
  actually paid**: amount, grams, purity. A published city rate is a *reference*, not the cost.
- There is no official, free, per-city gold rate API. City "rates" on websites are compiled by
  the publisher and differ by site and jeweller association. Scraping them is fragile and probably
  against their terms. The national benchmark is IBJA's daily rate (999/995/916/750 gold, 999
  silver). It is published, but not as an API we can rely on.
- The app is offline-first with no backend of its own. Making a core form depend on a network
  lookup goes against that.
- Historical rates for a past date (logging last month's purchase) are even harder to get.

Agreed approach: **record grams and the per-gram cost; the user fills them in, leaves them
blank, or fetches them online and confirms.**

- Amount paid, grams and ₹/g are linked. Enter any two and the third is filled in (and shown, so a
  typo stands out). Amount paid is the only required field; it is the money that left the account.
- **Blank is allowed, with a visible consequence.** Without grams the purchase still counts as
  invested, but the app can't value it later. The holding shows "Add grams to track its value" and
  never makes up a number.
- **Online price, always confirmed.** A "Fetch today's rate" button (city picker for gold/silver,
  symbol for shares) fills the field and marks it with where it came from. Nothing fetched is saved
  until the user has seen it and can edit it. Saving an edited figure stores it as `manual`.
- **No source available** (offline, no API for that city or a past date, a lookup failure): the
  button says so and the field stays as it is, open for typing or left blank. The form never waits
  on the network.
- The city is stored as a label on the rate, not required by the form. The last city used is
  remembered.

## 2. Asset classes and fields

| Class | Forms | Quantity unit | Fields beyond amount/date |
|---|---|---|---|
| Gold | jewellery, coin/bar, digital gold, SGB, gold ETF/MF | grams (ETF/MF: units) | purity (24K/22K/18K, 999/916/750), market rate that day (₹/g) + source/city, making charges, GST, seller |
| Silver | jewellery/article, coin/bar, digital, ETF | grams (ETF: units) | purity (999/925), market rate + source, making charges, GST |
| Shares | listed equity | shares (whole) | name, symbol, exchange (NSE/BSE), price per share, brokerage + taxes, broker/demat |
| Mutual funds | lump sum, SIP | units (3 decimals) | scheme name, AMFI code (optional), NAV, folio |
| Fixed income | FD, RD, PPF, NPS, bonds | none (amount) | institution, rate % p.a., maturity date |
| Other | real estate, crypto, anything else | optional | free text |

**Jewellery: the user decides what it is.** When the user records a jewellery purchase, the form
asks *what is this for?*:

| Choice | Recorded as | Weight / rate |
|---|---|---|
| Investment | Investment transfer + holding + trade | Grams, purity, ₹/g, making charges, GST |
| For own use | Expense (Shopping) | Optional note of grams and purity on the expense ("just mention it"), no holding, not in net worth |
| Gift to someone | Expense (Gifts & donations) | Not asked |

A short caption under *Investment* says that making charges and GST (often 10–25% on top of the
metal) are not recovered on sale. It informs; it doesn't block. A piece recorded for own use can be
turned into an investment later from its expense ("Track as investment").

## 3. Data model

Two new synced tables, plus a link from the cash transaction. Same conventions as the rest of the
schema: integer paise, `YYYY-MM-DD` dates, every row has `scope`.

```
holdings            -- one per thing you own: "22K gold", "INFY", "Parag Parikh Flexi Cap"
  assetClass   TEXT NOT NULL   -- gold | silver | equity | mf | fixed | other
  form         TEXT            -- jewellery | coin | digital | sgb | etf | sip | fd | ppf | ...
  name         TEXT NOT NULL
  symbol       TEXT            -- NSE/BSE ticker, AMFI code
  unit         TEXT NOT NULL   -- g | share | unit | none
  purity       TEXT            -- '916', '999', '925'
  memberId     TEXT            -- whose it is; NULL = held jointly by the household
  priceNow     INTEGER         -- paise per unit, last known (manual until Phase 3)
  priceAsOf    TEXT
  closed       INTEGER NOT NULL DEFAULT 0
  note         TEXT

trades              -- every buy/sell/redeem
  holdingId    TEXT NOT NULL
  side         TEXT NOT NULL   -- buy | sell
  tradeDate    TEXT NOT NULL
  amount       INTEGER NOT NULL   -- the trade's value: buy = cost incl. charges; sell = what you got, after charges
  quantity     INTEGER            -- MILLI-units: 10.5 g = 10500, 3 shares = 3000, 12.345 units = 12345; NULL = not entered
  unitPrice    INTEGER            -- paise per unit actually paid/received; NULL = not entered
  charges      INTEGER NOT NULL DEFAULT 0   -- making charges, brokerage, STT, stamp duty
  taxes        INTEGER NOT NULL DEFAULT 0   -- GST etc.
  refRate      INTEGER         -- market rate that day, paise per unit (optional)
  refSource    TEXT            -- 'manual' | 'fetched:<provider>:<city or symbol>'; edited after fetch → 'manual'
  txnId        TEXT            -- the cash transaction (transfer, linkType 'investment'); NULL = no cash moved
```

Choices to note:

- **Quantity in integer milli-units, not REAL.** Same reason money is in paise: 0.1 + 0.2 must not
  drift when lots are summed or split for FIFO.
- **Trades, not a single holding row with a running total.** A total with no lots can't
  compute capital gains (FIFO lots, holding period for short/long term). It also merges badly
  when two phones both edit "quantity". Append-only trades merge cleanly; the holding total is derived.
- **The trade has its own value (`amount`); the cash transaction records only the money that moved.**
  A trade points to it (`txnId`), and the transaction points back (`linkType: 'investment'`,
  `linkId: tradeId`), the same pattern bills, loans and cards use. Usually both amounts are equal.
  They differ when no cash moves: gold received as a gift, old jewellery exchanged for new (§3a),
  bonus shares. A trade without a transaction is allowed. (Correction: an earlier version of
  this plan made the transaction the only record of value, which can't express these cases.)
- Quantity and price are nullable: we agreed grams may be left blank. (The earlier `NOT NULL` contradicted that.)
- Deleting an investment's transaction deletes its trade; undo restores both.
- `LinkType` gains `'investment'`.

## 3a. Selling

Selling is a trade with `side: 'sell'`. These rules apply to every asset class (jewellery,
coins, shares, fund redemptions, SGB maturity, an FD closing).

**What is recorded.** You enter what you sold (quantity, or "all of it"), the price or the
total received, and charges (brokerage, deductions the jeweller makes for wastage or purity).
`amount` is what you actually received, after charges. Enter two of amount, quantity and price
and the third is calculated, as for buying (a sale's charges are subtracted, not added).

**The cash.** Money received is a transaction of `type: 'transfer'`, `linkType: 'investment'`,
flagged `sale`, into the chosen account. It is **not income**: you are converting something you
own back into cash, so monthly income and the savings rate don't jump in the month you sell.
The month's **Invested** figure is net: purchases minus sale proceeds. A month where you sell more
than you buy shows a negative figure ("Taken out ₹X").

**Gain or loss.** The cost of what was sold is taken from the earliest purchases first (FIFO, as
the Income Tax Department requires for shares and funds held in demat). Gain = amount received −
that cost. The holding's remaining cost and quantity go down accordingly.
- **Quantities missing.** If a purchase before the sale has no quantity, the cost of part of the
  holding can't be worked out. Then the app offers **"Sold all of it"** (cost = everything still
  invested, and the holding is closed) or asks for the missing quantities. It never guesses a share.
- **Selling more than you hold** (purchases not recorded in the app) is allowed. The cost of the
  unrecorded part counts as unknown, and the gain shows as "at least ₹X" with a prompt to add the
  older purchase.
- Gains are shown on the holding and on the Investments screen. They are not counted as income
  anywhere. Their tax treatment (short/long term by holding period, which differs by asset class)
  is phase 2 (§6).

**Closing.** When the quantity reaches zero, or the user picks "Sold all of it", the holding is
marked closed. It stays in history with its realised gain, and is hidden from the list by default.

**Jewellery exchange** (old gold traded in for new, common in India). The app records it as two
trades on the same day: a sale of the old piece with no cash (its `amount` = the value the jeweller
gave), and a purchase of the new piece at its full value. Only the difference moves as cash: one
transaction for what you paid on top, or what you received if the old piece was worth more. The
new piece's cost basis is its full price, not just the cash paid, and the old piece's gain or loss
is realised. Phase 1 records this as two entries (sale without cash, purchase). A guided
"Exchange" screen is phase 2.

**Gifts.** Gold received as a gift is a purchase without cash (`txnId` NULL) at the value that day,
if known, or with only grams (then it has no cost basis and its gain on sale shows as unknown).
Jewellery given away is a sale without cash, recorded at its value if known. Neither is income or
spending.

**Mutual funds and SIPs.** A redemption is a sale in units. SIP instalments are separate
purchases, so FIFO works per instalment, which is what the tax rules need. A switch between
schemes is a sale in one holding and a purchase in another on the same day.

## 4. UX

- **Add → Investment** (new tile): *Buy* or *Sell*. Selling starts from a holding (its screen
  has a **Sell** button) and shows how much is held and the cost of what you're selling before saving.
- Step 1 (buying): pick class (Gold / Silver / Shares / Mutual fund /
  Fixed / Other). Step 2: a form specific to that class:
  - Gold/silver: amount paid, grams, purity chips, form chips, *market rate that day (optional)*,
    making charges + GST (optional, with "I don't know" allowed), from which account, whose.
  - Shares: search your existing holdings or type a new name/symbol, quantity, price,
    brokerage, account.
  - MF: scheme, amount, NAV *or* units (derive one from the other), SIP toggle.
  - Whatever two of {amount, quantity, price} are entered, the third is derived and shown.
  - Every amount and rate field supports editing at the cursor, like the transaction amount does.
- **Expense form:** choosing the Investments category offers "Record as an investment?" and opens
  the class picker with amount/date/account carried over, so existing habits still work.
- **Captures:** SMS/screenshots from brokers, AMCs or digital-gold apps (Zerodha, Groww, Kuvera,
  SafeGold…) are suggested as investment transfers in Review. That is a keyword list like
  `CATEGORY_FOR`, and the user always confirms.
- **Portfolio screen** (from Home and Insights): **combined household net worth first, then one
  line per member, plus a "Joint" line** for holdings with no `memberId`. Joint holdings count in
  the combined figure and are *not* split across members by default: splitting needs
  ownership shares nobody wants to enter for a family FD. Per class: invested vs current value
  (when `priceNow` is set), gain/loss, weight. "Update price" per holding (manual, or fetch and
  confirm).
- **Insights:** monthly *Invested* bar next to income/expense. The savings rate becomes
  `(income − spent) / income` and investing no longer lowers it. A new optional metric is
  *investment rate* = invested / income.

## 5. Sync and compatibility (step 0: must ship first)

**Status: built** (`domain/sync/forward.ts`, migration v4). Unknown fields are kept in each row's
`extra` column and sent out again when the row is edited. Records of unknown tables wait in
`held_records`, and the Sync screen asks the user to update. After an update both are applied
(`adoptForwardData`). New values of existing fields (e.g. `linkType: 'investment'`) need nothing:
they are stored as text, and an older phone treats such a row as the nearest thing it knows (a
transfer). Investments must be designed so that this degrades safely. What follows is the original analysis.

Today an older app version that receives a cloud record for a table it doesn't know logs it as
*unreadable* and skips it (`services/sync.ts`, `unknown table`). It then moves its read position
past that record and never sees it again. Unknown *columns* are dropped by the `TABLES` whitelist,
so an old phone that edits a transaction can upload it without the new fields.

In a family where one phone updates late, investment records would be lost or damaged. So before
any investment table ships:

1. **Release N:** keep records for unknown tables (and unknown columns) raw in a `pending_records`
   table instead of skipping them. Replay them after a migration adds the table. Preserve unknown
   columns on update instead of dropping them.
2. **Release N+1 (or later):** add the investment tables (migration v4: `createTable('holdings')`,
   `createTable('trades')`), `SYNC_TABLES`, backup.

Also: file sync (`.emx`), cloud backup and restore all iterate `SYNC_TABLES`, so they pick
up new tables automatically. Each one gets a round-trip test.

## 6. Tax (ties into the existing Tax screen)

- Realized gains per sell, FIFO across lots, short-term vs long-term by holding period per asset
  class. Equity has a 12-month threshold; gold and debt funds follow different rules that changed
  in 2023–24. **Keep thresholds and rates in one table in `domain/tax.ts`, with the effective date
  and source, and do not hard-code them in logic.** They change in budgets.
- 80C: ELSS, PPF, NPS (80CCD(1B)) contributions feed the existing 80C lines.
- SGB interest and dividends are income (`cat_interest`), as today.
- Show it as an estimate, like the rest of the Tax screen. Not advice.

## 7. Phases

| Phase | Scope | Notes |
|---|---|---|
| 0 | Forward-compatible sync (§5) | Ships alone; no visible feature |
| 1 | `holdings` + `trades`, buy forms for every class, **selling (§3a): sale proceeds as transfers, FIFO cost and realised gain, closing a holding, purchases/sales without cash (gifts, exchange as two entries)**, Invested (net) on dashboard, savings-rate fix, convert existing `cat_invest` expenses | Conversion is an opt-in review list, never silent: it changes past months' totals |
| 2 | Portfolio screen with manual current prices and unrealised gains, guided jewellery exchange, making-charge insight, tax lines (short/long term per class) | |
| 3 | Optional online prices: AMFI NAV file for MFs (public daily file), an end-of-day equity source, a gold/silver reference rate with a city label. Off by default, source always shown, always editable | Check each source's terms first; the lookup sends nothing about the user beyond "which symbol" |
| 4 | SIP schedules as dues (reuse `recurrence.ts`), broker/AMC capture | |

## 8. Decisions

1. **Net worth:** both. Combined household first, then per member, with jointly held items on
   their own line (§4).
2. **Jewellery:** the user picks Investment, For own use or Gift (§2). Only Investment creates a
   holding. Own use keeps an optional weight note. Gift asks for nothing extra.
3. **Prices:** grams and ₹/g are stored. Each value is typed, left blank or fetched online and
   confirmed (§1). Without an online source the user types it or leaves it blank.
4. **Amount editing:** the transaction screen's amount can be edited at any position (tap or drag
   the cursor), not only cleared and retyped. Done separately from this plan; the investment forms
   use the same behaviour.

Still open: which online sources to use in Phase 3, after checking each one's terms. Until then
the fetch button is hidden, not shown disabled.
