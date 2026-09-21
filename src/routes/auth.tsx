import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugifyUsername } from "@/lib/sweecord";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Giriş yap — SweeCord" },
      { name: "description", content: "SweeCord hesabınla giriş yap veya yeni hesap oluştur." },
      { property: "og:title", content: "Giriş yap — SweeCord" },
      { property: "og:description", content: "SweeCord hesabınla giriş yap veya yeni hesap oluştur." },
    ],
  }),
  component: AuthPage,
});

const credsSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta gir").max(255),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı").max(72),
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Bilgileri kontrol et");
      return;
    }
    if (mode === "signup" && slugifyUsername(username).length < 3) {
      toast.error("Kullanıcı adı en az 3 karakter olmalı (harf, rakam, _ veya .)");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: slugifyUsername(username), display_name: username.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
        navigate({ to: "/app", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        navigate({ to: "/app", replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bir hata oluştu";
      toast.error(
        message.includes("Invalid login credentials")
          ? "E-posta veya şifre hatalı"
          : message.includes("Email not confirmed")
            ? "Önce e-postandaki onay bağlantısına tıkla"
            : message.includes("already registered")
              ? "Bu e-posta zaten kayıtlı"
              : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-rail px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-card p-8 shadow-panel">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary">
            <MessagesSquare className="size-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">
            {sent ? "E-postanı kontrol et" : mode === "signin" ? "Tekrar hoş geldin!" : "Hesap oluştur"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {sent
              ? "Hesabını etkinleştirmek için gönderdiğimiz onay bağlantısına tıkla."
              : mode === "signin"
                ? "Seni yeniden görmek güzel."
                : "Birkaç saniye sürer."}
          </p>
        </div>

        {sent ? (
          <Button className="w-full" onClick={() => { setSent(false); setMode("signin"); }}>
            Giriş ekranına dön
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                E-posta
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-0 bg-input"
                required
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Kullanıcı adı
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  className="border-0 bg-input"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Şifre
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-0 bg-input"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Lütfen bekle…" : mode === "signin" ? "Giriş yap" : "Kaydol"}
            </Button>

            <p className="text-sm text-muted-foreground">
              {mode === "signin" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Kaydol" : "Giriş yap"}
              </button>
            </p>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </div>
  );
}
