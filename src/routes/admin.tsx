import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWebhookInfo, setWebhook } from "@/lib/admin.functions";
import { PasswordGate } from "@/components/PasswordGate";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "محفظتي — إعدادات البوت" },
      { name: "description", content: "ربط بوت تيليغرام ومتابعة حالته." },
      { property: "og:title", content: "محفظتي — إعدادات البوت" },
      { property: "og:description", content: "ربط بوت تيليغرام ومتابعة حالته." },
    ],
  }),
  component: () => <PasswordGate>{(pw) => <Admin pw={pw} />}</PasswordGate>,
});

function publicOrigin() {
  const o = window.location.origin;
  // The editor preview host is login-protected; Telegram must use the public dev host.
  const m = o.match(/^https:\/\/id-preview--([^.]+)\.(.+)$/);
  return m ? `https://project--${m[1]}-dev.${m[2]}` : o;
}

function Admin({ pw }: { pw: string }) {
  const info = useServerFn(getWebhookInfo);
  const set = useServerFn(setWebhook);
  const q = useQuery({ queryKey: ["wh", pw], queryFn: () => info({ data: { password: pw } }), retry: false });
  const m = useMutation({
    mutationFn: () => set({ data: { password: pw, url: `${publicOrigin()}/api/public/telegram/webhook` } }),
    onSuccess: () => q.refetch(),
  });
  return (
    <main className="mx-auto min-h-screen max-w-md space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⚙️ إعدادات البوت</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← اللوحة</Link>
      </div>
      <section className="space-y-3 rounded-3xl border bg-card p-5 text-sm">
        <h2 className="font-bold">حالة الربط</h2>
        {q.isLoading && <p className="text-muted-foreground">…</p>}
        {q.isError && <p className="text-expense">{(q.error as Error).message}</p>}
        {q.data && (
          <>
            <Row k="الحالة" v={q.data.url ? "✅ مربوط" : "❌ غير مربوط"} />
            <Row k="الرابط" v={q.data.url || "—"} ltr />
            <Row k="رسائل معلقة" v={String(q.data.pending)} />
            <Row k="معرّفك محفوظ" v={q.data.allowedIdSet ? "✅" : "❌"} />
            {q.data.lastError && <Row k="آخر خطأ" v={q.data.lastError} />}
          </>
        )}
      </section>
      <Button className="w-full" size="lg" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? "جارٍ الربط…" : "🔗 Set Webhook"}
      </Button>
      {m.isError && <p className="text-sm text-expense">{(m.error as Error).message}</p>}
      {m.isSuccess && <p className="text-sm text-income">تم الربط! أرسل /start للبوت.</p>}
    </main>
  );
}

function Row({ k, v, ltr }: { k: string; v: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span dir={ltr ? "ltr" : undefined} className="break-all text-left">{v}</span>
    </div>
  );
}
