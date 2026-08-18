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

  const [codeSent, setCodeSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");

  async function handleSendCode() {
    setPhoneMessage("");
    if (!phone.trim()) { setPhoneMessage("Enter a phone number first."); return; }
    setSendingCode(true);
    try {
      const res = await fetch('/api/auth/phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPhoneMessage(body.error ?? 'Could not send code. Please try again.');
        return;
      }
      setCodeSent(true);
      setCode("");
    } catch {
      setPhoneMessage('Could not send code. Please try again.');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    setPhoneMessage("");
    if (!code.trim()) { setPhoneMessage("Enter the code we texted you."); return; }
    setVerifyingCode(true);
    try {
      const res = await fetch('/api/auth/phone/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const body = await res.json();
      if (!res.ok || !body.approved) {
        setPhoneMessage(body.error ?? 'Incorrect or expired code. Please try again.');
        return;
      }
      setPhoneVerified(true);
      setPhoneMessage("");
    } catch {
      setPhoneMessage('Could not verify code. Please try again.');
    } finally {
      setVerifyingCode(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (mode === "signup") {
      if (!phone.trim()) {
        setMessage('A phone number is required.');
        return;
      }
      if (!phoneVerified) {
        setMessage('Please verify your phone number first.');
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
                name="email"
                autoComplete={mode === "signin" ? "username" : "email"}
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
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
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
                  style={{ ...inputStyle, opacity: phoneVerified ? 0.6 : 1 }}
                  type="tel"
                  value={phone}
                  disabled={phoneVerified}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (codeSent) { setCodeSent(false); setCode(""); setPhoneMessage(""); }
                  }}
                  placeholder="(555) 555-5555"
                />
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  Used to verify your identity and limit beta access to one account per agent. We won&apos;t text you unless you opt in from your account settings.
                </p>

                {phoneVerified ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#34D399', fontWeight: 600 }}>
                    ✓ Phone verified
                  </p>
                ) : !codeSent ? (
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode || !phone.trim()}
                    style={{ ...ghostBtn, width: 'auto', padding: '9px 16px', fontSize: 13, marginTop: 10, opacity: sendingCode || !phone.trim() ? 0.6 : 1 }}
                  >
                    {sendingCode ? 'Sending…' : 'Send verification code'}
                  </button>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 7 }}>
                      Enter the 6-digit code we texted you
                    </label>
                    <input
                      style={inputStyle}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={handleVerifyCode}
                        disabled={verifyingCode || code.length !== 6}
                        style={{ ...ghostBtn, width: 'auto', padding: '9px 16px', fontSize: 13, opacity: verifyingCode || code.length !== 6 ? 0.6 : 1 }}
                      >
                        {verifyingCode ? 'Verifying…' : 'Verify code'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={sendingCode}
                        style={{ background: 'none', border: 'none', color: C.purpleL, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'sans-serif' }}
                      >
                        {sendingCode ? 'Resending…' : 'Resend code'}
                      </button>
                    </div>
                  </div>
                )}

                {phoneMessage && (
                  <p style={{ color: '#F87171', fontSize: 12.5, margin: '10px 0 0' }}>{phoneMessage}</p>
                )}
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

            <button
              style={{
                ...primaryBtn,
                opacity: mode === "signup" && !phoneVerified ? 0.5 : 1,
                cursor: mode === "signup" && !phoneVerified ? 'not-allowed' : 'pointer',
              }}
              type="submit"
              disabled={mode === "signup" && !phoneVerified}
            >
              {mode === "signin"
                ? "Sign in →"
                : phoneVerified ? "Create account →" : "Verify your phone to continue"}
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
