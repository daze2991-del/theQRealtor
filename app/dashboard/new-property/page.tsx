"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import DashboardLayout from "@/components/DashboardLayout";

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  input:   '#0D1117',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 9, color: C.text, fontSize: 14, padding: '10px 14px',
  outline: 'none', fontFamily: 'sans-serif',
}

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600,
  color: C.sub, marginBottom: 6,
}

interface UploadedPhoto {
  id: string;
  url: string;
  storagePath: string;
  preview: string;
}

export default function NewPropertyPage() {
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'photos'>('form');
  const [savedPropertyId, setSavedPropertyId] = useState('');

  // Form fields
  const [address, setAddress] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [price, setPrice] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // Photo upload state
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const checkLimit = async () => {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from('profiles').select('plan').eq('id', user.id).single(),
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if ((profile?.plan || 'free') === 'free' && (count || 0) >= 1) {
        setBlocked(true);
      }
    };
    checkLimit();
  }, []);

  const handleCheckout = async (billingPlan: 'monthly' | 'yearly') => {
    setCheckingOut(true);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: billingPlan }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setCheckingOut(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be signed in.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("properties").insert({
      address,
      agent_name: agentName,
      agent_phone: agentPhone || null,
      city,
      state,
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      description,
      user_id: user.id,
      active: true,
    }).select('id').single();

    if (error || !data) {
      setMessage(error?.message || 'Failed to create property.');
      setLoading(false);
      return;
    }

    setSavedPropertyId(data.id);
    setStep('photos');
    setLoading(false);
  }

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!savedPropertyId || !userId) return;
    const arr = Array.from(files).slice(0, 10 - uploadedPhotos.length);
    if (arr.length === 0) return;

    setUploading(true);
    setUploadError('');
    const supabase = createBrowserSupabase();

    for (const file of arr) {
      if (!file.type.startsWith('image/')) continue;
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `${userId}/${savedPropertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('property-photos')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadErr) {
        setUploadError(`Upload failed: ${uploadErr.message}`);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('property-photos')
        .getPublicUrl(storagePath);

      const { data: photoRow, error: dbErr } = await supabase
        .from('property_photos')
        .insert({
          property_id: savedPropertyId,
          url: publicUrl,
          storage_path: storagePath,
          sort_order: uploadedPhotos.length,
        })
        .select('id')
        .single();

      if (!dbErr && photoRow) {
        const preview = URL.createObjectURL(file);
        setUploadedPhotos(prev => [...prev, {
          id: photoRow.id,
          url: publicUrl,
          storagePath,
          preview,
        }]);
      }
    }
    setUploading(false);
  }, [savedPropertyId, userId, uploadedPhotos.length]);

  const removePhoto = async (photo: UploadedPhoto) => {
    const supabase = createBrowserSupabase();
    await Promise.all([
      supabase.storage.from('property-photos').remove([photo.storagePath]),
      supabase.from('property_photos').delete().eq('id', photo.id),
    ]);
    URL.revokeObjectURL(photo.preview);
    setUploadedPhotos(prev => prev.filter(p => p.id !== photo.id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  if (blocked) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '48px 40px', maxWidth: 480,
            textAlign: 'center', fontFamily: 'sans-serif',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Free plan limit reached</h2>
            <p style={{ color: C.muted, marginBottom: 28, fontSize: 14 }}>
              Upgrade to Pro to add unlimited properties.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleCheckout('monthly')}
                disabled={checkingOut}
                style={{
                  background: C.purple, color: '#fff', border: 'none',
                  borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700,
                  cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1,
                }}
              >
                {checkingOut ? 'Redirecting…' : 'Monthly — $19/mo'}
              </button>
              <button
                onClick={() => handleCheckout('yearly')}
                disabled={checkingOut}
                style={{
                  background: 'transparent', color: C.sub, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600,
                  cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1,
                }}
              >
                {checkingOut ? 'Redirecting…' : 'Yearly — $159/yr'}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div className="db-page-topbar" style={{
        padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
        background: C.bg, position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'sans-serif',
      }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>Add Property</h1>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['Property Details', 'Add Photos'].map((label, i) => {
            const idx = i + 1
            const isActive = (step === 'form' && i === 0) || (step === 'photos' && i === 1)
            const isDone = step === 'photos' && i === 0
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: C.muted, fontSize: 12 }}>›</span>}
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: isDone ? C.purpleL : isActive ? C.text : C.muted,
                }}>
                  {isDone ? `✓ ` : ''}{label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '32px 28px', maxWidth: 640, fontFamily: 'sans-serif' }}>

        {/* ── Step 1: Property Details ── */}
        {step === 'form' && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Property Details</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>Fill in the listing info.</div>
            </div>
            <div style={{ padding: '24px' }}>
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={LABEL}>Property Address *</label>
                  <input style={INPUT} placeholder="123 Oak Avenue, Austin TX 78701" value={address} onChange={e => setAddress(e.target.value)} required />
                </div>
                <div>
                  <label style={LABEL}>Agent Name *</label>
                  <input style={INPUT} placeholder="Sarah Johnson" value={agentName} onChange={e => setAgentName(e.target.value)} required />
                </div>
                <div>
                  <label style={LABEL}>Agent Phone <span style={{ color: C.muted, fontWeight: 400 }}>(for SMS lead alerts)</span></label>
                  <input style={INPUT} type="tel" placeholder="+12125551234" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LABEL}>City</label>
                    <input style={INPUT} placeholder="Austin" value={city} onChange={e => setCity(e.target.value)} />
                  </div>
                  <div>
                    <label style={LABEL}>State</label>
                    <input style={INPUT} placeholder="TX" value={state} onChange={e => setState(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LABEL}>Price</label>
                    <input style={INPUT} type="number" placeholder="450000" value={price} onChange={e => setPrice(e.target.value)} />
                  </div>
                  <div>
                    <label style={LABEL}>Beds</label>
                    <input style={INPUT} type="number" placeholder="3" value={beds} onChange={e => setBeds(e.target.value)} />
                  </div>
                  <div>
                    <label style={LABEL}>Baths</label>
                    <input style={INPUT} type="number" placeholder="2" value={baths} onChange={e => setBaths(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={LABEL}>Description</label>
                  <textarea
                    style={{ ...INPUT, minHeight: 90, resize: 'vertical' }}
                    placeholder="Briefly describe the property…"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {message && <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{message}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: C.purple, color: '#fff', border: 'none',
                    borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Saving…
                    </>
                  ) : 'Save & Add Photos →'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Step 2: Photo Upload ── */}
        {step === 'photos' && (
          <div>
            <div style={{
              background: `${C.purple}14`, border: `1px solid ${C.purple}35`,
              borderRadius: 12, padding: '14px 18px', marginBottom: 24,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{address}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Property created — now add photos (optional)</div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Property Photos</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
                  Up to 10 photos. The first photo will be the hero image on the buyer page.
                </div>
              </div>
              <div style={{ padding: '24px' }}>
                {/* Uploaded thumbnails */}
                {uploadedPhotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {uploadedPhotos.map((photo, i) => (
                      <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                        {i === 0 && (
                          <div style={{
                            position: 'absolute', top: 4, left: 4, zIndex: 2,
                            background: C.purple, color: '#fff',
                            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                          }}>HERO</div>
                        )}
                        <img src={photo.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => removePhoto(photo)}
                          style={{
                            position: 'absolute', top: 4, right: 4, zIndex: 2,
                            background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                            borderRadius: '50%', width: 22, height: 22, fontSize: 11,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                {uploadedPhotos.length < 10 && (
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${isDragging ? C.purple : C.border}`,
                      borderRadius: 12, padding: '36px 24px',
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragging ? `${C.purple}08` : 'transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 12 }}>
                      {uploading ? '⏳' : '📷'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
                      {uploading ? 'Uploading…' : 'Drag & drop photos here'}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {uploading ? 'Please wait' : `or click to browse · ${10 - uploadedPhotos.length} remaining · JPEG, PNG, WebP`}
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => e.target.files && uploadFiles(e.target.files)}
                />

                {uploadError && (
                  <p style={{ color: '#F87171', fontSize: 13, marginTop: 12 }}>{uploadError}</p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                  <button
                    onClick={() => router.push('/dashboard')}
                    style={{
                      flex: 1, background: C.purple, color: '#fff', border: 'none',
                      borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700,
                      cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1,
                    }}
                    disabled={uploading}
                  >
                    {uploadedPhotos.length > 0 ? 'Finish & Go to Dashboard →' : 'Skip & Go to Dashboard →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
