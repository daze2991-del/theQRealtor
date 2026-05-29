"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  input:   '#13131A',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const supabase = createBrowserSupabase();
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password, options: { data: { name } } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Account created. Check your email to confirm, then sign in.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: C.input, border: `1px solid ${C.border}`,
    borderRadius: 10, color: C.text, fontSize: 15,
    padding: '12px 14px', outline: 'none',
    fontFamily: 'sans-serif',
  }

  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '13px',
    background: C.purple, color: '#fff',
    border: 'none', borderRadius: 10,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'sans-serif', letterSpacing: '-0.01em',
  }

  const ghostBtn: React.CSSProperties = {
    width: '100%', padding: '13px',
    background: 'transparent', color: C.sub,
    border: `1px solid ${C.border}`, borderRadius: 10,
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'sans-serif',
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', fontFamily: 'sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 36 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill={C.purple}/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 20, color: C.text, letterSpacing: '-0.02em' }}>
            the<span style={{ color: C.purple }}>QR</span>ealtor.
          </span>
        </div>

        {/* Card */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '32px 32px',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 28px' }}>
            {mode === "signin"
              ? "Sign in to your theQRealtor account."
              : "Start capturing buyer leads for free."}
          </p>

          <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
            {mode === "signup" && (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Name</label>
                <input
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Email</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
              />
            </div>

            {message && (
              <p style={{ color: mode === 'signup' && message.includes('created') ? '#4ade80' : '#F87171', fontSize: 13, margin: 0 }}>
                {message}
              </p>
            )}

            <button style={primaryBtn} type="submit">
              {mode === "signin" ? "Sign in →" : "Create account →"}
            </button>
            <button
              style={ghostBtn}
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
            >
              {mode === "signin" ? "Need an account? Sign up free" : "Already have an account? Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
