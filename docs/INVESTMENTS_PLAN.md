# Investments: plan

Status: proposal, nothing built yet. Covers gold/silver, shares, and how investments interact with
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

So the rate is **entered or derived**, and a looked-up rate is an optional convenience later (Phase 3):

- The user enters **amount paid + grams + purity**. The app computes ₹/g paid.
- An optional **market rate that day** field (₹/g), prefilled with the last one used, tagged with
  its source: `manual`, or `city:<name>` once lookup exists. With it, the app can show "you paid
  ₹X over the metal value (making + GST)". That is the useful insight for jewellery, and it is the
  real reason to record the day's rate.
- The city is stored as a label on that reference rate, not as something the form requires.

## 2. Asset classes and fields

| Class | Forms | Quantity unit | Fields beyond amount/date |
|---|---|---|---|
| Gold | jewellery, coin/bar, digital gold, SGB, gold ETF/MF | grams (ETF/MF: units) | purity (24K/22K/18K, 999/916/750), market rate that day (₹/g) + source/city, making charges, GST, seller |
| Silver | jewellery/article, coin/bar, digital, ETF | grams (ETF: units) | purity (999/925), market rate + source, making charges, GST |
| Shares | listed equity | shares (whole) | name, symbol, exchange (NSE/BSE), price per share, brokerage + taxes, broker/demat |
| Mutual funds | lump sum, SIP | units (3 decimals) | scheme name, AMFI code (optional), NAV, folio |
| Fixed income | FD, RD, PPF, NPS, bonds | none (amount) | institution, rate % p.a., maturity date |
| Other | real estate, crypto, anything else | optional | free text |

Jewellery deserves a short, honest caption in the UI: making charges and GST (often 10–25% on top
of the metal) are not recovered when you sell. The user can mark a piece as **not an investment**.
It is then recorded as a normal expense (Shopping) with the weight kept for the record, instead
of inflating net worth.

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
  memberId     TEXT            -- whose it is (family net worth by person)
  priceNow     INTEGER         -- paise per unit, last known (manual until Phase 3)
  priceAsOf    TEXT
  closed       INTEGER NOT NULL DEFAULT 0
  note         TEXT

trades              -- every buy/sell/redeem
  holdingId    TEXT NOT NULL
  side         TEXT NOT NULL   -- buy | sell
  tradeDate    TEXT NOT NULL
  quantity     INTEGER NOT NULL   -- MILLI-units: 10.5 g = 10500, 3 shares = 3000, 12.345 units = 12345
  unitPrice    INTEGER NOT NULL   -- paise per unit actually paid/received
  charges      INTEGER NOT NULL DEFAULT 0   -- making charges, brokerage, STT, stamp duty
  taxes        INTEGER NOT NULL DEFAULT 0   -- GST etc.
  refRate      INTEGER         -- market rate that day, paise per unit (optional)
  refSource    TEXT            -- 'manual' | 'city:bengaluru' | 'ibja' | 'amfi'
  txnId        TEXT            -- the cash transaction (transfer, linkType 'investment')
```

Choices to note:

- **Quantity in integer milli-units, not REAL.** Same reason money is in paise: 0.1 + 0.2 must not
  drift when lots are summed or split for FIFO.
- **Trades, not a single holding row with a running total.** A total with no lots can't
  compute capital gains (FIFO lots, holding period for short/long term). It also merges badly
  when two phones both edit "quantity". Append-only trades merge cleanly; the holding total is derived.
- **The cash transaction stays the single source of truth for money movement.** A trade points to
  it (`txnId`), and the transaction points back (`linkType: 'investment'`, `linkId: tradeId`). That
  is the same pattern bills, loans and cards already use. Deleting one asks about the other.
- `LinkType` gains `'investment'`.

## 4. UX

- **Add → Investment** (new tile). Step 1: pick class (Gold / Silver / Shares / Mutual fund /
  Fixed / Other). Step 2: a form specific to that class:
  - Gold/silver: amount paid, grams, purity chips, form chips, *market rate that day (optional)*,
    making charges + GST (optional, with "I don't know" allowed), from which account, whose.
  - Shares: search your existing holdings or type a new name/symbol, quantity, price,
    brokerage, account.
  - MF: scheme, amount, NAV *or* units (derive one from the other), SIP toggle.
  - Whatever two of {amount, quantity, price} are entered, the third is derived and shown.
- **Expense form:** choosing the Investments category offers "Record as an investment?" and opens
  the class picker with amount/date/account carried over, so existing habits still work.
- **Captures:** SMS/screenshots from brokers, AMCs or digital-gold apps (Zerodha, Groww, Kuvera,
  SafeGold…) are suggested as investment transfers in Review. That is a keyword list like
  `CATEGORY_FOR`, and the user always confirms.
- **Portfolio screen** (from Home and Insights): per class, invested vs current value (when
  `priceNow` is set), gain/loss, weight, and per person. "Update price" per holding.
- **Insights:** monthly *Invested* bar next to income/expense. The savings rate becomes
  `(income − spent) / income` and investing no longer lowers it. A new optional metric is
  *investment rate* = invested / income.

## 5. Sync and compatibility (step 0: must ship first)

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
| 1 | `holdings` + `trades`, gold/silver/shares/MF buy forms, investment transfers, Invested on dashboard, savings-rate fix, convert existing `cat_invest` expenses | Conversion is an opt-in review list, never silent: it changes past months' totals |
| 2 | Sells, FIFO realized gains, Portfolio screen with manual current prices, jewellery making-charge insight, tax lines | |
| 3 | Optional online prices: AMFI NAV file for MFs (public daily file), an end-of-day equity source, a gold/silver reference rate with a city label. Off by default, source always shown, always editable | Check each source's terms first; the lookup sends nothing about the user beyond "which symbol" |
| 4 | SIP schedules as dues (reuse `recurrence.ts`), broker/AMC capture | |

## 8. Open questions for you

1. Net worth per member, or household only? (The `memberId` on holdings allows both. The question is
   what the Portfolio screen leads with.)
2. Should jewellery default to "investment" or "expense with weight recorded"? I'd default to
   expense: most families don't sell jewellery, and counting it at metal value overstates
   liquid wealth.
3. Is Phase 3 (network price lookup) worth it at all for an offline-first, privacy-first app? A
   "last rate you entered" prefill covers most of the need.
