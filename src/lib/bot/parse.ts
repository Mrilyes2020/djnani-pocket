// Pure parsing helpers for the money bot (no I/O) — testable.

export type Account = "pocket" | "bank";

const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٫": ".", "−": "-", "–": "-",
};

export function normalize(text: string): string {
  return text
    .replace(/[٠-٩۰-۹٫−–]/g, (c) => DIGIT_MAP[c] ?? c)
    .replace(/[\u064B-\u0652\u0640]/g, "") // harakat + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAmountToken(tok: string): number | null {
  const m = tok.match(/^(\d+(?:[.,]\d+)?)(k|ك)?$/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const POCKET_WORDS = ["جيب", "الجيب", "كاش", "cash"];
const BANK_WORDS = ["بنك", "البنك", "ccp", "بريد", "البريد"];

export function detectAccount(words: string[]): { account: Account | null; rest: string[] } {
  let account: Account | null = null;
  const rest: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    const bare = lw.replace(/^(من|في|لل|ل|بال|ب)/, "");
    if (POCKET_WORDS.includes(lw) || POCKET_WORDS.includes(bare)) account = "pocket";
    else if (BANK_WORDS.includes(lw) || BANK_WORDS.includes(bare)) account = "bank";
    else rest.push(w);
  }
  return { account, rest };
}

export function matchCategory(words: string[], keywords: { keyword: string; category: string }[]): string {
  const map = new Map(keywords.map((k) => [normalize(k.keyword), k.category]));
  for (const w of words) {
    const n = normalize(w);
    const candidates = [n, n.replace(/^ال/, ""), n.replace(/^(و|ب|ل)/, "").replace(/^ال/, "")];
    for (const c of candidates) {
      const hit = map.get(c);
      if (hit) return hit;
    }
  }
  return "أخرى";
}

export type ParsedTx = { amount: number; account: Account | null; words: string[] };

/** "[+/-]amount words [account]" → signed amount (expense negative by default). */
export function parseTransaction(raw: string): ParsedTx | null {
  const t = normalize(raw);
  const m = t.match(/^([+-])?\s*(\d+(?:[.,]\d+)?(?:k|ك)?)(?:\s+(.*))?$/i);
  if (!m) return null;
  const n = parseAmountToken(m[2]);
  if (n === null) return null;
  const words = (m[3] ?? "").split(" ").filter(Boolean);
  const { account, rest } = detectAccount(words);
  return { amount: m[1] === "+" ? n : -n, account, words: rest };
}

export type LoanAction =
  | { kind: "lend"; person: string; amount: number; account: Account | null } // he owes me
  | { kind: "borrow"; person: string; amount: number; account: Account | null } // I owe him
  | { kind: "repaid_to_me"; person: string; amount: number; account: Account | null }
  | { kind: "i_repaid"; person: string; amount: number; account: Account | null };

export function parseLoan(raw: string): LoanAction | null {
  const t = normalize(raw);
  const m = t.match(/^(قرضت|سلفت|استلفت|تسلفت|رد|ردلي|رجع|سددت|رديت|خلصت)\s+(.+)$/);
  if (!m) return null;
  const words = m[2].split(" ").filter(Boolean);
  const { account, rest } = detectAccount(words);
  let amount: number | null = null;
  const nameParts: string[] = [];
  for (const w of rest) {
    const a = amount === null ? parseAmountToken(w) : null;
    if (a !== null) amount = a;
    else if (!["من", "ل", "الى", "لـ"].includes(w)) nameParts.push(w);
  }
  const person = nameParts.join(" ").trim();
  if (!amount || !person) return null;
  const verb = m[1];
  if (verb === "قرضت" || verb === "سلفت") return { kind: "lend", person, amount, account };
  if (verb === "استلفت" || verb === "تسلفت") return { kind: "borrow", person, amount, account };
  if (verb === "سددت" || verb === "رديت" || verb === "خلصت") return { kind: "i_repaid", person, amount, account };
  return { kind: "repaid_to_me", person, amount, account };
}

export function parseTransfer(raw: string): { amount: number; to: Account } | null {
  const t = normalize(raw).replace(/^\/transfer\s*/, "حول ");
  const m = t.match(/^(حول|حولت)\s+(\S+)\s+(.+)$/);
  if (!m) return null;
  const amount = parseAmountToken(m[2]);
  if (!amount) return null;
  const { account } = detectAccount(m[3].split(" "));
  if (!account) return null;
  return { amount, to: account };
}

export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n * 100) / 100);
  const [int, dec] = abs.toString().split(".");
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${dec ? "," + dec : ""} دج`;
}

export const ACCOUNT_LABEL: Record<Account, string> = { pocket: "الجيب", bank: "البنك" };
export const NON_FLOW_CATEGORIES = ["تحويل", "تعديل", "قروض"];

/** Algeria is UTC+1 with no DST. Returns UTC ISO bounds of a month. */
export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, -1));
  const end = new Date(Date.UTC(y, m, 1, -1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function currentYm(d = new Date()): string {
  const local = new Date(d.getTime() + 3600_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function localDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
