"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const C = {
  bg:      '#0C0C14',
  card:    '#13131f',
  border:  '#1e1e2e',
  input:   '#111118',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("tab") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dre, setDre] = useState("");
  const [message, setMessage] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (mode === "signup") {
      if (!phone.trim()) {
        setMessage('A phone number is required.');
        return;
      }
      const res = await fetch('/api/auth/beta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone, dre: dre.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? 'Something went wrong. Please try again.');
        return;
      }
      // Account created server-side — establish client session
      const supabase = createBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setMessage(signInError.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Sign-in flow
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: rememberMe } }
    );
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: C.input, border: `1px solid #2a2a3a`,
    borderRadius: 12, color: C.text, fontSize: 15,
    padding: '13px 16px', outline: 'none',
    fontFamily: 'sans-serif',
  }

  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '16px',
    background: C.purple, color: '#fff',
    border: 'none', borderRadius: 50,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'sans-serif', letterSpacing: '-0.01em',
  }

  const ghostBtn: React.CSSProperties = {
    width: '100%', padding: '15px',
    background: '#1a1a2e', color: C.sub,
    border: `1px solid #333`, borderRadius: 50,
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
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: '22px', letterSpacing: '-0.5px', lineHeight: 1 }}>
            <span style={{ fontWeight: 300, color: C.text }}>the</span>
            <span style={{ fontWeight: 600, color: '#534AB7' }}>qr</span>
            <span style={{ fontWeight: 300, color: C.text }}>ealtor</span>
          </span>
        </div>

        {/* Card */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 24, padding: '36px 32px',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 28px' }}>
            {mode === "signin"
              ? "Sign in to your theqrealtor account."
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

            {mode === "signup" && (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Mobile phone number</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                />
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  Used to verify your identity and limit beta access to one account per agent. We won&apos;t text you unless you opt in from your account settings.
                </p>
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Real estate license number (optional)</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={dre}
                  onChange={(e) => setDre(e.target.value)}
                  placeholder="DRE #01234567"
                />
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  e.g., DRE #01234567. Not currently verified — we may use it in the future to confirm active licensure.
                </p>
              </div>
            )}

            {mode === "signin" && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: C.purple, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: C.muted }}>Remember me</span>
              </label>
            )}

            {message && (
              <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{message}</p>
            )}

            <button style={primaryBtn} type="submit">
              {mode === "signin" ? "Sign in →" : "Create account →"}
            </button>
            <button
              style={ghostBtn}
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
            >
              {mode === "signin"
                ? <>Need an account? <span style={{ color: C.purpleL, fontWeight: 700 }}>Sign up free</span></>
                : <>Already have an account? <span style={{ color: C.purpleL, fontWeight: 700 }}>Sign in</span></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
