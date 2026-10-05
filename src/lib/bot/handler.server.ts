import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_LABEL, NON_FLOW_CATEGORIES, currentYm, fmt, localDate, matchCategory, monthBounds,
  normalize, parseAmountToken, parseLoan, parseTransaction, parseTransfer, shiftYm, type Account,
} from "./parse";

type Db = SupabaseClient<any>;
type Kb = { inline_keyboard: { text: string; callback_data: string }[][] };

const BTN_BALANCE = "💰 الرصيد";
const BTN_LAST = "📜 آخر العمليات";
const REPLY_KB = { keyboard: [[{ text: BTN_BALANCE }, { text: BTN_LAST }]], resize_keyboard: true, is_persistent: true };
const HELP_EXAMPLE = "مثال: ‎-90 غداء جيب أو ‎+6000 راتب بنك";

function tgUrl(method: string) {
  return `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${method}`;
}

export async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(tgUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!res.ok || !json.ok) throw new Error(`Telegram ${method} [${res.status}]: ${json.description ?? "unknown"}`);
  return json.result;
}

const send = (chat_id: number, text: string, reply_markup?: unknown) =>
  tg("sendMessage", { chat_id, text, reply_markup, disable_web_page_preview: true });

// ---------- data helpers ----------
async function balances(db: Db) {
  const { data, error } = await db.from("transactions").select("amount, account");
  if (error) throw error;
  let pocket = 0, bank = 0;
  for (const r of data ?? []) {
    if (r.account === "pocket") pocket += Number(r.amount);
    else bank += Number(r.amount);
  }
  return { pocket, bank, total: pocket + bank };
}

async function lastAccount(db: Db): Promise<Account> {
  const { data } = await db.from("transactions").select("account").neq("category", "تحويل")
    .order("created_at", { ascending: false }).limit(1);
  return (data?.[0]?.account as Account) ?? "pocket";
}

async function insertTx(db: Db, row: { amount: number; account: Account; category: string; note?: string | null; transfer_id?: string }) {
  const { data, error } = await db.from("transactions").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function balanceLines(b: { pocket: number; bank: number }) {
  return `💵 الجيب: ${fmt(b.pocket)}\n💳 البنك: ${fmt(b.bank)}`;
}

const undoKb = (id: string): Kb => ({ inline_keyboard: [[{ text: "↩️ تراجع", callback_data: `del:${id}` }]] });

const MAIN_MENU: Kb = {
  inline_keyboard: [
    [{ text: "💰 الرصيد", callback_data: "bal" }, { text: "📜 آخر العمليات", callback_data: "last" }],
    [{ text: "📂 حسب التصنيف", callback_data: "cat:" }, { text: "💳 القروض", callback_data: "loans" }],
    [{ text: "➕ إضافة عملية", callback_data: "help" }],
  ],
};

// ---------- views ----------
async function balanceText(db: Db) {
  const b = await balances(db);
  return `💰 الرصيد\n\n${balanceLines(b)}\n━━━━━━━━\n🧮 المجموع: ${fmt(b.total)}`;
}

async function lastText(db: Db) {
  const { data, error } = await db.from("transactions").select("*").order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  if (!data?.length) return "لا توجد عمليات بعد.";
  const lines = data.map((t) => {
    const a = Number(t.amount);
    return `${a >= 0 ? "🟢" : "🔴"} ${localDate(t.created_at)} | ${fmt(a)} | ${ACCOUNT_LABEL[t.account as Account]} | ${t.category}${t.note ? ` — ${t.note}` : ""}`;
  });
  return `📜 آخر العمليات\n\n${lines.join("\n")}`;
}

async function categoryView(db: Db, ymIn?: string): Promise<{ text: string; kb: Kb }> {
  const ym = ymIn || currentYm();
  const { start, end } = monthBounds(ym);
  const { data, error } = await db.from("transactions").select("amount, category")
    .gte("created_at", start).lt("created_at", end);
  if (error) throw error;
  const exp = new Map<string, number>(), inc = new Map<string, number>();
  for (const r of data ?? []) {
    if (NON_FLOW_CATEGORIES.includes(r.category)) continue;
    const a = Number(r.amount);
    const m = a < 0 ? exp : inc;
    m.set(r.category, (m.get(r.category) ?? 0) + Math.abs(a));
  }
  const list = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `• ${c}: ${fmt(v)}`).join("\n") || "—";
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const text = `📂 حسب التصنيف — ${ym}\n\n🔴 المصاريف (${fmt(sum(exp))})\n${list(exp)}\n\n🟢 المداخيل (${fmt(sum(inc))})\n${list(inc)}`;
  const kb: Kb = {
    inline_keyboard: [[
      { text: "◀️ الشهر السابق", callback_data: `cat:${shiftYm(ym, -1)}` },
      { text: "الشهر التالي ▶️", callback_data: `cat:${shiftYm(ym, 1)}` },
    ]],
  };
  return { text, kb };
}

async function loanBalances(db: Db) {
  const [l, p] = await Promise.all([
    db.from("loans").select("person, amount"),
    db.from("loan_payments").select("person, amount"),
  ]);
  if (l.error) throw l.error;
  if (p.error) throw p.error;
  const m = new Map<string, number>();
  for (const r of l.data ?? []) m.set(r.person, (m.get(r.person) ?? 0) + Number(r.amount));
  for (const r of p.data ?? []) m.set(r.person, (m.get(r.person) ?? 0) - Number(r.amount));
  return m;
}

async function loansText(db: Db) {
  const m = await loanBalances(db);
  const rows = [...m.entries()].filter(([, v]) => Math.abs(v) > 0.001);
  if (!rows.length) return "💳 القروض\n\nلا توجد ديون حالياً ✨";
  let owedToMe = 0, iOwe = 0;
  const lines = rows.map(([p, v]) => {
    if (v > 0) owedToMe += v; else iOwe += -v;
    return v > 0 ? `👤 ${p}: يدين لي ${fmt(v)}` : `👤 ${p}: أدين له ${fmt(-v)}`;
  });
  return `💳 القروض\n\n${lines.join("\n")}\n━━━━━━━━\n🟢 لي عند الناس: ${fmt(owedToMe)}\n🔴 علي للناس: ${fmt(iOwe)}\n🧮 الصافي: ${fmt(owedToMe - iOwe)}`;
}

const HELP_TEXT = `➕ إضافة عملية — رسالة واحدة تكفي:

‎-90 غداء جيب ← مصروف 90 من الجيب
‎+6000 راتب بنك ← دخل 6000 في البنك
‎-1.5k كراء ← مصروف 1500 (آخر حساب مستعمل)

قروض: قرضت أحمد 4500 · رد أحمد 1000 · استلفت من يوسف 2000 · سددت يوسف 500
تحويل: حول 2000 للبنك`;

async function monthText(db: Db) {
  const ym = currentYm();
  const { start, end } = monthBounds(ym);
  const { data, error } = await db.from("transactions").select("amount, category").gte("created_at", start).lt("created_at", end);
  if (error) throw error;
  let inc = 0, exp = 0;
  for (const r of data ?? []) {
    if (NON_FLOW_CATEGORIES.includes(r.category)) continue;
    const a = Number(r.amount);
    if (a >= 0) inc += a; else exp += -a;
  }
  return `📅 ملخص شهر ${ym}\n\n🟢 المداخيل: ${fmt(inc)}\n🔴 المصاريف: ${fmt(exp)}\n━━━━━━━━\n💰 الادخار: ${fmt(inc - exp)}`;
}

async function deleteTx(db: Db, id: string) {
  const { data } = await db.from("transactions").select("id, transfer_id").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.transfer_id) await db.from("transactions").delete().eq("transfer_id", data.transfer_id);
  else await db.from("transactions").delete().eq("id", id);
  return true;
}

async function exportCsv(db: Db, chatId: number) {
  const { data, error } = await db.from("transactions").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFFdate,amount,account,category,note\n" +
    (data ?? []).map((t) => [t.created_at, t.amount, t.account, t.category, t.note].map(esc).join(",")).join("\n");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", `📤 ${data?.length ?? 0} عملية`);
  form.append("document", new Blob([csv], { type: "text/csv" }), `transactions-${currentYm()}.csv`);
  const res = await fetch(tgUrl("sendDocument"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`sendDocument [${res.status}]: ${await res.text()}`);
}

// ---------- message handling ----------
async function handleText(db: Db, chatId: number, raw: string) {
  const text = raw.trim();
  const cmd = (text.split(/\s+/)[0] ?? "").split("@")[0]!.toLowerCase();

  if (cmd === "/start" || cmd === "/menu") {
    await send(chatId, "👋", REPLY_KB);
    return send(chatId, "أهلاً إلياس! اختر إجراءً:", MAIN_MENU);
  }
  if (cmd === "/balance" || text === BTN_BALANCE || normalize(text) === "الرصيد") return send(chatId, await balanceText(db));
  if (cmd === "/last" || text === BTN_LAST) return send(chatId, await lastText(db));
  if (cmd === "/help") return send(chatId, HELP_TEXT);
  if (cmd === "/month") return send(chatId, await monthText(db));
  if (cmd === "/loans") return send(chatId, await loansText(db));
  if (cmd === "/export") return exportCsv(db, chatId);
  if (cmd === "/undo") {
    const { data } = await db.from("transactions").select("id").order("created_at", { ascending: false }).limit(1);
    if (!data?.length) return send(chatId, "لا توجد عمليات للحذف.");
    await deleteTx(db, data[0]!.id);
    return send(chatId, `🗑️ تم حذف آخر عملية.\n\n${balanceLines(await balances(db))}`);
  }
  if (cmd === "/edit") {
    const { data } = await db.from("transactions").select("*").order("created_at", { ascending: false }).limit(5);
    if (!data?.length) return send(chatId, "لا توجد عمليات.");
    return send(chatId, "اضغط على عملية لحذفها:", {
      inline_keyboard: data.map((t) => [{
        text: `🗑️ ${localDate(t.created_at)} ${fmt(Number(t.amount))} · ${t.category}`,
        callback_data: `del:${t.id}`,
      }]),
    });
  }
  if (cmd === "/set_pocket" || cmd === "/set_bank") {
    const target = parseAmountToken(normalize(text.split(/\s+/)[1] ?? ""));
    const zero = normalize(text.split(/\s+/)[1] ?? "") === "0";
    if (target === null && !zero) return send(chatId, `مثال: ${cmd} 700`);
    const account: Account = cmd === "/set_pocket" ? "pocket" : "bank";
    const b = await balances(db);
    const diff = (target ?? 0) - b[account];
    if (Math.abs(diff) > 0.001) await insertTx(db, { amount: diff, account, category: "تعديل", note: "تعديل الرصيد" });
    return send(chatId, `✅ تم ضبط ${ACCOUNT_LABEL[account]}.\n\n${balanceLines(await balances(db))}`);
  }

  // Transfer
  const tr = parseTransfer(text);
  if (tr || cmd === "/transfer") {
    if (!tr) return send(chatId, "مثال: حول 2000 للبنك");
    const from: Account = tr.to === "bank" ? "pocket" : "bank";
    const transfer_id = crypto.randomUUID();
    const { error } = await db.from("transactions").insert([
      { amount: -tr.amount, account: from, category: "تحويل", note: `إلى ${ACCOUNT_LABEL[tr.to]}`, transfer_id },
      { amount: tr.amount, account: tr.to, category: "تحويل", note: `من ${ACCOUNT_LABEL[from]}`, transfer_id },
    ]);
    if (error) throw error;
    const { data } = await db.from("transactions").select("id").eq("transfer_id", transfer_id).limit(1);
    return send(chatId, `🔁 تم التحويل: ${fmt(tr.amount)} ← ${ACCOUNT_LABEL[tr.to]}\n\n${balanceLines(await balances(db))}`,
      data?.[0] ? undoKb(data[0].id) : undefined);
  }

  // Loans
  const loan = parseLoan(text);
  if (loan) {
    const { person, amount, account } = loan;
    let txAmount = 0, label = "";
    if (loan.kind === "lend") {
      await db.from("loans").insert({ person, amount });
      txAmount = -amount; label = `🤝 ${person} يدين لك الآن بـ ${fmt(amount)} إضافية`;
    } else if (loan.kind === "borrow") {
      await db.from("loans").insert({ person, amount: -amount });
      txAmount = amount; label = `🤝 أنت تدين لـ ${person} بـ ${fmt(amount)} إضافية`;
    } else if (loan.kind === "repaid_to_me") {
      await db.from("loan_payments").insert({ person, amount });
      txAmount = amount; label = `💸 ${person} رد ${fmt(amount)}`;
    } else {
      await db.from("loan_payments").insert({ person, amount: -amount });
      txAmount = -amount; label = `💸 سددت لـ ${person} ${fmt(amount)}`;
    }
    let txId: string | undefined;
    if (account) txId = await insertTx(db, { amount: txAmount, account, category: "قروض", note: person });
    const remaining = (await loanBalances(db)).get(person) ?? 0;
    const rem = Math.abs(remaining) < 0.001 ? "✅ تمت تسوية الدين" :
      remaining > 0 ? `المتبقي عنده: ${fmt(remaining)}` : `المتبقي عليك: ${fmt(-remaining)}`;
    const extra = account ? `\n\n${balanceLines(await balances(db))}` : "";
    return send(chatId, `${label}\n👤 ${rem}${extra}`, txId ? undoKb(txId) : undefined);
  }

  // Fast transaction input
  const p = parseTransaction(text);
  if (!p) return send(chatId, `🤔 لم أفهم. ${HELP_EXAMPLE}`);
  const [{ data: kws }, account] = await Promise.all([
    db.from("category_keywords").select("keyword, category"),
    p.account ? Promise.resolve(p.account) : lastAccount(db),
  ]);
  const category = matchCategory(p.words, kws ?? []);
  const id = await insertTx(db, { amount: p.amount, account, category, note: p.words.join(" ") || null });
  const b = await balances(db);
  return send(chatId,
    `✅ تم تسجيل العملية!\n${p.amount >= 0 ? "🟢" : "🔴"} ${fmt(p.amount)} · ${ACCOUNT_LABEL[account]}\n📁 الفئة: ${category}\n\n${balanceLines(b)}`,
    undoKb(id));
}

async function handleCallback(db: Db, cq: any) {
  const chatId: number = cq.message?.chat?.id;
  const msgId: number = cq.message?.message_id;
  const data: string = cq.data ?? "";
  let toast: string | undefined;
  try {
    if (data === "bal") await send(chatId, await balanceText(db));
    else if (data === "last") await send(chatId, await lastText(db));
    else if (data === "loans") await send(chatId, await loansText(db));
    else if (data === "help") await send(chatId, HELP_TEXT);
    else if (data.startsWith("cat:")) {
      const ym = data.slice(4);
      const v = await categoryView(db, ym);
      if (ym) await tg("editMessageText", { chat_id: chatId, message_id: msgId, text: v.text, reply_markup: v.kb });
      else await send(chatId, v.text, v.kb);
    } else if (data.startsWith("del:")) {
      const ok = await deleteTx(db, data.slice(4));
      toast = ok ? "تم الحذف" : "العملية محذوفة مسبقاً";
      if (ok) {
        await tg("editMessageText", {
          chat_id: chatId, message_id: msgId,
          text: `↩️ تم التراجع عن العملية.\n\n${balanceLines(await balances(db))}`,
        });
      }
    }
  } finally {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: toast }).catch(() => {});
  }
}

export async function handleUpdate(db: Db, update: any): Promise<unknown> {
  const allowed = String(process.env["ALLOWED_TELEGRAM_ID"] ?? "").trim();
  const fromId = String(update.message?.from?.id ?? update.callback_query?.from?.id ?? "");
  if (!allowed || fromId !== allowed) {
    if (update.callback_query) await tg("answerCallbackQuery", { callback_query_id: update.callback_query.id }).catch(() => {});
    return;
  }
  try {
    if (update.callback_query) return await handleCallback(db, update.callback_query);
    const msg = update.message;
    if (msg?.text) return await handleText(db, msg.chat.id, msg.text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("bot_logs").insert({ level: "error", message, details: { update } });
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId) await send(chatId, "⚠️ حدث خطأ، حاول مرة أخرى.").catch(() => {});
  }
}
