import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import { getDashboard } from "@/lib/admin.functions";
import { PasswordGate } from "@/components/PasswordGate";
import { fmt, localDate, ACCOUNT_LABEL, type Account } from "@/lib/bot/parse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "محفظتي — لوحة الرصيد" },
      { name: "description", content: "الرصيد، آخر العمليات ومصاريف الشهر حسب الفئة." },
      { property: "og:title", content: "محفظتي — لوحة الرصيد" },
      { property: "og:description", content: "الرصيد، آخر العمليات ومصاريف الشهر حسب الفئة." },
    ],
  }),
  component: () => <PasswordGate>{(pw, logout) => <Dashboard pw={pw} logout={logout} />}</PasswordGate>,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard({ pw, logout }: { pw: string; logout: () => void }) {
  const fetchDash = useServerFn(getDashboard);
  const q = useQuery({ queryKey: ["dash", pw], queryFn: () => fetchDash({ data: { password: pw } }), retry: false });

  if (q.isError) return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-expense">{(q.error as Error).message}</p>
      <button onClick={logout} className="text-primary underline">إعادة المحاولة</button>
    </main>
  );
  const d = q.data;
  return (
    <main className="mx-auto min-h-screen max-w-md pb-12">
      <header className="bg-hero rounded-b-[2rem] px-6 pb-8 pt-10">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>محفظتي</span>
          <Link to="/admin" className="hover:text-foreground">⚙️ الإعدادات</Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">المجموع</p>
        <p className="text-4xl font-bold tracking-tight">{d ? fmt(d.pocket + d.bank) : "…"}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat label="💵 الجيب" value={d?.pocket} />
          <Stat label="💳 البنك" value={d?.bank} />
        </div>
      </header>

      <section className="mx-4 mt-6 rounded-3xl border bg-card p-5">
        <h2 className="font-bold">مصاريف {d?.month ?? ""}</h2>
        {d && d.categories.length ? (
          <div className="mt-2 flex items-center gap-4">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.categories} dataKey="value" innerRadius={38} outerRadius={64} stroke="none">
                    {d.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5 text-sm">
              {d.categories.map((c, i) => (
                <li key={c.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {c.name}
                  </span>
                  <span className="text-muted-foreground">{fmt(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">{d ? "لا مصاريف هذا الشهر." : "…"}</p>}
      </section>

      <section className="mx-4 mt-6 rounded-3xl border bg-card p-5">
        <h2 className="font-bold">آخر العمليات</h2>
        <ul className="mt-3 divide-y">
          {d?.last.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{t.category}</p>
                <p className="text-xs text-muted-foreground">
                  {localDate(t.created_at)} · {ACCOUNT_LABEL[t.account as Account]}{t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
              <span dir="ltr" className={t.amount >= 0 ? "text-income font-bold" : "text-expense font-bold"}>
                {t.amount >= 0 ? "+" : ""}{fmt(t.amount)}
              </span>
            </li>
          ))}
          {d && !d.last.length && <li className="py-3 text-sm text-muted-foreground">أرسل أول عملية للبوت 👋</li>}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 backdrop-blur">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value === undefined ? "…" : fmt(value)}</p>
    </div>
  );
}
