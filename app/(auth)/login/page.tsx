"use client";

import type { FormEvent } from "react";
import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/wordmark";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthThreshold />}>
      <LoginForm />
    </Suspense>
  );
}

// The threshold: the night panel (the watch) beside the daylight form (the record).
// On mobile the night panel condenses to a compact header band.
function AuthThreshold({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="flex items-center bg-night px-6 py-10 lg:w-[42%] lg:px-16">
        <div>
          <Wordmark className="text-2xl text-white lg:text-[44px]" />
          <p className="mt-3 max-w-sm text-base text-white/60 lg:mt-5">
            Keep watch, together. One shared record for the person you care for.
          </p>
        </div>
      </section>
      <section className="flex flex-1 items-start justify-center px-4 py-10 lg:items-center lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(callbackError);

  const submitEmailPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`
            }
          });

    setLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setLoading(false);
      setMessage(error.message);
    }
  };

  return (
    <AuthThreshold>
      <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {mode === "sign-in"
          ? "Pick up where the record left off."
          : "Start a shared record for someone you care for."}
      </p>
      <form className="mt-6 space-y-4" onSubmit={submitEmailPassword}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs text-neutral-400">or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={signInWithGoogle} disabled={loading}>
        Continue with Google
      </Button>
      <button
        type="button"
        className="mt-4 text-sm font-medium text-brand-600 hover:underline"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setMessage(null);
        }}
      >
        {mode === "sign-in" ? "Create an account" : "Already have an account? Sign in"}
      </button>
    </AuthThreshold>
  );
}
