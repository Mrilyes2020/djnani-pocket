import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || token.length > 256) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valid, error } = await (supabaseAdmin as any).rpc("verify_telegram_reminder_token", { token });
        if (error) return new Response("Unavailable", { status: 503 });
        if (valid !== true) return new Response("Unauthorized", { status: 401 });
        const chatId = process.env["ALLOWED_TELEGRAM_ID"]?.trim();
        if (!chatId || !process.env["TELEGRAM_BOT_TOKEN"]) return new Response("Unavailable", { status: 503 });
        const { tg } = await import("@/lib/bot/handler.server");
        try {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "⏰ تذكير: سجّل مصاريفك ومداخيلك في محفظتي اليوم.",
            disable_web_page_preview: true,
          });
          return Response.json({ ok: true });
        } catch {
          await supabaseAdmin.from("bot_logs").insert({ level: "error", message: "Daily reminder delivery failed" });
          return new Response("Delivery failed", { status: 502 });
        }
      },
    },
  },
});