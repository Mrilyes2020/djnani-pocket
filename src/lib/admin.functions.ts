import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function checkPassword(pw: string) {
  const expected = process.env["DASHBOARD_PASSWORD"];
  if (!expected || pw !== expected) throw new Error("كلمة السر غير صحيحة");
}

export const setWebhook = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(200), url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { webhookSecret } = await import("@/lib/bot/secret.server");
    const { tg } = await import("@/lib/bot/handler.server");
    await tg("setWebhook", {
      url: data.url,
      secret_token: webhookSecret(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    await tg("setMyCommands", {
      commands: [
        { command: "start", description: "القائمة الرئيسية" },
        { command: "undo", description: "حذف آخر عملية" },
        { command: "edit", description: "حذف إحدى آخر 5 عمليات" },
        { command: "month", description: "ملخص الشهر" },
        { command: "transfer", description: "تحويل بين الجيب والبنك" },
        { command: "export", description: "تصدير CSV" },
        { command: "set_pocket", description: "ضبط رصيد الجيب" },
        { command: "set_bank", description: "ضبط رصيد البنك" },
      ],
    });
    return { ok: true };
  });

export const getWebhookInfo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { tg } = await import("@/lib/bot/handler.server");
    const info = (await tg("getWebhookInfo", {})) as {
      url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number;
    };
    return {
      url: info.url,
      pending: info.pending_update_count,
      lastError: info.last_error_message ?? null,
      allowedIdSet: Boolean(process.env["ALLOWED_TELEGRAM_ID"]),
    };
  });

export const getDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentYm, monthBounds, NON_FLOW_CATEGORIES } = await import("@/lib/bot/parse");
    const [all, last] = await Promise.all([
      supabaseAdmin.from("transactions").select("amount, account, category, created_at"),
      supabaseAdmin.from("transactions").select("id, amount, account, category, note, created_at")
        .order("created_at", { ascending: false }).limit(20),
    ]);
    if (all.error) throw new Error(all.error.message);
    if (last.error) throw new Error(last.error.message);
    const { start, end } = monthBounds(currentYm());
    let pocket = 0, bank = 0;
    const cats = new Map<string, number>();
    for (const r of all.data ?? []) {
      const a = Number(r.amount);
      if (r.account === "pocket") pocket += a; else bank += a;
      if (a < 0 && r.created_at >= start && r.created_at < end && !NON_FLOW_CATEGORIES.includes(r.category)) {
        cats.set(r.category, (cats.get(r.category) ?? 0) - a);
      }
    }
    return {
      pocket, bank, month: currentYm(),
      categories: [...cats.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      last: (last.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
    };
  });
