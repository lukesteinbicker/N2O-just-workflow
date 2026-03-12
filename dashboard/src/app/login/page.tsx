"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const REDIRECT_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//localhost:${window.location.port}/auth/callback`
    : "http://localhost:4001/auth/callback";

const MAGIC_LINK_SENDER = "auth@nos.dev";

function emailSearchUrl(client: "superhuman" | "gmail" | "outlook") {
  const from = encodeURIComponent(MAGIC_LINK_SENDER);
  switch (client) {
    case "superhuman":
      return `https://mail.superhuman.com/?search=from%3A${from}`;
    case "gmail":
      return `https://mail.google.com/mail/u/0/#search/from%3A${from}`;
    case "outlook":
      return `https://outlook.live.com/mail/0/search?query=from%3A${from}`;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showMagicLink, setShowMagicLink] = useState(false);

  async function handleGoogleSignIn() {
    if (!supabase) return;

    setStatus("loading");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: REDIRECT_URL,
        scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setStatus("loading");
    setErrorMsg("");

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: REDIRECT_URL,
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
        <h1 className="mb-6 text-lg font-medium text-[#F6F7F9]">Sign in to NOS</h1>

        {status === "sent" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#ABB3BF]">
              We sent a magic link to <span className="text-[#F6F7F9]">{email}</span>
            </p>
            <p className="text-xs text-[#5F6B7C]">
              From <span className="text-[#ABB3BF]">{MAGIC_LINK_SENDER}</span> — check spam if you don't see it.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={emailSearchUrl("superhuman")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-sm border border-[#404854] bg-[#1C2127] px-3 py-2.5 text-sm text-[#F6F7F9] transition-colors hover:border-[#2D72D2] hover:bg-[#2D72D2]/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="sh-grad" x1="0" y1="24" x2="24" y2="0">
                      <stop offset="0%" stopColor="#C084FC" />
                      <stop offset="50%" stopColor="#7DD3FC" />
                      <stop offset="100%" stopColor="#67E8F9" />
                    </linearGradient>
                  </defs>
                  <path d="M4 14.5L12 20l8-5.5L12 9 4 14.5z" stroke="url(#sh-grad)" strokeWidth="2" strokeLinejoin="round" fill="none" />
                  <path d="M4 9.5L12 15l8-5.5L12 4 4 9.5z" stroke="url(#sh-grad)" strokeWidth="2" strokeLinejoin="round" fill="none" />
                </svg>
                Open in Superhuman
              </a>
              <a
                href={emailSearchUrl("gmail")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-sm border border-[#404854] bg-[#1C2127] px-3 py-2.5 text-sm text-[#F6F7F9] transition-colors hover:border-[#2D72D2] hover:bg-[#2D72D2]/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M2 6v13h5V10.5L12 15l5-4.5V19h5V6" fill="none" />
                  <path d="M2 6l10 8 10-8" fill="#EA4335" />
                  <path d="M2 6v13h5V10.5L2 6z" fill="#4285F4" />
                  <path d="M22 6v13h-5V10.5L22 6z" fill="#34A853" />
                  <path d="M17 6v4.5L12 15 7 10.5V6l5 4 5-4z" fill="#EA4335" />
                  <path d="M17 6h5l-5 4.5V6z" fill="#FBBC05" />
                  <path d="M7 6H2l5 4.5V6z" fill="#C5221F" />
                </svg>
                Open in Gmail
              </a>
              <a
                href={emailSearchUrl("outlook")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-sm border border-[#404854] bg-[#1C2127] px-3 py-2.5 text-sm text-[#F6F7F9] transition-colors hover:border-[#2D72D2] hover:bg-[#2D72D2]/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="ol-env" x1="0" y1="0" x2="24" y2="24">
                      <stop offset="0%" stopColor="#28A8EA" />
                      <stop offset="100%" stopColor="#0078D4" />
                    </linearGradient>
                    <linearGradient id="ol-flap" x1="4" y1="2" x2="20" y2="12">
                      <stop offset="0%" stopColor="#50D9FF" />
                      <stop offset="50%" stopColor="#0078D4" />
                      <stop offset="100%" stopColor="#5C2D91" />
                    </linearGradient>
                    <linearGradient id="ol-badge" x1="1" y1="8" x2="10" y2="20">
                      <stop offset="0%" stopColor="#0078D4" />
                      <stop offset="100%" stopColor="#1B3A6E" />
                    </linearGradient>
                  </defs>
                  <path d="M4 9v11a2 2 0 002 2h12a2 2 0 002-2V9l-8 5-8-5z" fill="url(#ol-env)" />
                  <path d="M4 9l8-6a1 1 0 011.2 0L20 9l-8 5-8-5z" fill="url(#ol-flap)" />
                  <rect x="1" y="9" width="9" height="9" rx="2.5" fill="url(#ol-badge)" />
                  <circle cx="5.5" cy="13.5" r="2.5" stroke="white" strokeWidth="1.5" fill="none" />
                </svg>
                Open in Outlook
              </a>
            </div>
            <button
              onClick={() => setStatus("idle")}
              className="text-xs text-[#5F6B7C] hover:text-[#ABB3BF] transition-colors"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Google OAuth */}
            <button
              onClick={handleGoogleSignIn}
              disabled={status === "loading"}
              className="flex items-center justify-center gap-3 rounded-sm border border-[#404854] bg-[#1C2127] px-4 py-2.5 text-sm font-medium text-[#F6F7F9] transition-colors hover:border-[#5F6B7C] hover:bg-[#2A3038] disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-xs text-[#5F6B7C]">
              Google sign-in connects your calendar automatically
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#404854]" />
              <span className="text-xs text-[#5F6B7C]">or</span>
              <div className="h-px flex-1 bg-[#404854]" />
            </div>

            {/* Magic link */}
            {showMagicLink ? (
              <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
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
            ) : (
              <button
                onClick={() => setShowMagicLink(true)}
                className="text-sm text-[#ABB3BF] transition-colors hover:text-[#F6F7F9]"
              >
                Sign in with magic link
              </button>
            )}

            {!showMagicLink && errorMsg && (
              <p className="text-sm text-[#E76A6E]">{errorMsg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
