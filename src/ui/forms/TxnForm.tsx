import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, TextInput, View } from "react-native";
import {
  applyAmountKey,
  groupAmount,
  isValidAmountText,
  toGroupedIndex,
  toRawIndex,
  type Selection,
} from "@/domain/amountInput";
import { billerMeta, viewBill } from "@/domain/bills";
import { appOf, fillFromSms, recentRepeats, suggestAmountFix, type Repeat } from "@/domain/captures";
import { textHash } from "@/domain/ids";
import { formatDay, isoToYMD, toISO, type YMD } from "@/domain/dates";
import { formatINR, type Paise } from "@/domain/money";
import { LEGACY_INVEST_CATEGORY } from "@/domain/investments";
import { memberBalances, parseIds } from "@/domain/settle";
import { applyRules, isLearned, ruleTargets } from "@/domain/rules";
import {
  categoryHistory,
  flagsOf,
  suggestCategory,
} from "@/domain/transactions";
import type { PayMethod, Scope, Transaction, TxnType } from "@/domain/types";
import { update } from "@/db/repo";
import { useStore } from "@/db/store";
import {
  answerCardHint,
  approveCapture,
  deleteTransaction,
  learnRule,
  rejectCapture,
  rememberCard,
  restoreTransaction,
  saveTransaction,
} from "@/data/actions";
import {
  useMembers,
  usePending,
  useSelfId,
  useSortedCategories,
  useTable,
  useToday,
} from "@/data/hooks";
import {
  Button,
  Card,
  Chip,
  Pill,
  Row,
  Txt,
  type IconName,
} from "../components/core";
import { toast } from "../components/feedback";
import { AmountPad } from "../components/AmountPad";
import {
  ChipSelect,
  DateField,
  Field,
  Segmented,
  SwitchRow,
  TextField,
} from "../components/forms";
import { Screen, goBack } from "../components/Screen";
import { ScreenshotThumb } from "../components/Screenshot";
import { Tile, TileGrid, TileRow } from "../components/tiles";
import { fonts, space, useTheme } from "../theme";
import { deleteAttachment } from "@/services/files";
import { readSms } from "@/services/capture";

function amountText(paise: Paise | null) {
  if (!paise) return "";
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p ? `${r}.${String(p).padStart(2, "0").replace(/0$/, "")}` : String(r);
}

export function TxnForm({
  existing,
  initialType = "expense",
  ocrText,
}: {
  existing?: Transaction;
  initialType?: TxnType;
  /** What OCR read, right after a scan. */ ocrText?: string;
}) {
  const { colors } = useTheme();
  const today = useToday();
  const accounts = useTable("accounts");
  const cards = useTable("cards");
  const billers = useTable("billers");
  const bills = useTable("bills");
  const txns = useTable("transactions");
  const rules = useTable("rules");
  const loans = useTable("loans");
  const members = useMembers();
  const selfId = useSelfId();
  const defaultScope = useStore((s) => s.settings.defaultTxnScope);
  const pending = existing?.status === "pending";
  const flags = existing ? flagsOf(existing) : [];

  // A settlement is edited as a family transfer that counts towards who owes whom.
  const [type, setType] = useState<TxnType>(
    existing?.type === "settlement"
      ? "transfer"
      : (existing?.type ?? initialType),
  );
  const [amountStr, setAmountStr] = useState(
    amountText(existing?.amount ?? null),
  );
  /** Cursor in the typed amount (raw characters, no commas): keypad keys go there, not only at the end. */
  const [amountSel, setAmountSel] = useState<Selection>(() => ({
    start: amountStr.length,
    end: amountStr.length,
  }));
  /** When the keypad last changed the amount (see onSelectionChange). */
  const keyedAt = useRef(0);
  const setAmount = (raw: string, cursor = raw.length) => {
    keyedAt.current = Date.now();
    setAmountStr(raw);
    setAmountSel({ start: cursor, end: cursor });
  };
  const [keypad, setKeypad] = useState(!existing);
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.categoryId ?? null,
  );
  const [method, setMethod] = useState<PayMethod>(existing?.method ?? "upi");
  const [cardId, setCardId] = useState<string | null>(
    existing?.cardId ?? (cards.length === 1 ? cards[0].id : null),
  );
  const [accountId, setAccountId] = useState<string | null>(
    existing?.accountId ?? (accounts.length === 1 ? accounts[0].id : null),
  );
  const [date, setDate] = useState<YMD>(
    existing ? isoToYMD(existing.occurredAt) : today,
  );
  const [payee, setPayee] = useState(existing?.payee ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [scope, setScope] = useState<Scope>(existing?.scope ?? defaultScope);
  const [payer, setPayer] = useState<string | null>(
    existing?.memberId ?? (selfId || null),
  );
  /** Family transfer: money sent from `payer` to this member. */
  const [family, setFamily] = useState(Boolean(existing?.toMemberId));
  const [toMember, setToMember] = useState<string | null>(
    existing?.toMemberId ?? null,
  );
  /** Settles a debt or lends money, so it changes who owes whom; otherwise just money handed over. */
  const [countsInBalance, setCountsInBalance] = useState(
    existing?.type === "settlement",
  );
  const [splitWith, setSplitWith] = useState<string[]>(
    parseIds(existing?.splitWith ?? null),
  );
  const [link, setLink] = useState<{
    type: Transaction["linkType"];
    id: string | null;
  }>({ type: existing?.linkType ?? null, id: existing?.linkId ?? null });
  const [showAllCats, setShowAllCats] = useState(false);
  /** True while the category was filled in from the payee, so typing more can still change it. */
  const [autoCat, setAutoCat] = useState(false);
  /** True while "Paid with" was set by one of your rules, so a later rule match can still change it. */
  const [autoPay, setAutoPay] = useState(false);
  const [more, setMore] = useState(
    Boolean(existing && (existing.splitWith || existing.note)),
  );
  const [saving, setSaving] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  /** "Always use this card when a screenshot says credit card" (saved as one of your rules). */
  const [rememberCredit, setRememberCredit] = useState(true);
  const queue = usePending().transactions;
  const [viewShot, setViewShot] = useState(false);
  /** The clipboard has text, so the keypad offers "Paste bank SMS". */
  const [clipHasText, setClipHasText] = useState(false);
  /** Where the form was filled from a pasted bank SMS: kept so the same SMS isn't recorded twice. */
  const [fromSms, setFromSms] = useState<{ ref: string | null; vpa: string | null; hash: string } | null>(null);
  useEffect(() => {
    if (!keypad || existing) return;
    // Only asks whether there is text; the text itself is read when the pill is tapped.
    Clipboard.hasStringAsync()
      .then(setClipHasText)
      .catch(() => setClipHasText(false));
  }, [keypad, existing]);

  const catKind = type === "income" ? "income" : "expense";
  const categories = useSortedCategories(catKind);

  // Payees used before for this type, newest first, with the category they were filed under.
  const knownPayees = useMemo(() => {
    const seen = new Map<string, { name: string; categoryId: string | null }>();
    for (const t of txns) {
      if (!t.payee || t.type !== type || t.status === "rejected") continue;
      const k = t.payee.trim().toLowerCase();
      if (!seen.has(k))
        seen.set(k, { name: t.payee.trim(), categoryId: t.categoryId });
      if (seen.size >= 300) break;
    }
    return [...seen.values()];
  }, [txns, type]);
  const payeeQuery = payee.trim().toLowerCase();
  const payeeSuggestions =
    payeeQuery && !existing
      ? knownPayees
          .filter(
            (p) =>
              p.name.toLowerCase().includes(payeeQuery) &&
              p.name.toLowerCase() !== payeeQuery,
          )
          .slice(0, 4)
      : [];

  const onPayee = (v: string, picked?: { categoryId: string | null }) => {
    setPayee(v);
    if (type === "transfer") return;
    // Your own rules for this payee can also say how it's paid ("Petrol pump → HDFC card"), unless
    // a payment box was picked by hand.
    const mine =
      v.trim().length >= 3
        ? applyRules(
            rules.filter((r) => !isLearned(r)),
            { payee: v, vpa: existing?.vpa ?? null, source: "manual" },
            targets,
          )
        : { ruleIds: [] };
    if (!pending && (autoPay || method === "upi") && mine.method) {
      setMethod(mine.method);
      if (mine.cardId) setCardId(mine.cardId);
      if (mine.accountId) setAccountId(mine.accountId);
      setAutoPay(true);
    }
    if (categoryId && !autoCat) return;
    const exact =
      picked ??
      knownPayees.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
    const suggestion =
      mine.categoryId ??
      exact?.categoryId ??
      (v.trim().length >= 3 ? suggestCategory(v, rules) : null);
    if (suggestion && categories.some((c) => c.id === suggestion)) {
      setCategoryId(suggestion);
      setAutoCat(true);
    } else if (autoCat) {
      setCategoryId(null);
      setAutoCat(false);
    }
  };
  // Categories this payee was filed under before (matched across spellings and its UPI ID).
  const pastCats = useMemo(
    () =>
      type === "transfer"
        ? []
        : categoryHistory(
            payee.trim() || null,
            existing?.vpa ?? null,
            type,
            txns,
            existing?.id,
          )
            .filter((c) => categories.some((x) => x.id === c.categoryId))
            .slice(0, 3),
    [payee, existing?.vpa, existing?.id, type, txns, categories],
  );
  const amount = Math.round(Number(amountStr || "0") * 100);
  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.id === selfId ? "You" : m.name,
    color: m.color,
  }));
  const nameOf = (id: string | null) =>
    memberOptions.find((o) => o.value === id)?.label ?? "Someone";
  const isFamily = type === "transfer" && family;
  // What the two owe each other without this entry, for the "counts towards who owes whom" hint.
  const balances = useMemo(
    () => memberBalances(txns.filter((t) => t.id !== existing?.id)),
    [txns, existing?.id],
  );
  const receiverOwed =
    isFamily &&
    payer &&
    toMember &&
    (balances[payer] ?? 0) < 0 &&
    (balances[toMember] ?? 0) > 0
      ? Math.min(-balances[payer], balances[toMember])
      : 0;
  const ruleHits = flags.filter((f) => f.startsWith("rule:"));
  const targets = ruleTargets({ categories, cards, accounts });
  const cardHint = flags.find((f) => f.startsWith("card-hint:"))?.split(":")[1];
  // Where this capture sits in Check captures, and the one to open after approving it.
  const position = pending ? queue.findIndex((t) => t.id === existing?.id) : -1;
  const nextPending = pending
    ? (queue.slice(position + 1).find((t) => t.id !== existing?.id) ??
      queue.find((t) => t.id !== existing?.id))
    : undefined;
  const amountFix = pending && existing ? suggestAmountFix(existing.amount, flags) : null;
  const warned = flags.some(
    (f) =>
      f.startsWith("duplicate") ||
      f === "amount-unsure" ||
      f === "payment-pending",
  );
  const repeats = useMemo(
    () => (existing ? [] : recentRepeats(txns, type, today)),
    [existing, txns, type, today],
  );
  // A screenshot that said "credit card" but not which one: offer to remember the card picked.
  const offerCardRule =
    pending &&
    existing?.source === "ocr" &&
    !cardHint &&
    !ruleHits.length &&
    method === "card" &&
    Boolean(cardId) &&
    /credit\s*card/i.test(ocrText ?? "credit card");
  // A card payment that isn't sure of its card asks, in a highlighted "Paid with" (designs 1b, 2a).
  const askCard =
    pending &&
    type === "expense" &&
    (Boolean(cardHint) ||
      (method === "card" && (!cardId || offerCardRule)));

  // "Which bill?" — open bills, newest due first, for bill-type categories or when the capture matched a biller.
  const openBills = useMemo(
    () =>
      bills
        .filter((b) => b.status !== "draft")
        .map((b) => ({
          v: viewBill(b, txns, today),
          biller: billers.find((x) => x.id === b.billerId),
        }))
        .filter(
          (x) => x.biller && (x.v.remaining > 0 || x.v.bill.id === link.id),
        )
        .sort((a, b) => a.v.bill.dueDate.localeCompare(b.v.bill.dueDate)),
    [bills, billers, txns, today, link.id],
  );
  const billCategory =
    categoryId === "cat_utilities" ||
    categoryId === "cat_rent" ||
    categoryId === "cat_education" ||
    flags.some((f) => f.startsWith("biller:"));

  const amountShown = groupAmount(amountStr);
  const onKey = (k: string) => {
    const next = applyAmountKey(amountStr, amountSel, k);
    setAmount(next.raw, next.cursor);
  };

  const save = async (approve = false) => {
    if (!amount) return toast("Enter an amount", { tone: "error" });
    const sameSms = fromSms?.ref
      ? txns.find((t) => t.sourceRef === fromSms.ref && t.status !== "rejected")
      : undefined;
    if (sameSms) {
      toast("This SMS is already recorded — here it is");
      return router.replace(`/txn/${sameSms.id}`);
    }
    if (method === "card" && type === "expense" && !cardId && cards.length)
      return toast("Pick which credit card", { tone: "error" });
    if (isFamily && (!payer || !toMember || payer === toMember))
      return toast("Pick who sent it and who got it", { tone: "error" });
    setSaving(true);
    try {
      const time =
        existing && isoToYMD(existing.occurredAt) === date
          ? existing.occurredAt
          : toISO(
              date,
              date === today
                ? new Date().getHours() * 60 + new Date().getMinutes()
                : null,
            );
      const isCardPayment = type === "transfer" && link.type === "card";
      const draft = {
        type: isFamily && countsInBalance ? "settlement" : type,
        amount,
        occurredAt: time,
        categoryId: type === "transfer" ? null : categoryId,
        method: isCardPayment && method === "card" ? "bank" : method,
        cardId: method === "card" || isCardPayment ? cardId : null,
        accountId: method === "card" && !isCardPayment ? null : accountId,
        payee: isFamily ? null : payee.trim() || null,
        note: note.trim() || null,
        scope,
        memberId: payer,
        toMemberId: isFamily ? toMember : null,
        splitWith:
          type === "expense" && splitWith.length
            ? JSON.stringify(splitWith)
            : null,
        linkType: link.id && !isFamily ? link.type : null,
        linkId: isFamily ? null : link.id,
        ...(fromSms && !existing
          ? {
              source: "sms" as const,
              sourceRef: fromSms.ref,
              sourceHash: fromSms.hash,
              vpa: fromSms.vpa,
            }
          : {}),
      } satisfies Partial<Transaction>;
      if (existing && (pending || approve)) {
        // Answer "which card ends in …" once, so the next message naming it is matched by itself.
        if (cardHint && draft.method === "card" && draft.cardId)
          await answerCardHint(existing.id, draft.cardId);
        if (offerCardRule && rememberCredit && draft.cardId)
          await rememberCard("credit card", "ocr", draft.cardId);
        await approveCapture(existing.id, draft);
        toast("Approved", { tone: "success" });
        if (nextPending) return router.replace(`/txn/${nextPending.id}`);
      } else if (existing) {
        await saveTransaction(draft, existing.id);
        await learnRule({
          payee: draft.payee,
          vpa: existing.vpa,
          categoryId: draft.categoryId,
        });
        toast("Saved", { tone: "success" });
      } else {
        await saveTransaction(draft);
        toast(
          `${type === "income" ? "Income" : isFamily ? `Transfer to ${nameOf(toMember)}` : type === "transfer" ? "Transfer" : "Expense"} of ${formatINR(amount)} saved`,
          { tone: "success" },
        );
      }
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    if (pending) await rejectCapture(existing.id);
    else await deleteTransaction(existing.id);
    toast(pending ? "Rejected" : "Deleted", {
      actionLabel: pending ? undefined : "Undo",
      onAction: pending ? undefined : () => restoreTransaction(existing.id),
    });
    goBack();
  };

  const catName = categories.find((c) => c.id === categoryId)?.name;
  const card = cards.find((c) => c.id === cardId);
  const extras = [
    note.trim() ? "Note" : "",
    splitWith.length ? `Split ${splitWith.length} ways` : "",
    scope === "personal" ? "Private" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const title = existing
    ? pending
      ? "Check this capture"
      : "Edit entry"
    : type === "income"
      ? "Money in"
      : type === "transfer"
        ? "Move money"
        : "New expense";
  const CAT_LIMIT = 11;
  const gridCats = showAllCats
    ? categories
    : [
        ...categories.slice(0, CAT_LIMIT),
        ...categories.slice(CAT_LIMIT).filter((c) => c.id === categoryId),
      ];

  // How it was paid, one box per choice: each saved card is its own box, so picking a card is one tap.
  const payOptions: {
    key: string;
    icon: IconName;
    label: string;
    sub?: string;
    method: PayMethod;
    cardId?: string;
  }[] = [
    { key: "upi", icon: "qr-code", label: "UPI", method: "upi" },
    ...(type === "transfer"
      ? []
      : cards.map((c) => ({
          key: `card:${c.id}`,
          icon: "card" as IconName,
          label: type === "income" ? `Refund to ${c.name}` : c.name,
          sub: c.last4 ? `••${c.last4}` : "Credit card",
          method: "card" as PayMethod,
          cardId: c.id,
        }))),
    { key: "cash", icon: "cash", label: "Cash", method: "cash" },
    { key: "bank", icon: "business", label: "Bank", method: "bank" },
    { key: "wallet", icon: "wallet", label: "Wallet", method: "wallet" },
  ];
  const pickPay = (o: (typeof payOptions)[number]) => {
    setKeypad(false);
    setMethod(o.method);
    setAutoPay(false);
    if (o.cardId) {
      setCardId(o.cardId);
      const c = cards.find((x) => x.id === o.cardId);
      if (c && !existing) setScope(c.scope);
    }
  };
  const pickCategory = (id: string) => {
    setKeypad(false);
    setCategoryId(id);
    setAutoCat(false);
  };
  // The keypad's "Paste bank SMS": read the clipboard and fill what the message says.
  const pasteSms = async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    const parsed = readSms(text);
    if (parsed?.kind !== "transaction") {
      return toast("The clipboard doesn't look like a bank payment SMS", {
        actionLabel: "Paste SMS screen",
        onAction: () => router.push("/paste-sms"),
      });
    }
    const f = fillFromSms(parsed, text, cards, accounts);
    setKeypad(false);
    setType(f.type);
    setFamily(false);
    const raw = amountText(f.amount);
    setAmountStr(raw);
    setAmountSel({ start: raw.length, end: raw.length });
    setMethod(f.method);
    setAutoPay(false);
    if (f.cardId) setCardId(f.cardId);
    if (f.accountId) setAccountId(f.accountId);
    if (f.date) setDate(f.date);
    if (f.paysCardId) {
      setCardId(f.paysCardId);
      setLink({ type: "card", id: f.paysCardId });
    }
    setFromSms({ ref: f.sourceRef, vpa: f.vpa, hash: textHash(`|${text}`) });
    if (f.payee) onPayee(f.payee);
    toast(
      f.method === "card" && !f.cardId && f.type === "expense"
        ? "Filled from the SMS. Pick which card, then save."
        : "Filled from the SMS. Check it and save.",
      { tone: "success" },
    );
  };

  // "Again?": the same payee, amount, category and way of paying as the last time.
  const fillRepeat = (r: Repeat) => {
    setKeypad(false);
    // Cursor at the end, where Android's selection report puts it anyway: no keypad timestamp needed.
    const raw = amountText(r.amount);
    setAmountStr(raw);
    setAmountSel({ start: raw.length, end: raw.length });
    setPayee(r.payee);
    if (r.categoryId) setCategoryId(r.categoryId);
    setAutoCat(false);
    setMethod(r.method);
    setAutoPay(false);
    if (r.cardId) setCardId(r.cardId);
    if (r.accountId) setAccountId(r.accountId);
  };

  return (
    <Screen
      title={title}
      // Scrolling means the user is looking past the amount: put the keypad away.
      onScrollBeginDrag={keypad ? () => setKeypad(false) : undefined}
      subtitle={
        pending
          ? [
              queue.length > 1 && position >= 0
                ? `${position + 1} of ${queue.length}`
                : null,
              existing?.source === "sms"
                ? "from a bank SMS"
                : existing?.source === "ocr"
                  ? `from a ${appOf(existing) ? `${appOf(existing)} ` : ""}screenshot`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          : undefined
      }
      back
      right={
        existing ? (
          <Button
            title={pending ? "Reject" : "Delete"}
            variant="ghost"
            size="sm"
            onPress={onDelete}
          />
        ) : (
          <Button
            title="Set up…"
            variant="ghost"
            size="sm"
            onPress={() => router.push("/add")}
          />
        )
      }
      footer={
        <View style={{ gap: space(1) }}>
          {keypad ? (
            <AmountPad
              onKey={onKey}
              onDone={() => setKeypad(false)}
              onPaste={!existing && clipHasText ? pasteSms : undefined}
            />
          ) : null}
          <Button
            title={
              pending
                ? nextPending
                  ? "Approve & next"
                  : "Approve"
                : amount
                  ? `Save ${formatINR(amount, { decimals: "auto" })}`
                  : "Save"
            }
            icon="checkmark"
            onPress={() => save(pending)}
            loading={saving}
            size="lg"
            variant={pending ? "success" : "primary"}
          />
        </View>
      }
    >
      {pending && (existing?.attachment || warned) ? (
        <Card tone="alt" style={{ gap: 6, flexDirection: "row" }}>
          {existing?.attachment ? (
            <ScreenshotThumb uri={existing.attachment} />
          ) : null}
          <View style={{ flex: 1, gap: 6 }}>
          <Row gap={1} wrap>
            <Pill
              label={
                existing?.source === "sms"
                  ? "From SMS"
                  : existing?.source === "ocr"
                    ? "From screenshot"
                    : "Captured"
              }
              tone="info"
            />
            {existing?.confidence != null ? (
              <Pill
                label={`${Math.round(existing.confidence * 100)}% sure`}
                tone={existing.confidence < 0.7 ? "warn" : "good"}
              />
            ) : null}
            {flags.some((f) => f.startsWith("duplicate")) ? (
              <Pill label="Possible duplicate" tone="expense" />
            ) : null}
            {flags.includes("payment-pending") ? (
              <Pill label="Payment was pending" tone="warn" />
            ) : null}
            {flags.includes("amount-unsure") ? (
              <Pill label="Check the amount" tone="warn" />
            ) : null}
            {ruleHits.length ? (
              <Pill
                label={
                  ruleHits.length > 1
                    ? `${ruleHits.length} rules applied`
                    : "Rule applied"
                }
                tone="primary"
              />
            ) : null}
          </Row>
          {flags.includes("amount-unsure") ? (
            <Txt variant="small" tone="warn">
              The ₹ sign wasn't read clearly, so a digit may be wrong. Compare
              with the screenshot.
            </Txt>
          ) : null}
          {amountFix && amount !== amountFix ? (
            <Button
              title={`It's ${formatINR(amountFix, { decimals: "auto" })}`}
              size="sm"
              variant="secondary"
              onPress={() => setAmount(amountText(amountFix))}
              style={{ alignSelf: "flex-start" }}
            />
          ) : null}
          {existing?.sourceRef ? (
            <Txt variant="small" tone="muted">
              UPI reference {existing.sourceRef}
            </Txt>
          ) : null}
          {ocrText ? (
            <Pressable
              onPress={() => setShowOcr((v) => !v)}
              accessibilityRole="button"
            >
              <Txt variant="small" tone="primary">
                {showOcr ? "Hide what was read" : "Show what was read"}
              </Txt>
            </Pressable>
          ) : null}
          {showOcr && ocrText ? (
            <Txt tone="muted" selectable style={{ fontSize: 12 }}>
              {ocrText}
            </Txt>
          ) : null}
          </View>
        </Card>
      ) : existing?.attachment ? (
        <Card style={{ flexDirection: "row", gap: space(1.75), padding: space(1.5) }}>
          <ScreenshotThumb uri={existing.attachment} width={92} height={150} open={viewShot} onOpenChange={setViewShot} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="bodyStrong">Payment screenshot</Txt>
            <Txt variant="small" tone="muted">
              {existing.sourceRef ? `UPI reference ${existing.sourceRef} · ` : ""}
              Kept on this phone. Tap it to see it full screen.
            </Txt>
            <View style={{ flex: 1 }} />
            <Button
              title="View full screen"
              icon="expand-outline"
              variant="secondary"
              size="sm"
              style={{ alignSelf: "flex-start" }}
              onPress={() => setViewShot(true)}
            />
            <Button
              title="Delete screenshot only"
              icon="trash-outline"
              variant="ghost"
              size="sm"
              style={{ alignSelf: "flex-start", paddingHorizontal: 4 }}
              onPress={() =>
                Alert.alert(
                  "Delete the screenshot?",
                  "The entry stays; only the picture is removed from this phone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        deleteAttachment(existing.attachment);
                        await update("transactions", existing.id, { attachment: null });
                        toast("Screenshot deleted");
                      },
                    },
                  ],
                )
              }
            />
          </View>
        </Card>
      ) : existing?.source === "ocr" ? (
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          The screenshot was deleted after approval. To keep future ones, turn
          off Delete screenshots after approval in Settings.
        </Txt>
      ) : null}

      <Segmented
        value={type === "settlement" ? "transfer" : type}
        onChange={(v) => {
          setType(v);
          if (v !== "transfer") setFamily(false);
          setCategoryId(null);
          setAutoCat(false);
          if (v !== "transfer" && link.type === "card")
            setLink({ type: null, id: null });
          if (v !== "expense" && method === "card" && v === "transfer")
            setMethod("upi");
        }}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Money in" },
          { value: "transfer", label: "Move money" },
        ]}
      />

      <Pressable
        onPress={() => setKeypad((k) => !k)}
        accessibilityRole="button"
        accessibilityLabel={`Tap to ${keypad ? "hide" : "show"} the keypad`}
        style={{ alignItems: "center", gap: 2, paddingVertical: space(0.5) }}
      >
        <Row gap={0.5} style={{ alignItems: "center" }}>
          <Txt
            style={{
              fontFamily: fonts.display,
              fontSize: 36,
              color: amountStr
                ? type === "income"
                  ? colors.incomeText
                  : colors.text
                : colors.textFaint,
            }}
          >
            ₹
          </Txt>
          {/* The app's keypad types here; the phone keyboard stays down. Tap or drag to move the cursor. */}
          <TextInput
            value={amountShown}
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            showSoftInputOnFocus={false}
            contextMenuHidden
            selection={{
              start: toGroupedIndex(amountShown, amountSel.start),
              end: toGroupedIndex(amountShown, amountSel.end),
            }}
            onSelectionChange={(e) => {
              // Android reports the cursor jumping to the end when the text changes, before our
              // cursor is applied; only taps and drags move it.
              if (Date.now() - keyedAt.current < 250) return;
              const { start, end } = e.nativeEvent.selection;
              setAmountSel({
                start: toRawIndex(amountShown, start),
                end: toRawIndex(amountShown, end),
              });
            }}
            // A hardware keyboard can still type; keep only well-formed amounts.
            onChangeText={(t) => {
              const raw = t.replace(/[^\d.]/g, "");
              if (isValidAmountText(raw)) setAmountStr(raw);
            }}
            onFocus={() => setKeypad(true)}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            accessibilityLabel={`Amount ${amountStr || "zero"} rupees`}
            style={{
              fontFamily: fonts.display,
              fontSize: 48,
              height: 60,
              minWidth: 40,
              padding: 0,
              letterSpacing: -2,
              color: type === "income" ? colors.incomeText : colors.text,
              fontVariant: ["tabular-nums"],
              includeFontPadding: false,
            }}
          />
        </Row>
        <Txt variant="caption" tone="muted">
          {keypad
            ? "Tap a digit to move the cursor there"
            : "Tap to change the amount"}
        </Txt>
      </Pressable>

      {repeats.length ? (
        <Field label="Again? One tap fills it all">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {repeats.map((r) => (
              <Chip
                key={`${r.payee}|${r.amount}`}
                compact
                icon="time-outline"
                label={`${r.payee} · ${formatINR(r.amount, { decimals: "auto" })}`}
                onPress={() => fillRepeat(r)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      {!existing ? (
        <Row gap={1}>
          <Button
            title="Read a screenshot"
            icon="scan-outline"
            variant="secondary"
            size="sm"
            onPress={() => router.replace("/scan")}
            style={{ flex: 1 }}
          />
          <Button
            title="Paste a bank SMS"
            icon="chatbubble-ellipses-outline"
            variant="secondary"
            size="sm"
            onPress={() => router.replace("/paste-sms")}
            style={{ flex: 1 }}
          />
        </Row>
      ) : null}

      {!isFamily ? (
        <View style={{ gap: space(1) }}>
          <TextField
            label={
              type === "income"
                ? "From"
                : type === "transfer"
                  ? "Note"
                  : "Paid to"
            }
            value={payee}
            onChangeText={(v) => onPayee(v)}
            onFocus={() => setKeypad(false)}
            placeholder={
              type === "income"
                ? "Employer, tenant…"
                : type === "transfer"
                  ? "Optional"
                  : "Shop, person, biller…"
            }
            icon="storefront-outline"
          />
          {payeeSuggestions.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {payeeSuggestions.map((p) => (
                <Chip
                  key={p.name}
                  compact
                  icon="time-outline"
                  label={p.name}
                  onPress={() => onPayee(p.name, p)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {type === "transfer" ? (
        <Field label="To">
          <TileGrid columns={3}>
            {(w) => (
              <>
                {cards.map((c) => (
                  <Tile
                    key={c.id}
                    width={w}
                    icon="card"
                    label={`Pay ${c.name}`}
                    sub={c.last4 ? `••${c.last4}` : undefined}
                    selected={
                      !family && link.type === "card" && cardId === c.id
                    }
                    onPress={() => {
                      setKeypad(false);
                      setFamily(false);
                      setCardId(c.id);
                      setLink({ type: "card", id: c.id });
                      setScope(c.scope);
                    }}
                  />
                ))}
                {members.length > 1 ? (
                  <Tile
                    width={w}
                    icon="people"
                    label="Family member"
                    selected={family}
                    onPress={() => {
                      setKeypad(false);
                      setFamily(true);
                      setLink({ type: null, id: null });
                      setScope("household");
                    }}
                  />
                ) : null}
                <Tile
                  width={w}
                  icon="swap-horizontal"
                  label="Another account"
                  selected={!family && link.type !== "card"}
                  onPress={() => {
                    setFamily(false);
                    setLink({ type: null, id: null });
                  }}
                />
              </>
            )}
          </TileGrid>
          {!family && link.type === "card" ? (
            <Txt variant="small" tone="muted">
              Paying a card bill moves money; it isn't counted as spending
              again.
            </Txt>
          ) : null}
        </Field>
      ) : (
        <Field
          label="Category"
          hint={
            autoCat && catName
              ? `${catName}, from your past payments to ${payee.trim()}`
              : pastCats.length > 1
                ? `${payee.trim() || "This payee"} was filed two ways before`
                : undefined
          }
        >
          <TileGrid columns={4}>
            {(w) => (
              <>
                {gridCats.map((c) => (
                  <Tile
                    key={c.id}
                    width={w}
                    icon={c.icon as IconName}
                    tint={c.color}
                    label={c.name}
                    selected={categoryId === c.id}
                    onPress={() => pickCategory(c.id)}
                  />
                ))}
                {categories.length > CAT_LIMIT ? (
                  <Tile
                    width={w}
                    icon={showAllCats ? "chevron-up" : "apps-outline"}
                    label={showAllCats ? "Fewer" : `All ${categories.length}`}
                    onPress={() => setShowAllCats((v) => !v)}
                  />
                ) : null}
              </>
            )}
          </TileGrid>
        </Field>
      )}

      {type === "income" &&
      categoryId === "cat_family_in" &&
      members.length > 1 ? (
        <Card tone="alt" style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Sent by someone in your household? Their money is already counted
            here, so record it as money moved from them instead. From family
            elsewhere (say, parents in another city), keep it as income.
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {members
              .filter((m) => m.id !== selfId)
              .map((m) => (
                <Chip
                  key={m.id}
                  compact
                  icon="swap-horizontal"
                  label={`From ${m.name}`}
                  onPress={() => {
                    setType("transfer");
                    setFamily(true);
                    setPayer(m.id);
                    setToMember(selfId || null);
                    setCategoryId(null);
                    setAutoCat(false);
                    setLink({ type: null, id: null });
                    setScope("household");
                  }}
                />
              ))}
          </View>
        </Card>
      ) : null}

      {isFamily ? (
        <>
          <ChipSelect
            label="From"
            value={payer}
            onChange={setPayer}
            options={memberOptions}
          />
          <ChipSelect
            label="To"
            value={toMember}
            onChange={setToMember}
            options={memberOptions.filter((o) => o.value !== payer)}
          />
          <SwitchRow
            icon="people-outline"
            label="Counts towards who owes whom"
            description={
              receiverOwed
                ? `${nameOf(payer)} owes ${nameOf(toMember)} ${formatINR(receiverOwed)}: turn on if this pays it back.`
                : "On for paying back or lending. Off for money just handed over (pocket money, household cash)."
            }
            value={countsInBalance}
            onChange={setCountsInBalance}
          />
          <Txt variant="small" tone="muted">
            Not counted as spending: it is counted when they spend it. If they
            don't record their spending here (say, parents in another city),
            save it as an expense instead.
          </Txt>
        </>
      ) : null}

      {type === "expense" && categoryId === LEGACY_INVEST_CATEGORY ? (
        <Card tone="alt" style={{ gap: 6 }}>
          <Txt variant="small" tone="muted">
            Money put into gold, shares or a fund isn't spent: you still own it.
            Recorded as an investment, it doesn't count as spending and you can
            track what you hold.
          </Txt>
          <Button
            title="Record as an investment instead"
            size="sm"
            variant="secondary"
            onPress={() =>
              existing
                ? router.replace({
                    pathname: "/investments/new",
                    params: { fromTxn: existing.id },
                  })
                : router.replace({
                    pathname: "/investments/new",
                    params: {
                      amount: amount ? String(amount) : undefined,
                      date,
                    },
                  })
            }
          />
        </Card>
      ) : null}

      {type === "expense" && billCategory && openBills.length ? (
        <Field label="Which bill does this pay?">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {openBills.map(({ v, biller }) => (
              <Chip
                key={v.bill.id}
                icon={billerMeta(biller!.type).icon as IconName}
                label={`${biller!.name}, ${formatDay(v.bill.dueDate)}, ${formatINR(v.remaining || v.totalDue)}`}
                selected={link.type === "bill" && link.id === v.bill.id}
                onPress={() => {
                  const on = !(link.type === "bill" && link.id === v.bill.id);
                  setLink(
                    on
                      ? { type: "bill", id: v.bill.id }
                      : { type: null, id: null },
                  );
                  if (on && !amountStr) setAmount(amountText(v.remaining));
                  if (on && !payee) setPayee(biller!.name);
                }}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <View
        style={
          askCard
            ? {
                backgroundColor: colors.warnSoft,
                borderRadius: 20,
                padding: space(1.5),
                paddingRight: 0,
                gap: space(1),
              }
            : { gap: space(1) }
        }
      >
      <Field
        label={
          askCard
            ? cardHint
              ? `Which card ends in ${cardHint}?`
              : "Which credit card paid this?"
            : type === "transfer"
              ? "From"
              : type === "income"
                ? "Received in"
                : "Paid with"
        }
        hint={
          autoPay && method === "card" && card
            ? `${card.name}, from a rule`
            : undefined
        }
      >
        <TileRow>
          {payOptions.map((o) => (
            <Tile
              key={o.key}
              width={92}
              icon={o.icon}
              label={o.label}
              sub={o.sub}
              selected={
                method === o.method &&
                (o.method !== "card" || cardId === o.cardId)
              }
              onPress={() => pickPay(o)}
            />
          ))}
          {type === "expense" && !cards.length ? (
            <Tile
              width={92}
              icon="add"
              label="Add a card"
              onPress={() => router.push("/card/new")}
            />
          ) : null}
        </TileRow>
        {method !== "card" && accounts.length > 1 ? (
          <ChipSelect
            value={accountId}
            onChange={setAccountId}
            allowNone
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}`,
              icon: (a.type === "cash"
                ? "cash"
                : a.type === "wallet"
                  ? "wallet"
                  : "business") as IconName,
            }))}
          />
        ) : null}
      </Field>
        {offerCardRule ? (
          <SwitchRow
            icon="flash-outline"
            label="Always use this card when a screenshot says credit card"
            description="Saved as one of your rules; change it under Rules"
            value={rememberCredit}
            onChange={setRememberCredit}
          />
        ) : null}
      </View>

      <DateField
        label="Date"
        value={date}
        onChange={(d) => {
          setKeypad(false);
          setDate(d);
        }}
      />

      {existing &&
      !pending &&
      type === "expense" &&
      method === "card" &&
      existing.cardId ? (
        <EmiLink
          txnId={existing.id}
          plan={loans.find(
            (l) => l.sourceTxnId === existing.id && !l.deletedAt,
          )}
        />
      ) : null}

      {pending && existing && (payee.trim() || existing.vpa) ? (
        <Button
          title={`Always do this for ${payee.trim() || existing.vpa}`}
          icon="flash-outline"
          variant="ghost"
          size="sm"
          onPress={() =>
            router.push({
              pathname: "/rules/edit",
              params: {
                payee: payee.trim() || existing.vpa || "",
                categoryId: categoryId ?? "",
                method,
                cardId: method === "card" ? (cardId ?? "") : "",
                source:
                  existing.source === "ocr" || existing.source === "sms"
                    ? existing.source
                    : "any",
              },
            })
          }
        />
      ) : null}

      <Card padded={false} style={{ overflow: "hidden" }}>
        <Pressable
          onPress={() => setMore((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: space(1.5),
            minHeight: 56,
            paddingHorizontal: space(2),
            backgroundColor: pressed ? colors.surfaceAlt : "transparent",
          })}
        >
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            More
          </Txt>
          <Txt
            variant="small"
            tone="muted"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {extras || "Note, split, private"}
          </Txt>
          <Ionicons
            name={more ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
        {more ? (
          <View
            style={{
              paddingHorizontal: space(2),
              paddingBottom: space(2),
              gap: space(1.5),
            }}
          >
            <TextField
              label="Note"
              value={note}
              onChangeText={setNote}
              onFocus={() => setKeypad(false)}
              placeholder="Optional"
              multiline
            />
            {members.length > 1 && type === "expense" ? (
              <>
                <ChipSelect
                  label="Paid by"
                  value={payer}
                  onChange={setPayer}
                  options={members.map((m) => ({
                    value: m.id,
                    label: m.id === selfId ? "You" : m.name,
                    color: m.color,
                  }))}
                />
                <Field
                  label="Split equally with"
                  hint={
                    splitWith.length
                      ? `${formatINR(Math.round(amount / splitWith.length))} each`
                      : "Not shared"
                  }
                >
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {members.map((m) => (
                      <Chip
                        key={m.id}
                        label={m.id === selfId ? "You" : m.name}
                        color={m.color}
                        selected={splitWith.includes(m.id)}
                        onPress={() =>
                          setSplitWith((s) =>
                            s.includes(m.id)
                              ? s.filter((x) => x !== m.id)
                              : [...s, m.id],
                          )
                        }
                      />
                    ))}
                  </View>
                </Field>
              </>
            ) : null}
            <SwitchRow
              icon="lock-closed-outline"
              label="Keep private"
              description="Family phones won't see it"
              value={scope === "personal"}
              onChange={(v) => setScope(v ? "personal" : "household")}
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

/** A card purchase: offer to split it into EMIs, or show the plan it's already on. */
function EmiLink({
  txnId,
  plan,
}: {
  txnId: string;
  plan?: { id: string; tenureMonths: number; name: string };
}) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={() =>
        plan
          ? router.push(`/loan/${plan.id}`)
          : router.push({ pathname: "/card-emi/new", params: { txn: txnId } })
      }
      style={{ flexDirection: "row", alignItems: "center", gap: space(1.5) }}
    >
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">
          {plan ? `On ${plan.tenureMonths} monthly EMIs` : "Pay this in EMIs"}
        </Txt>
        <Txt variant="small" tone="muted">
          {plan
            ? "Billed on the card each month. Tap to see the plan."
            : "Converted with your bank? Spread it across your card bills."}
        </Txt>
      </View>
      <Txt
        variant="small"
        style={{ color: colors.primary, fontFamily: fonts.bold }}
      >
        {plan ? "Open" : "Set up"}
      </Txt>
    </Card>
  );
}
