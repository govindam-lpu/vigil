"use client";

import type { FormEvent } from "react";
import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-4 text-lg font-semibold text-blue-600">Vigil</div>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
      </Card>
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
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-4 text-lg font-semibold text-blue-600">Vigil</div>
          <CardTitle>{mode === "sign-in" ? "Sign in" : "Create account"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitEmailPassword}>
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
          <div className="my-4 h-px bg-neutral-200" />
          <Button type="button" variant="secondary" className="w-full" onClick={signInWithGoogle} disabled={loading}>
            Continue with Google
          </Button>
          <button
            type="button"
            className="mt-4 text-sm font-medium text-blue-600 hover:underline"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setMessage(null);
            }}
          >
            {mode === "sign-in" ? "Create an account" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
