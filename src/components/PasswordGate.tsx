import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const KEY = "wallet_pw";

export function PasswordGate({ children }: { children: (pw: string, logout: () => void) => ReactNode }) {
  const [pw, setPw] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => setPw(localStorage.getItem(KEY)), []);
  const logout = () => { localStorage.removeItem(KEY); setPw(null); };
  if (pw) return <>{children(pw, logout)}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-hero px-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl border bg-card/70 p-6 backdrop-blur"
        onSubmit={(e) => { e.preventDefault(); localStorage.setItem(KEY, draft); setPw(draft); }}
      >
        <h1 className="text-2xl font-bold">🔒 محفظتي</h1>
        <p className="text-sm text-muted-foreground">أدخل كلمة السر للمتابعة</p>
        <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="كلمة السر" autoFocus />
        <Button type="submit" className="w-full">دخول</Button>
      </form>
    </main>
  );
}
