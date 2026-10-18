"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export function LoginForm({ searchParams: _ }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createClient();

    startTransition(async () => {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          setError(authError.message);
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (authError) {
          setError(authError.message);
          return;
        }
        setError(null);
        // Show confirmation message
        setMode("signin");
        setError("Check your email for a confirmation link, then sign in.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h1>
          {mode === "signin" ? "Good to see you." : "Make room for clarity."}
        </h1>
        <p className="login-intro">
          {mode === "signin"
            ? "Sign in with your work email to pick up where you left off."
            : "Create an account with your work email. Your company membership determines workspace access."}
        </p>
      </div>
      {/* Email */}
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700"
        >
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className={cn(
            "w-full px-3 py-2 text-sm border rounded-md bg-white",
            "placeholder-gray-400 text-gray-900",
            "border-gray-300",
            "focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 focus:border-transparent",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
          placeholder="you@company.com"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            className={cn(
              "w-full px-3 py-2 pr-10 text-sm border rounded-md bg-white",
              "placeholder-gray-400 text-gray-900",
              "border-gray-300",
              "focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 focus:border-transparent",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Error / Info */}
      {error && (
        <div
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            error.startsWith("Check")
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-red-50 text-red-700 border border-red-200",
          )}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || !email || !password}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "px-4 py-2.5 text-sm font-medium rounded-md",
          "bg-blue-600 text-white hover:bg-blue-700",
          "focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2",
          "transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "signin" ? "Sign in" : "Create account"}
      </button>

      {/* Mode toggle */}
      <p className="text-center text-sm text-gray-500">
        {mode === "signin" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className="text-blue-600 hover:underline"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className="text-blue-600 hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}
