import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret } = await import("@/lib/bot/secret.server");
        if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret()) {
          return new Response("Unauthorized", { status: 401 });
        }
        const update = await request.json().catch(() => null);
        if (!update) return Response.json({ ok: true });
        const [{ supabaseAdmin }, { handleUpdate }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/bot/handler.server"),
        ]);
        await handleUpdate(supabaseAdmin as any, update);
        return Response.json({ ok: true });
      },
    },
  },
});
