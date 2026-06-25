"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [betaFull, setBetaFull] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistMessage, setWaitlistMessage] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);

  // Beta Agent program is capped at this many accounts. Past the cap, signups
  // are blocked and overflow emails are collected on the waitlist instead.
  const SIGNUP_CAP = 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const supabase = createBrowserSupabase();

    if (mode === "signup") {
      // Validate invite code before anything else
      const codeRes = await fetch('/api/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode }),
      })
      const codeData = await codeRes.json()
      if (!codeData.valid) {
        setMessage(codeData.error ?? 'Invalid invite code.')
        return
      }

      // Enforce the hard cap before creating anything. signup_count() is a
      // SECURITY DEFINER RPC that counts profiles past the per-row RLS.
      const { data: count, error: countError } = await supabase.rpc("signup_count");
      if (countError) {
        console.error("[auth] signup_count failed:", countError.message);
      } else if (typeof count === "number" && count >= SIGNUP_CAP) {
        setWaitlistEmail(email);
        setBetaFull(true);
        return;
      }
    }

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password, options: { data: { name } } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup") {
      // Mark invite code as used now that the account exists
      await fetch('/api/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode, claim: true, email }),
      })
      setMessage("Account created. Check your email to confirm, then sign in.");
      return;
    }

    // Sign-in success. The dashboard routes brand-new agents (no property and
    // onboarding not completed) into the onboarding wizard, which ends at
    // /dashboard/welcome — so we just land on /dashboard here.
    router.push("/dashboard");
    router.refresh();
  }

  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWaitlistMessage("");

    if (!waitlistEmail.trim()) {
      setWaitlistMessage("Please enter your email.");
      return;
    }

    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("waitlist").insert({ email: waitlistEmail.trim() });
    if (error) {
      setWaitlistMessage(error.message);
      return;
    }
    setWaitlistDone(true);
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
          borderRadius: 24, padding: '36px 32px',
        }}>
          {betaFull ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                Beta Agent program is full
              </h1>
              {waitlistDone ? (
                <p style={{ fontSize: 14, color: '#4ade80', margin: '12px 0 0', lineHeight: 1.6 }}>
                  You're on the list! We'll email you the moment a spot opens.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 28px', lineHeight: 1.6 }}>
                    Our Beta Agent program is currently full. Drop your email below and we'll notify you when a spot opens.
                  </p>
                  <form onSubmit={joinWaitlist} style={{ display: 'grid', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Email</label>
                      <input
                        style={inputStyle}
                        type="email"
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </div>

                    {waitlistMessage && (
                      <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{waitlistMessage}</p>
                    )}

                    <button style={primaryBtn} type="submit">Notify me →</button>
                  </form>
                </>
              )}
            </>
          ) : (
            <>
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
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>Invite Code</label>
                    <input
                      style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="TQRB-000"
                      required
                      autoComplete="off"
                    />
                  </div>
                )}
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
                  onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setInviteCode(""); }}
                >
                  {mode === "signin"
                    ? <>Need an account? <span style={{ color: C.purpleL, fontWeight: 700 }}>Sign up free</span></>
                    : <>Already have an account? <span style={{ color: C.purpleL, fontWeight: 700 }}>Sign in</span></>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
