"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setStatus("loading");
    setErrorMsg("");

    // Pre-auth validation: check email exists in developers table
    const { data, error: queryError } = await supabase
      .from("developers")
      .select("name")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (queryError || !data) {
      setStatus("error");
      setErrorMsg("Email not authorized.");
      return;
    }

    // Send magic link
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (otpError) {
      setStatus("error");
      setErrorMsg(otpError.message);
      return;
    }

    setStatus("sent");
  }

  // Dev mode: no Supabase credentials
  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1C2127]">
        <div className="w-full max-w-sm rounded-sm border border-[#404854] bg-[#252A31] p-6">
          <p className="text-sm text-[#ABB3BF]">
            Dev mode — auth bypassed (no Supabase credentials).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1C2127]">
      <div className="w-full max-w-sm rounded-sm border border-[#404854] bg-[#252A31] p-6">
        <h1 className="mb-6 text-lg font-medium text-[#F6F7F9]">Sign in to N2O</h1>

        {status === "sent" ? (
          <p className="text-sm text-[#ABB3BF]">
            Check your email for a magic link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-[#ABB3BF]">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-sm border border-[#404854] bg-[#1C2127] px-3 py-2 text-sm text-[#F6F7F9] placeholder-[#5F6B7C] outline-none focus:border-[#2D72D2]"
                disabled={status === "loading"}
              />
            </div>

            {errorMsg && (
              <p className="text-sm text-[#E76A6E]">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-sm bg-[#2D72D2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#215DB0] disabled:opacity-50"
            >
              {status === "loading" ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
