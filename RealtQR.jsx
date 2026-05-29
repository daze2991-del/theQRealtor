import { useState, useEffect, useRef, useCallback } from "react";

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────
const T = {
  bg:"#0A0C10", surface:"#111318", card:"#161A22", border:"#1E2330",
  borderLight:"#252C3D", accent:"#00D4AA", accentDim:"#00D4AA22",
  accentHover:"#00EFBF", red:"#FF4757", yellow:"#FFD32A", blue:"#3D8EFF",
  text:"#F0F2F5", textMuted:"#6B7280", textDim:"#9CA3AF",
};

// ─── SIGN TYPES ────────────────────────────────────────────────────────────
const SIGN_TYPES = [
  {label:"Front Sign",       emoji:"🏠", color:"#00D4AA"},
  {label:"Corner Sign",      emoji:"🔶", color:"#FFD32A"},
  {label:"Directional Sign", emoji:"➡️", color:"#3D8EFF"},
  {label:"Back Sign",        emoji:"🔙", color:"#AA77FF"},
  {label:"Open House Sign",  emoji:"🚪", color:"#FF4757"},
  {label:"Custom",           emoji:"📍", color:"#9CA3AF"},
];
const signColor = l => (SIGN_TYPES.find(s=>s.label===l)||SIGN_TYPES.at(-1)).color;
const signEmoji = l => (SIGN_TYPES.find(s=>s.label===l)||SIGN_TYPES.at(-1)).emoji;
const heatColor = (scanCount, maxScanCount) => {
  const ratio = maxScanCount ? scanCount / maxScanCount : 0;
  if (ratio >= 0.66) return "#FF4757";
  if (ratio >= 0.33) return "#FFD32A";
  return "#3D8EFF";
};
const heatEmoji = (scanCount, maxScanCount) => {
  const ratio = maxScanCount ? scanCount / maxScanCount : 0;
  if (ratio >= 0.66) return "🔥";
  if (ratio >= 0.33) return "⚡";
  return "🧊";
};

// ─── UTILS ─────────────────────────────────────────────────────────────────
let _id=1;
const genId  = ()=>`${Date.now()}_${_id++}`;
const fmtDate = d=>new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
const fmtPhone= p=>p.replace(/(\d{3})(\d{3})(\d{4})/,"($1) $2-$3");

// CSV export helper
const exportCSV = (leads, properties, qrcodes) => {
  const rows = [["Name","Phone","Email","Property","Sign","Date"]];
  leads.forEach(l=>{
    const prop = properties.find(p=>p.id===l.property_id);
    const qr   = qrcodes.find(q=>q.id===l.qr_id);
    rows.push([l.name, l.phone, l.email, prop?.address||"", qr?.label||"", fmtDate(l.created_at)]);
  });
  const csv  = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download="realtqr-leads.csv"; a.click();
  URL.revokeObjectURL(url);
};

// ─── SEED DATA ─────────────────────────────────────────────────────────────
const seedData = () => {
  const p1=genId(), p2=genId();
  const q1=genId(), q2=genId(), q3=genId(), q4=genId(), q5=genId();
  const now=Date.now();
  return {
    user:{id:"u1",email:"sarah@realtqr.com",plan:"pro",name:"Sarah Chen"},
    properties:[
      {id:p1,address:"124 Maple Drive, Austin TX 78701",     agent_name:"Sarah Chen",created_at:now-864e5*5, active:true},
      {id:p2,address:"380 Lakeview Blvd, Austin TX 78702",   agent_name:"Sarah Chen",created_at:now-864e5*2, active:false},
    ],
    qrcodes:[
      {id:q1,property_id:p1,label:"Front Sign",       scan_count:34,lat:30.2680,lng:-97.7420,created_at:now-864e5*5},
      {id:q2,property_id:p1,label:"Corner Sign",      scan_count:18,lat:30.2695,lng:-97.7405,created_at:now-864e5*5},
      {id:q3,property_id:p1,label:"Directional Sign", scan_count: 9,lat:30.2665,lng:-97.7435,created_at:now-864e5*4},
      {id:q4,property_id:p2,label:"Front Sign",       scan_count:12,lat:30.2760,lng:-97.7380,created_at:now-864e5*2},
      {id:q5,property_id:p2,label:"Open House Sign",  scan_count: 6,lat:30.2745,lng:-97.7395,created_at:now-864e5*2},
    ],
    leads:[
      {id:genId(),property_id:p1,qr_id:q1,name:"James Miller", phone:"5124441234",email:"james@email.com", created_at:now-864e5*4},
      {id:genId(),property_id:p1,qr_id:q1,name:"Priya Sharma", phone:"5125556789",email:"priya@email.com", created_at:now-864e5*3},
      {id:genId(),property_id:p1,qr_id:q2,name:"Carlos Reyes", phone:"5127778901",email:"carlos@email.com",created_at:now-864e5*3},
      {id:genId(),property_id:p1,qr_id:q1,name:"Aisha Johnson",phone:"5129990001",email:"aisha@email.com", created_at:now-864e5*2},
      {id:genId(),property_id:p1,qr_id:q3,name:"Tom Bradley",  phone:"5123334455",email:"tom@email.com",   created_at:now-864e5*1},
      {id:genId(),property_id:p2,qr_id:q4,name:"Luna Park",    phone:"5126667788",email:"luna@email.com",  created_at:now-864e5*1},
    ],
    scan_events:[
      {id:genId(),qr_id:q1,lat:30.2682,lng:-97.7418,created_at:now-864e5*4},
      {id:genId(),qr_id:q2,lat:30.2697,lng:-97.7403,created_at:now-864e5*3},
      {id:genId(),qr_id:q3,lat:30.2664,lng:-97.7436,created_at:now-864e5*1},
      {id:genId(),qr_id:q4,lat:30.2762,lng:-97.7379,created_at:now-864e5*1},
    ],
  };
};

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html{scroll-behavior:smooth;}
    body{background:${T.bg};color:${T.text};font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}
    h1,h2,h3,h4,h5{font-family:'Syne',sans-serif;font-weight:700;line-height:1.15;}
    button{cursor:pointer;border:none;outline:none;font-family:inherit;}
    input,textarea,select{font-family:inherit;outline:none;}
    a{text-decoration:none;color:inherit;}

    ::-webkit-scrollbar{width:6px;}
    ::-webkit-scrollbar-track{background:${T.bg};}
    ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px;}

    @keyframes fadeUp  {from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
    @keyframes fadeIn  {from{opacity:0;}to{opacity:1;}}
    @keyframes spin    {to{transform:rotate(360deg);}}
    @keyframes scanLine{0%{top:10%;}100%{top:90%;}}
    @keyframes glow    {0%,100%{box-shadow:0 0 20px ${T.accent}33;}50%{box-shadow:0 0 40px ${T.accent}66;}}
    @keyframes livePulse{0%{transform:scale(1);opacity:1;}100%{transform:scale(2.4);opacity:0;}}

    .fade-up{animation:fadeUp .4s ease both;}
    .fade-in{animation:fadeIn .3s ease both;}

    /* ── Buttons ── */
    .btn-primary{background:${T.accent};color:#000;font-family:'Syne',sans-serif;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;transition:all .2s;display:inline-flex;align-items:center;gap:8px;letter-spacing:.01em;}
    .btn-primary:hover{background:${T.accentHover};transform:translateY(-1px);box-shadow:0 6px 20px ${T.accent}44;}
    .btn-primary:active{transform:translateY(0);}
    .btn-primary:disabled{opacity:.5;pointer-events:none;}

    .btn-secondary{background:${T.card};color:${T.textDim};font-family:'Syne',sans-serif;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;border:1px solid ${T.border};transition:all .2s;display:inline-flex;align-items:center;gap:8px;}
    .btn-secondary:hover{border-color:${T.borderLight};color:${T.text};background:${T.surface};}

    .btn-ghost{background:transparent;color:${T.textMuted};font-size:13px;padding:7px 14px;border-radius:6px;border:1px solid transparent;transition:all .18s;display:inline-flex;align-items:center;gap:6px;}
    .btn-ghost:hover{background:${T.card};color:${T.text};border-color:${T.border};}

    /* ── Forms ── */
    .input-field{background:${T.surface};border:1px solid ${T.border};border-radius:8px;color:${T.text};font-size:14px;padding:10px 14px;width:100%;transition:border-color .2s,box-shadow .2s;}
    .input-field::placeholder{color:${T.textMuted};}
    .input-field:focus{border-color:${T.accent};box-shadow:0 0 0 3px ${T.accent}18;}

    /* ── Toggle switch ── */
    .toggle-wrap{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;}
    .toggle-track{width:44px;height:24px;border-radius:12px;transition:background .2s;position:relative;flex-shrink:0;}
    .toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.4);}
    .toggle-on .toggle-track{background:${T.accent};}
    .toggle-off .toggle-track{background:${T.border};}
    .toggle-on  .toggle-thumb{transform:translateX(20px);}

    /* ── Live badge ── */
    .live-badge{display:inline-flex;align-items:center;gap:6px;background:${T.red}18;color:${T.red};border:1px solid ${T.red}33;font-size:11px;font-weight:700;font-family:'Syne',sans-serif;padding:3px 10px;border-radius:100px;letter-spacing:.04em;}
    .live-dot{width:7px;height:7px;border-radius:50%;background:${T.red};position:relative;}
    .live-dot::after{content:'';position:absolute;inset:0;border-radius:50%;background:${T.red};animation:livePulse 1.4s ease-out infinite;}

    /* ── Cards / badges ── */
    .card{background:${T.card};border:1px solid ${T.border};border-radius:14px;}
    .badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;font-family:'Syne',sans-serif;padding:3px 10px;border-radius:100px;letter-spacing:.04em;}
    .badge-green {background:${T.accent}18;color:${T.accent};border:1px solid ${T.accent}33;}
    .badge-yellow{background:${T.yellow}18;color:${T.yellow};border:1px solid ${T.yellow}33;}
    .badge-muted {background:${T.border};color:${T.textDim};}

    .stat-num{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:${T.text};line-height:1;}
    .label{font-size:12px;font-weight:600;color:${T.textMuted};margin-bottom:6px;font-family:'Syne',sans-serif;letter-spacing:.04em;text-transform:uppercase;}

    /* ── Toast ── */
    .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:600;font-family:'Syne',sans-serif;padding:11px 22px;border-radius:100px;box-shadow:0 8px 30px rgba(0,0,0,.5);z-index:9999;animation:fadeUp .3s ease;display:flex;align-items:center;gap:8px;white-space:nowrap;}
    @media(min-width:769px){.toast{bottom:28px;}}

    /* ── Modals ── */
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(5px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s ease;}
    .modal-box{background:${T.card};border:1px solid ${T.borderLight};border-radius:18px;width:100%;max-width:480px;padding:28px;animation:fadeUp .25s ease;max-height:92vh;overflow-y:auto;}

    /* ── QR ── */
    .qr-container{background:white;padding:16px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;}
    .scan-anim{position:relative;overflow:hidden;}
    .scan-anim::after{content:'';position:absolute;left:0;right:0;height:2px;background:${T.accent};animation:scanLine 1.5s ease-in-out infinite alternate;box-shadow:0 0 8px ${T.accent};}

    /* ── Sidebar (desktop) ── */
    .sidebar{width:240px;flex-shrink:0;background:${T.surface};border-right:1px solid ${T.border};display:flex;flex-direction:column;height:100vh;position:sticky;top:0;}
    .nav-item{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:9px;font-size:14px;font-weight:500;color:${T.textMuted};transition:all .18s;cursor:pointer;}
    .nav-item:hover{background:${T.surface};color:${T.text};}
    .nav-item.active{background:${T.accentDim};color:${T.accent};}

    /* ── Mobile bottom nav ── */
    .mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;height:62px;background:${T.surface};border-top:1px solid ${T.border};z-index:500;padding:0 4px;padding-bottom:env(safe-area-inset-bottom,0);}
    .mobile-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px;border-radius:10px;cursor:pointer;transition:all .15s;color:${T.textMuted};font-size:10px;font-weight:600;font-family:'Syne',sans-serif;letter-spacing:.03em;position:relative;}
    .mobile-nav-item.active{color:${T.accent};}
    .mobile-nav-item.active svg{stroke:${T.accent};}
    .mobile-nav-badge{position:absolute;top:6px;right:calc(50% - 14px);background:${T.accent};color:#000;font-size:9px;font-weight:800;font-family:'Syne',sans-serif;padding:1px 5px;border-radius:100px;min-width:16px;text-align:center;}
    @media(max-width:768px){
      .sidebar{display:none;}
      .mobile-nav{display:flex;}
      .main-content{padding-bottom:72px !important;}
    }

    /* ── Tables ── */
    .data-table{width:100%;border-collapse:collapse;}
    .data-table th{text-align:left;font-size:11px;font-weight:600;font-family:'Syne',sans-serif;color:${T.textMuted};padding:10px 14px;border-bottom:1px solid ${T.border};letter-spacing:.06em;text-transform:uppercase;}
    .data-table td{padding:12px 14px;font-size:13px;color:${T.textDim};border-bottom:1px solid ${T.border};}
    .data-table tr:last-child td{border-bottom:none;}
    .data-table tr:hover td{background:rgba(255,255,255,.01);}

    /* ── Misc ── */
    .progress-bar {height:4px;background:${T.border};border-radius:2px;overflow:hidden;}
    .progress-fill{height:100%;border-radius:2px;transition:width .6s ease;}
    .metric-card{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:20px;flex:1;}
    .metric-card:hover{border-color:${T.borderLight};}
    .sign-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
    .spinner{width:18px;height:18px;border:2px solid ${T.border};border-top-color:${T.accent};border-radius:50%;animation:spin .7s linear infinite;}
    .landing-bg{min-height:100vh;background:linear-gradient(135deg,#0A0C10 0%,#0D1420 50%,#071410 100%);}

    /* ── Leaflet dark theme ── */
    .leaflet-container{background:#0f1623 !important;border-radius:12px;}
    .leaflet-tile{filter:brightness(.82) saturate(.7) hue-rotate(190deg);}
    .leaflet-control-zoom a{background:${T.card} !important;color:${T.text} !important;border-color:${T.border} !important;}
    .leaflet-control-zoom a:hover{background:${T.surface} !important;}
    .leaflet-control-attribution{background:${T.card}BB !important;color:${T.textMuted} !important;font-size:9px !important;}
    .leaflet-control-attribution a{color:${T.accent} !important;}
    .leaflet-popup-content-wrapper{background:${T.card} !important;color:${T.text} !important;border:1px solid ${T.borderLight} !important;border-radius:12px !important;box-shadow:0 8px 32px rgba(0,0,0,.7) !important;padding:0 !important;}
    .leaflet-popup-tip{background:${T.card} !important;}
    .leaflet-popup-content{margin:0 !important;}
    .leaflet-popup-close-button{color:${T.textMuted} !important;top:10px !important;right:12px !important;font-size:18px !important;}
    .leaflet-popup-close-button:hover{color:${T.text} !important;}

    /* Coord-picker crosshair */
    .leaflet-crosshair{cursor:crosshair !important;}

    @media(max-width:900px){.map-layout{flex-direction:column !important;}}
  `}</style>
);

// ─── ICONS ─────────────────────────────────────────────────────────────────
const Ic = {
  home:   ()=><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9"/></svg>,
  leads:  ()=><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  map:    ()=><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7l6-3 5.447 2.724A1 1 0 0121 7.618v10.764a1 1 0 01-1.447.894L15 17l-6 3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 7v13M15 4v13"/></svg>,
  cog:    ()=><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  plus:   ()=><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>,
  dl:     ()=><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/></svg>,
  copy:   ()=><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  sms:    ()=><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>,
  trash:  ()=><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  chev:   ()=><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/></svg>,
  lock:   ()=><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  check:  ()=><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>,
  star:   ()=><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  csv:    ()=><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  pin:    ()=><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
};

// ─── TOAST ─────────────────────────────────────────────────────────────────
const Toast = ({msg,type="ok",onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t);},[onDone]);
  const bg=type==="ok"?"#00D4AA":type==="err"?"#FF4757":T.text;
  return <div className="toast" style={{background:bg,color:"#000"}}>{type==="ok"?"✓":type==="err"?"✕":"ℹ"} {msg}</div>;
};

// ─── MODAL ─────────────────────────────────────────────────────────────────
const Modal=({title,onClose,children,width})=>(
  <div className="modal-overlay" onClick={e=>e.target.className==="modal-overlay"&&onClose()}>
    <div className="modal-box" style={{maxWidth:width||480}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <h3 style={{fontSize:18}}>{title}</h3>
        <button className="btn-ghost" onClick={onClose} style={{padding:"6px 10px",fontSize:16}}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

// ─── EMPTY STATE ───────────────────────────────────────────────────────────
const EmptyState=({icon,title,desc,action})=>(
  <div style={{textAlign:"center",padding:"60px 20px",color:T.textMuted}}>
    <div style={{fontSize:48,marginBottom:16}}>{icon}</div>
    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:18,color:T.text,marginBottom:8}}>{title}</div>
    <div style={{fontSize:14,maxWidth:320,margin:"0 auto"}}>{desc}</div>
    {action&&<div style={{marginTop:24}}>{action}</div>}
  </div>
);

// ─── TOGGLE ────────────────────────────────────────────────────────────────
const Toggle=({on,onChange,label})=>(
  <div className={`toggle-wrap ${on?"toggle-on":"toggle-off"}`} onClick={()=>onChange(!on)}>
    <div className="toggle-track"><div className="toggle-thumb"/></div>
    {label&&<span style={{fontSize:13,fontWeight:600,color:on?T.accent:T.textMuted}}>{label}</span>}
  </div>
);

// ─── SVG QR CODE ───────────────────────────────────────────────────────────
const QRCode=({value,size=140,fgColor="#000",bgColor="#fff"})=>{
  const hash=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*0x01000193)>>>0;}return h;};
  const M=21,cs=Math.floor(size/M),AS=cs*M,q=Math.floor((size-AS)/2);
  const bits=[];
  for(let r=0;r<M;r++)for(let c=0;c<M;c++){
    const inF=((r<7&&c<7)||(r<7&&c>=M-7)||(r>=M-7&&c<7));
    if(inF){const fr=r<7?r:r-(M-7),fc=c<7?c:(c>=M-7?c-(M-7):c);bits.push((fr===0||fr===6||fc===0||fc===6)||(fr>=2&&fr<=4&&fc>=2&&fc<=4));continue;}
    bits.push(((hash(value+r*31+c*7))&1)===1);
  }
  return(<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg"><rect width={size} height={size} fill={bgColor}/>{bits.map((on,i)=>{if(!on)return null;const r=Math.floor(i/M),c=i%M;return<rect key={i} x={q+c*cs} y={q+r*cs} width={cs} height={cs} fill={fgColor}/>;})}</svg>);
};

// ─── LEAFLET SIGN MAP ──────────────────────────────────────────────────────
const LeafletSignMap=({qrcodes,properties,leads,selectedPropId,highlightId})=>{
  const mapRef=useRef(null), lMap=useRef(null), mks=useRef([]);

  const buildPopup=useCallback((qr)=>{
    const prop=properties.find(p=>p.id===qr.property_id);
    const ql=leads.filter(l=>l.qr_id===qr.id);
    const color=signColor(qr.label), emoji=signEmoji(qr.label);
    const conv=qr.scan_count>0?Math.round((ql.length/qr.scan_count)*100):0;
    return `<div style="padding:16px 18px 14px;min-width:230px;font-family:'DM Sans',sans-serif;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:38px;height:38px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:20px;">${emoji}</div>
        <div><div style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;color:#F0F2F5;">${qr.label}</div>
        <div style="font-size:11px;color:#6B7280;">${prop?.address||""}</div></div>
      </div>
      <div style="display:flex;gap:18px;padding:10px 0;border-top:1px solid #1E2330;border-bottom:1px solid #1E2330;margin-bottom:12px;">
        <div style="text-align:center;"><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:24px;color:${color};line-height:1;">${qr.scan_count}</div><div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Scans</div></div>
        <div style="text-align:center;"><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:24px;color:#F0F2F5;line-height:1;">${ql.length}</div><div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Leads</div></div>
        <div style="text-align:center;"><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:24px;color:${conv>10?"#00D4AA":conv>5?"#FFD32A":"#6B7280"};line-height:1;">${conv}%</div><div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Conv.</div></div>
      </div>
      ${ql.length>0?`<div style="margin-bottom:8px;">${ql.slice(0,3).map(l=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div style="width:22px;height:22px;border-radius:50%;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:${color};">${l.name[0]}</div><span style="font-size:12px;color:#9CA3AF;">${l.name}</span></div>`).join("")}</div>`:""}
      <div style="font-size:10px;color:#4B5563;font-family:monospace;">📍 ${qr.lat.toFixed(5)}, ${qr.lng.toFixed(5)}</div>
    </div>`;
  },[properties,leads]);

  const draw=useCallback(()=>{
    const L=window.L; if(!L||!lMap.current) return;
    mks.current.forEach(m=>lMap.current.removeLayer(m)); mks.current=[];
    const vis=qrcodes.filter(q=>q.lat&&q.lng&&(selectedPropId==="all"||q.property_id===selectedPropId));
    const maxS=Math.max(...vis.map(q=>q.scan_count),1);
    const bounds=[];
    vis.forEach(qr=>{
      const color=heatColor(qr.scan_count,maxS),emoji=heatEmoji(qr.scan_count,maxS),sc=0.82+(qr.scan_count/maxS)*0.38;
      const W=Math.round(44*sc),H=Math.round(56*sc),isHL=highlightId===qr.id;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 44 56">
        <defs><filter id="sh${qr.id}" x="-40%" y="-10%" width="180%" height="160%"><feDropShadow dx="0" dy="${isHL?5:3}" stdDeviation="${isHL?5:3}" flood-color="#000" flood-opacity="${isHL ? .7 : .45}"/></filter>
        <radialGradient id="g${qr.id}" cx="45%" cy="35%"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${color}" stop-opacity=".75"/></radialGradient></defs>
        ${isHL?`<circle cx="22" cy="20" r="22" fill="${color}" opacity=".18"/>`:""}
        <path d="M22 2C12.611 2 5 9.611 5 19c0 12.389 17 35 17 35S39 31.389 39 19C39 9.611 31.389 2 22 2z" fill="url(#g${qr.id})" filter="url(#sh${qr.id})" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
        <circle cx="22" cy="19" r="10" fill="rgba(0,0,0,.2)"/>
        <circle cx="22" cy="19" r="9" fill="white" opacity=".95"/>
        <text x="22" y="24" text-anchor="middle" font-size="14" font-family="'Apple Color Emoji','Segoe UI Emoji',sans-serif">${emoji}</text>
      </svg>`;
      const icon=L.divIcon({html:svg,className:"",iconSize:[W,H],iconAnchor:[W/2,H],popupAnchor:[0,-H]});
      const m=L.marker([qr.lat,qr.lng],{icon}).addTo(lMap.current);
      m.bindPopup(buildPopup(qr),{maxWidth:300});
      mks.current.push(m); bounds.push([qr.lat,qr.lng]);
    });
    if(bounds.length>1) lMap.current.fitBounds(bounds,{padding:[50,50],maxZoom:17,animate:true});
    else if(bounds.length) lMap.current.setView(bounds[0],17,{animate:true});
  },[qrcodes,selectedPropId,highlightId,buildPopup]);

  useEffect(()=>{
    const init=()=>{
      if(!mapRef.current||lMap.current) return;
      const L=window.L;
      const first=qrcodes.find(q=>q.lat&&q.lng);
      const map=L.map(mapRef.current,{center:first?[first.lat,first.lng]:[30.267,-97.743],zoom:15});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map);
      lMap.current=map; draw();
    };
    if(window.L){init();return;}
    if(!document.querySelector('link[href*="leaflet"]')){
      const lk=document.createElement("link");lk.rel="stylesheet";lk.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(lk);
    }
    const s=document.createElement("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.onload=init;document.head.appendChild(s);
    return()=>{if(lMap.current){lMap.current.remove();lMap.current=null;}};
  },[]);// eslint-disable-line
  useEffect(()=>draw(),[draw]);

  return <div ref={mapRef} style={{width:"100%",height:"100%",minHeight:440,borderRadius:12}}/>;
};

// ─── COORDINATE PICKER MAP ─────────────────────────────────────────────────
// Agent clicks on the map to place the sign location.
const CoordPickerMap=({initialLat,initialLng,onCoordChange})=>{
  const mapRef=useRef(null), lMap=useRef(null), marker=useRef(null);
  const defaultLat=initialLat||30.268, defaultLng=initialLng||-97.743;

  useEffect(()=>{
    const init=()=>{
      if(!mapRef.current||lMap.current) return;
      const L=window.L;
      const map=L.map(mapRef.current,{center:[defaultLat,defaultLng],zoom:16});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);
      lMap.current=map;
      // Place initial marker if coords exist
      if(initialLat&&initialLng){
        marker.current=L.marker([initialLat,initialLng],{draggable:true}).addTo(map);
        marker.current.on("dragend",e=>{
          const {lat,lng}=e.target.getLatLng();
          onCoordChange(+lat.toFixed(6),+lng.toFixed(6));
        });
      }
      // Click to place / move marker
      map.on("click",e=>{
        const {lat,lng}=e.latlng;
        if(marker.current) map.removeLayer(marker.current);
        marker.current=L.marker([lat,lng],{draggable:true}).addTo(map);
        marker.current.on("dragend",ev=>{
          const p=ev.target.getLatLng();
          onCoordChange(+p.lat.toFixed(6),+p.lng.toFixed(6));
        });
        onCoordChange(+lat.toFixed(6),+lng.toFixed(6));
      });
      // Crosshair cursor
      map.getContainer().classList.add("leaflet-crosshair");
    };
    if(window.L){init();return;}
    if(!document.querySelector('link[href*="leaflet"]')){
      const lk=document.createElement("link");lk.rel="stylesheet";lk.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(lk);
    }
    const s=document.createElement("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.onload=init;document.head.appendChild(s);
    return()=>{if(lMap.current){lMap.current.remove();lMap.current=null;}};
  },[]);// eslint-disable-line

  return(
    <div>
      <div style={{background:T.yellow+"18",border:`1px solid ${T.yellow}33`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.yellow,marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
        <span>📍</span> Click anywhere on the map to place or move the sign pin. Drag the pin to adjust.
      </div>
      <div ref={mapRef} style={{width:"100%",height:280,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"}}/>
    </div>
  );
};

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function RealtQR(){
  const [db,setDb]           = useState(seedData);
  const [route,setRoute]     = useState("dashboard");
  const [toast,setToast]     = useState(null);
  const [showAddProp,setShowAddProp]   = useState(false);
  const [showAddQR,setShowAddQR]       = useState(null);    // propertyId
  const [showQRModal,setShowQRModal]   = useState(null);    // {qr,property}
  const [showPrint,setShowPrint]       = useState(null);    // {qr,property}
  const [showCoordPicker,setShowCoordPicker] = useState(null); // qrId
  const [showSignMode,setShowSignMode] = useState(false);
  const [landingData,setLandingData]   = useState(null);
  const [selectedProp,setSelectedProp] = useState("all");

  const pushToast=useCallback((msg,type="ok")=>setToast({msg,type,key:Date.now()}),[]);

  // DB mutations
  const addProperty=useCallback(address=>{
    const id=genId();
    setDb(p=>({...p,properties:[...p.properties,{id,address,agent_name:p.user.name,created_at:Date.now(),active:false}]}));
    pushToast("Property added!");
  },[pushToast]);

  const toggleActive=useCallback(propId=>{
    setDb(p=>({...p,properties:p.properties.map(pr=>pr.id===propId?{...pr,active:!pr.active}:pr)}));
  },[]);

  const addQR=useCallback((propertyId,label)=>{
    const id=genId();
    setDb(prev=>{
      const sib=prev.qrcodes.filter(q=>q.property_id===propertyId&&q.lat);
      const lat=(sib.length?sib[0].lat:30.268)+(Math.random()-.5)*.004;
      const lng=(sib.length?sib[0].lng:-97.743)+(Math.random()-.5)*.004;
      return{...prev,qrcodes:[...prev.qrcodes,{id,property_id:propertyId,label,scan_count:0,lat:+lat.toFixed(5),lng:+lng.toFixed(5),created_at:Date.now()}]};
    });
    pushToast("QR code created!");
    return id;
  },[pushToast]);

  const updateQRCoords=useCallback((qrId,lat,lng)=>{
    setDb(p=>({...p,qrcodes:p.qrcodes.map(q=>q.id===qrId?{...q,lat,lng}:q)}));
  },[]);

  const deleteProperty=useCallback(propId=>{
    setDb(p=>({...p,properties:p.properties.filter(x=>x.id!==propId),qrcodes:p.qrcodes.filter(x=>x.property_id!==propId),leads:p.leads.filter(x=>x.property_id!==propId)}));
    pushToast("Property deleted","err");
  },[pushToast]);

  const deleteQR=useCallback(qrId=>{
    setDb(p=>({...p,qrcodes:p.qrcodes.filter(x=>x.id!==qrId),leads:p.leads.filter(x=>x.qr_id!==qrId)}));
    pushToast("QR deleted","err");
  },[pushToast]);

  const submitLead=useCallback((propertyId,qrId,data)=>{
    setDb(p=>({...p,
      leads:[...p.leads,{id:genId(),property_id:propertyId,qr_id:qrId,...data,created_at:Date.now()}],
      qrcodes:p.qrcodes.map(q=>q.id===qrId?{...q,scan_count:q.scan_count+1}:q),
      scan_events:[...p.scan_events,{id:genId(),qr_id:qrId,lat:null,lng:null,created_at:Date.now()}],
    }));
  },[]);

  const qrUrl=(pId,qId)=>`${window.location.origin}/p/${pId}?qr=${qId}`;
  const simScan=(qr,property)=>{setLandingData({qr,property});setRoute("landing");};
  const isPro=db.user.plan==="pro";

  // Special full-screen routes
  if(route==="landing"&&landingData) return<><GlobalStyle/><LandingPage property={landingData.property} qr={landingData.qr} onSubmit={d=>{submitLead(landingData.property.id,landingData.qr.id,d);setRoute("landing-success");}} onBack={()=>{setRoute("dashboard");setLandingData(null);}}/>{toast&&<Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}</>;
  if(route==="landing-success") return<><GlobalStyle/><LandingSuccess property={landingData?.property} onDone={()=>{setRoute("dashboard");setLandingData(null);pushToast("Lead captured & SMS sent! 📱");}}/></>;
  if(showPrint) return<><GlobalStyle/><PrintPreview qr={showPrint.qr} property={showPrint.property} qrUrl={qrUrl(showPrint.property.id,showPrint.qr.id)} onClose={()=>setShowPrint(null)}/></>;

  // Coord picker qr
  const pickerQR = showCoordPicker ? db.qrcodes.find(q=>q.id===showCoordPicker) : null;

  return(
    <>
      <GlobalStyle/>
      <div style={{display:"flex",minHeight:"100vh"}}>
        <Sidebar route={route} setRoute={setRoute} user={db.user} totalLeads={db.leads.length}/>
        <main className="main-content" style={{flex:1,overflowY:"auto",background:T.bg,paddingBottom:0}}>
          {route==="dashboard"&&<Dashboard db={db} selectedProp={selectedProp} setSelectedProp={setSelectedProp}
            qrUrl={qrUrl} isPro={isPro}
            onAddProperty={()=>setShowAddProp(true)} onAddQR={id=>setShowAddQR(id)}
            onToggleActive={toggleActive}
            onDeleteProperty={deleteProperty} onDeleteQR={deleteQR}
            onViewQR={(qr,prop)=>setShowQRModal({qr,property:prop})}
            onPrint={(qr,prop)=>setShowPrint({qr,property:prop})}
            onSimulateScan={simScan} onPickCoord={qrId=>setShowCoordPicker(qrId)}
            pushToast={pushToast}/>}
          {route==="leads"    &&<LeadsView db={db} pushToast={pushToast}/>}
          {route==="map"      &&<SignMapPage db={db} isPro={isPro} selectedProp={selectedProp} setSelectedProp={setSelectedProp} onPickCoord={qrId=>setShowCoordPicker(qrId)} onSignMode={()=>setShowSignMode(true)}/>}
          {route==="settings" &&<SettingsPage user={db.user} pushToast={pushToast}/>}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav route={route} setRoute={setRoute} totalLeads={db.leads.length}/>

      {/* Modals */}
      {showAddProp&&<AddPropertyModal onClose={()=>setShowAddProp(false)} onAdd={a=>{addProperty(a);setShowAddProp(false);}} canAdd={isPro||db.properties.length<1}/>}
      {showAddQR&&<AddQRModal propertyId={showAddQR} onClose={()=>setShowAddQR(null)} onAdd={l=>{addQR(showAddQR,l);setShowAddQR(null);}} canAdd={isPro||db.qrcodes.filter(q=>q.property_id===showAddQR).length<1}/>}
      {showQRModal&&<QRDetailModal qr={showQRModal.qr} property={showQRModal.property}
        leads={db.leads.filter(l=>l.qr_id===showQRModal.qr.id)}
        qrUrl={qrUrl(showQRModal.property.id,showQRModal.qr.id)}
        onClose={()=>setShowQRModal(null)}
        onPrint={()=>{setShowPrint(showQRModal);setShowQRModal(null);}}
        onSimulateScan={()=>{simScan(showQRModal.qr,showQRModal.property);setShowQRModal(null);}}
        onPickCoord={()=>{setShowCoordPicker(showQRModal.qr.id);setShowQRModal(null);}}
        pushToast={pushToast}/>}

      {/* Coordinate picker modal */}
      {showCoordPicker&&pickerQR&&(
        <CoordPickerModal
          qr={pickerQR}
          onClose={()=>setShowCoordPicker(null)}
          onSave={(lat,lng)=>{updateQRCoords(pickerQR.id,lat,lng);setShowCoordPicker(null);pushToast("Sign location saved! 📍");}}
        />
      )}
      {showSignMode&&(
        <SignModeModal
          db={db}
          selectedProp={selectedProp}
          onClose={()=>setShowSignMode(false)}
          onPickCoord={qrId=>{setShowSignMode(false);setShowCoordPicker(qrId);}}
          onDrop={(qrId,lat,lng)=>{updateQRCoords(qrId,lat,lng);setShowSignMode(false);pushToast("Sign dropped at your location!");}}
        />
      )}

      {toast&&<Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    </>
  );
}

// ─── MOBILE BOTTOM NAV ─────────────────────────────────────────────────────
const MobileNav=({route,setRoute,totalLeads})=>{
  const items=[
    {id:"dashboard",label:"Home",     icon:Ic.home},
    {id:"leads",    label:"Leads",    icon:Ic.leads,  badge:totalLeads},
    {id:"map",      label:"Sign Map", icon:Ic.map},
    {id:"settings", label:"Settings", icon:Ic.cog},
  ];
  return(
    <nav className="mobile-nav">
      {items.map(item=>(
        <div key={item.id} className={`mobile-nav-item ${route===item.id?"active":""}`} onClick={()=>setRoute(item.id)}>
          {item.badge>0&&<span className="mobile-nav-badge">{item.badge}</span>}
          <item.icon/>
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  );
};

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
const Sidebar=({route,setRoute,user,totalLeads})=>{
  const nav=[
    {id:"dashboard",label:"Dashboard",icon:Ic.home},
    {id:"leads",    label:"Leads",    icon:Ic.leads,badge:totalLeads},
    {id:"map",      label:"Sign Map", icon:Ic.map},
    {id:"settings", label:"Settings", icon:Ic.cog},
  ];
  return(
    <aside className="sidebar">
      <div style={{padding:"20px 18px 14px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:T.accent,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📍</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:T.text}}>RealtQR</div>
            <div style={{fontSize:10,color:T.textMuted,fontWeight:600,letterSpacing:"0.05em"}}>OPEN HOUSE OS</div>
          </div>
        </div>
      </div>
      <nav style={{padding:"12px 10px",flex:1}}>
        {nav.map(item=>(
          <div key={item.id} className={`nav-item ${route===item.id?"active":""}`} onClick={()=>setRoute(item.id)}>
            <item.icon/>
            <span style={{flex:1}}>{item.label}</span>
            {item.badge>0&&<span style={{background:T.accent,color:"#000",fontSize:10,fontWeight:700,fontFamily:"'Syne',sans-serif",padding:"1px 7px",borderRadius:"100px"}}>{item.badge}</span>}
          </div>
        ))}
      </nav>
      <div style={{padding:"14px 16px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},#007AFF)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,fontFamily:"'Syne',sans-serif",color:"#000"}}>{user.name.split(" ").map(n=>n[0]).join("")}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
            <div style={{fontSize:11,color:T.textMuted}}>{user.email}</div>
          </div>
        </div>
        {user.plan==="pro"
          ?<div className="badge badge-green" style={{width:"100%",justifyContent:"center",padding:"6px 0"}}><Ic.star/> PRO PLAN</div>
          :<button className="btn-primary" style={{width:"100%",justifyContent:"center",fontSize:13}}>Upgrade to Pro</button>}
      </div>
    </aside>
  );
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
const Dashboard=({db,selectedProp,setSelectedProp,qrUrl,isPro,onAddProperty,onAddQR,onToggleActive,onDeleteProperty,onDeleteQR,onViewQR,onPrint,onSimulateScan,onPickCoord,pushToast})=>{
  const properties=db.properties;
  const filteredProps=selectedProp==="all"?properties:properties.filter(p=>p.id===selectedProp);
  const totalScans=db.qrcodes.reduce((a,q)=>a+q.scan_count,0);
  const activeCount=properties.filter(p=>p.active).length;
  const recentLeads=[...db.leads].sort((a,b)=>b.created_at-a.created_at).slice(0,4);

  return(
    <div style={{padding:"28px 24px",maxWidth:960,margin:"0 auto"}} className="fade-up">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,gap:16,flexWrap:"wrap"}}>
        <div>
          <h1 style={{fontSize:26,marginBottom:4}}>Dashboard</h1>
          <p style={{color:T.textMuted,fontSize:14}}>Manage open house properties, QR codes, and leads.</p>
        </div>
        <button className="btn-primary" onClick={onAddProperty}><Ic.plus/> Add Property</button>
      </div>

      {/* Metrics */}
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
        {[
          {label:"Total Scans",    value:totalScans,         icon:"📡", color:T.accent},
          {label:"Leads Captured", value:db.leads.length,    icon:"👤", color:T.blue},
          {label:"Active Now",     value:activeCount,         icon:"🔴", color:T.red},
          {label:"QR Codes",       value:db.qrcodes.length,  icon:"◼",  color:"#AA77FF"},
        ].map(m=>(
          <div key={m.label} className="metric-card" style={{minWidth:120}}>
            <div style={{fontSize:22,marginBottom:6}}>{m.icon}</div>
            <div className="stat-num" style={{color:m.color}}>{m.value}</div>
            <div style={{fontSize:12,color:T.textMuted,fontWeight:600,marginTop:4}}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      {properties.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
          <button className={selectedProp==="all"?"btn-primary":"btn-secondary"} style={{fontSize:12,padding:"7px 14px",whiteSpace:"nowrap"}} onClick={()=>setSelectedProp("all")}>All</button>
          {properties.map(p=><button key={p.id} className={selectedProp===p.id?"btn-primary":"btn-secondary"} style={{fontSize:12,padding:"7px 14px",whiteSpace:"nowrap"}} onClick={()=>setSelectedProp(p.id)}>{p.address.split(",")[0]}</button>)}
        </div>
      )}

      {/* Property cards */}
      {filteredProps.length===0
        ?<EmptyState icon="🏠" title="No properties yet" desc="Add your first open house property to generate QR codes." action={<button className="btn-primary" onClick={onAddProperty}><Ic.plus/> Add Property</button>}/>
        :<div style={{display:"flex",flexDirection:"column",gap:18}}>
          {filteredProps.map(prop=>(
            <PropertyCard key={prop.id} property={prop}
              qrcodes={db.qrcodes.filter(q=>q.property_id===prop.id)}
              leads={db.leads.filter(l=>l.property_id===prop.id)}
              isPro={isPro} qrUrl={qrUrl}
              onAddQR={()=>onAddQR(prop.id)}
              onToggleActive={()=>onToggleActive(prop.id)}
              onDelete={()=>onDeleteProperty(prop.id)}
              onDeleteQR={onDeleteQR}
              onViewQR={qr=>onViewQR(qr,prop)}
              onPrint={qr=>onPrint(qr,prop)}
              onSimulateScan={qr=>onSimulateScan(qr,prop)}
              onPickCoord={onPickCoord}
              pushToast={pushToast}/>
          ))}
        </div>}

      {/* Recent leads */}
      {recentLeads.length>0&&(
        <div style={{marginTop:32}}>
          <h2 style={{fontSize:17,marginBottom:14}}>Recent Leads</h2>
          <div className="card" style={{overflow:"hidden"}}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Property</th><th>Sign</th><th>Date</th></tr></thead>
              <tbody>{recentLeads.map(lead=>{
                const prop=db.properties.find(p=>p.id===lead.property_id);
                const qr=db.qrcodes.find(q=>q.id===lead.qr_id);
                const color=signColor(qr?.label||"");
                return(<tr key={lead.id}><td style={{color:T.text,fontWeight:500}}>{lead.name}</td><td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prop?.address.split(",")[0]}</td><td><span className="badge" style={{background:color+"18",color,border:`1px solid ${color}33`}}>{signEmoji(qr?.label||"")} {qr?.label||"—"}</span></td><td>{fmtDate(lead.created_at)}</td></tr>);
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PROPERTY CARD ─────────────────────────────────────────────────────────
const PropertyCard=({property,qrcodes,leads,isPro,qrUrl,onAddQR,onToggleActive,onDelete,onDeleteQR,onViewQR,onPrint,onSimulateScan,onPickCoord,pushToast})=>{
  const [expanded,setExpanded]=useState(true);
  const totalScans=qrcodes.reduce((a,q)=>a+q.scan_count,0);
  const maxScans=Math.max(...qrcodes.map(q=>q.scan_count),1);

  return(
    <div className="card" style={{overflow:"hidden",border:property.active?`1px solid ${T.red}44`:`1px solid ${T.border}`}}>
      {/* Header */}
      <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",userSelect:"none"}} onClick={()=>setExpanded(e=>!e)}>
        <div style={{width:40,height:40,background:property.active?T.red+"22":T.accentDim,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,transition:"background .3s"}}>
          {property.active?"🔴":"🏠"}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{property.address}</span>
            {property.active&&<span className="live-badge"><span className="live-dot"/>LIVE</span>}
          </div>
          <div style={{display:"flex",gap:12,fontSize:12,color:T.textMuted,flexWrap:"wrap"}}>
            <span>📡 {totalScans} scans</span><span>👤 {leads.length} leads</span><span>◼ {qrcodes.length} QR{qrcodes.length!==1?"s":""}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}} onClick={e=>e.stopPropagation()}>
          {/* Open house toggle */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginRight:4}}>
            <span style={{fontSize:11,color:T.textMuted,fontWeight:600,display:"none"}}>Open</span>
            <Toggle on={property.active} onChange={onToggleActive} label={property.active?"Open":"Closed"}/>
          </div>
          <button className="btn-secondary" style={{padding:"7px 12px",fontSize:12}} onClick={onAddQR}><Ic.plus/> Add QR</button>
          <button className="btn-ghost" style={{color:T.red,padding:"7px 10px"}} onClick={()=>confirm("Delete property?")&&onDelete()}><Ic.trash/></button>
          <div style={{color:T.textMuted,display:"flex",alignItems:"center",transform:expanded?"rotate(90deg)":"none",transition:"transform .2s"}}><Ic.chev/></div>
        </div>
      </div>

      {/* QR rows */}
      {expanded&&(
        <div style={{borderTop:`1px solid ${T.border}`,padding:"14px 18px 18px"}}>
          {qrcodes.length===0
            ?<div style={{textAlign:"center",padding:"24px 0",color:T.textMuted}}>
                <div style={{fontSize:26,marginBottom:8}}>◼</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:600,marginBottom:4}}>No QR codes yet</div>
                <div style={{fontSize:13,marginBottom:14}}>Create a QR code for each sign at your open house.</div>
                <button className="btn-primary" onClick={onAddQR}><Ic.plus/> Create QR Code</button>
              </div>
            :<div style={{display:"flex",flexDirection:"column",gap:9}}>
                {qrcodes.map(qr=><QRRow key={qr.id} qr={qr} maxScans={maxScans}
                  leads={leads.filter(l=>l.qr_id===qr.id)}
                  onView={()=>onViewQR(qr)} onDelete={()=>confirm("Delete QR?")&&onDeleteQR(qr.id)}
                  onPrint={()=>onPrint(qr)} onSimulateScan={()=>onSimulateScan(qr)}
                  onPickCoord={()=>onPickCoord(qr.id)}
                  onCopyUrl={()=>navigator.clipboard?.writeText(qrUrl(property.id,qr.id)).then(()=>pushToast("URL copied!"))}/>)}
              </div>}
        </div>
      )}
    </div>
  );
};

// ─── QR ROW ────────────────────────────────────────────────────────────────
const QRRow=({qr,maxScans,leads,onView,onDelete,onPrint,onSimulateScan,onPickCoord,onCopyUrl})=>{
  const color=signColor(qr.label),emoji=signEmoji(qr.label);
  const pct=maxScans>0?(qr.scan_count/maxScans)*100:0;
  return(
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div className="sign-icon" style={{background:color+"22"}}><span style={{fontSize:18}}>{emoji}</span></div>
      <div style={{flex:1,minWidth:130}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:T.text}}>{qr.label}</span>
          <span style={{fontSize:11,color:T.textMuted}}>·</span>
          <span style={{fontSize:12,color:T.textMuted}}>{leads.length} lead{leads.length!==1?"s":""}</span>
          {qr.lat&&<span style={{fontSize:10,color:T.accent,background:T.accentDim,padding:"1px 6px",borderRadius:4}}>📍 mapped</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div className="progress-bar" style={{flex:1}}><div className="progress-fill" style={{width:`${pct}%`,background:color}}/></div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color,minWidth:26,textAlign:"right"}}>{qr.scan_count}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap"}}>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 10px"}} onClick={onView}>View</button>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 8px"}} onClick={onSimulateScan} title="Test scan">🔗</button>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 8px"}} onClick={onPickCoord} title="Set sign location"><Ic.pin/></button>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 8px"}} onClick={onCopyUrl} title="Copy URL"><Ic.copy/></button>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 8px"}} onClick={onPrint} title="Print"><Ic.dl/></button>
        <button className="btn-ghost" style={{fontSize:12,padding:"5px 8px",color:T.red}} onClick={onDelete}><Ic.trash/></button>
      </div>
    </div>
  );
};

// ─── COORD PICKER MODAL ────────────────────────────────────────────────────
const CoordPickerModal=({qr,onClose,onSave})=>{
  const [lat,setLat]=useState(qr.lat||null);
  const [lng,setLng]=useState(qr.lng||null);
  const color=signColor(qr.label), emoji=signEmoji(qr.label);
  return(
    <Modal title="Set Sign Location" onClose={onClose} width={560}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,background:T.surface,borderRadius:10,padding:"10px 14px"}}>
        <div style={{width:34,height:34,borderRadius:9,background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{emoji}</div>
        <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:T.text}}>{qr.label}</div><div style={{fontSize:11,color:T.textMuted}}>Click the map to drop a pin where this sign is placed</div></div>
      </div>
      <CoordPickerMap initialLat={lat} initialLng={lng} onCoordChange={(la,ln)=>{setLat(la);setLng(ln);}}/>
      {lat&&lng&&(
        <div style={{marginTop:12,background:T.accentDim,border:`1px solid ${T.accent}33`,borderRadius:8,padding:"8px 14px",fontSize:12,color:T.accent,fontFamily:"monospace"}}>
          📍 {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn-secondary" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{flex:2,justifyContent:"center"}} onClick={()=>lat&&lng&&onSave(lat,lng)} disabled={!lat||!lng}>
          <Ic.pin/> Save Location
        </button>
      </div>
    </Modal>
  );
};

const SignModeModal=({db,selectedProp,onClose,onDrop,onPickCoord})=>{
  const signs=db.qrcodes.filter(q=>selectedProp==="all"||q.property_id===selectedProp);
  const [qrId,setQrId]=useState(signs[0]?.id||"");
  const [loc,setLoc]=useState(null);
  const [status,setStatus]=useState("Waiting for GPS...");
  const selectedQR=signs.find(q=>q.id===qrId);
  const selectedProperty=selectedQR&&db.properties.find(p=>p.id===selectedQR.property_id);

  const setFromPosition=useCallback(pos=>{
    const {latitude,longitude,accuracy}=pos.coords;
    setLoc({lat:+latitude.toFixed(6),lng:+longitude.toFixed(6),accuracy:Math.round(accuracy)});
    setStatus("Current location ready");
  },[]);

  const locate=useCallback(()=>{
    if(!navigator.geolocation){setStatus("GPS is not available in this browser.");return;}
    setStatus("Getting current location...");
    navigator.geolocation.getCurrentPosition(setFromPosition,()=>setStatus("GPS blocked. Use map picker instead."),{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  },[setFromPosition]);

  useEffect(()=>{
    if(!navigator.geolocation){setStatus("GPS is not available in this browser.");return;}
    const watchId=navigator.geolocation.watchPosition(setFromPosition,()=>setStatus("GPS blocked. Use map picker instead."),{enableHighAccuracy:true,maximumAge:2000,timeout:12000});
    return()=>navigator.geolocation.clearWatch(watchId);
  },[setFromPosition]);

  return(
    <Modal title="Sign Mode" onClose={onClose} width={560}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,marginBottom:4}}>Drive, stop, drop.</div>
        <div style={{fontSize:13,color:T.textMuted}}>Use this while placing physical signs. Pick the sign, then tap Drop Sign Here when you are standing at that sign.</div>
      </div>
      {signs.length===0?(
        <EmptyState icon="📍" title="No signs yet" desc="Create a QR sign before using Sign Mode."/>
      ):(
        <>
          <div style={{marginBottom:14}}>
            <div className="label">Sign to place</div>
            <select className="input-field" value={qrId} onChange={e=>setQrId(e.target.value)}>
              {signs.map(q=>{
                const prop=db.properties.find(p=>p.id===q.property_id);
                return <option key={q.id} value={q.id}>{q.label} - {prop?.address.split(",")[0]}</option>;
              })}
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{width:42,height:42,borderRadius:8,background:T.accentDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📡</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:T.text}}>{status}</div>
              <div style={{fontSize:12,color:T.textMuted,fontFamily:loc?"monospace":"inherit",marginTop:2}}>
                {loc?`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} · approx. ${loc.accuracy}m`:"Allow location access to auto-drop from the field."}
              </div>
            </div>
          </div>
          {selectedQR&&<div style={{fontSize:12,color:T.textMuted,marginBottom:16}}>Selected: <span style={{color:T.text,fontWeight:700}}>{selectedQR.label}</span>{selectedProperty?` at ${selectedProperty.address.split(",")[0]}`:""}</div>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button className="btn-secondary" style={{flex:1,justifyContent:"center",minWidth:130}} onClick={locate}>Refresh GPS</button>
            <button className="btn-ghost" style={{flex:1,justifyContent:"center",minWidth:130}} onClick={()=>selectedQR&&onPickCoord(selectedQR.id)} disabled={!selectedQR}><Ic.pin/> Use map picker</button>
            <button className="btn-primary" style={{flex:2,justifyContent:"center",minWidth:170}} onClick={()=>selectedQR&&loc&&onDrop(selectedQR.id,loc.lat,loc.lng)} disabled={!selectedQR||!loc}><Ic.pin/> Drop Sign Here</button>
          </div>
        </>
      )}
    </Modal>
  );
};

// ─── LEADS VIEW ────────────────────────────────────────────────────────────
const LeadsView=({db,pushToast})=>{
  const [search,setSearch]=useState("");
  const [propFilter,setPropFilter]=useState("all");
  const leads=[...db.leads].sort((a,b)=>b.created_at-a.created_at).filter(l=>{
    const t=search.toLowerCase();
    const ms=!t||l.name.toLowerCase().includes(t)||l.email.toLowerCase().includes(t);
    const mp=propFilter==="all"||l.property_id===propFilter;
    return ms&&mp;
  });

  const doExport=()=>{
    exportCSV(leads,db.properties,db.qrcodes);
    pushToast(`Exported ${leads.length} leads to CSV`);
  };

  return(
    <div style={{padding:"28px 24px",maxWidth:960,margin:"0 auto"}} className="fade-up">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:14}}>
        <div>
          <h1 style={{fontSize:26,marginBottom:4}}>Leads</h1>
          <p style={{color:T.textMuted,fontSize:14}}>{db.leads.length} total leads captured.</p>
        </div>
        <button className="btn-secondary" onClick={doExport} style={{gap:8}}>
          <Ic.csv/> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        <input className="input-field" placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280,flex:1}}/>
        <select className="input-field" value={propFilter} onChange={e=>setPropFilter(e.target.value)} style={{maxWidth:220,flex:1}}>
          <option value="all">All Properties</option>
          {db.properties.map(p=><option key={p.id} value={p.id}>{p.address.split(",")[0]}</option>)}
        </select>
      </div>

      {leads.length===0
        ?<EmptyState icon="👤" title="No leads yet" desc="Leads appear here when visitors scan QR codes and submit the form."/>
        :<div className="card" style={{overflow:"hidden"}}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Property</th><th>Sign</th><th>Date</th><th></th></tr></thead>
            <tbody>{leads.map(lead=>{
              const prop=db.properties.find(p=>p.id===lead.property_id);
              const qr=db.qrcodes.find(q=>q.id===lead.qr_id);
              const color=signColor(qr?.label||"");
              return(<tr key={lead.id}>
                <td style={{color:T.text,fontWeight:600}}>{lead.name}</td>
                <td style={{fontSize:12}}>{lead.phone?fmtPhone(lead.phone):"—"}</td>
                <td style={{fontSize:12}}>{lead.email}</td>
                <td style={{maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{prop?.address.split(",")[0]}</td>
                <td>{qr?<span className="badge" style={{background:color+"18",color,border:`1px solid ${color}33`}}>{signEmoji(qr.label)} {qr.label}</span>:"—"}</td>
                <td style={{fontSize:12}}>{fmtDate(lead.created_at)}</td>
                <td><button className="btn-ghost" style={{padding:"4px 10px",fontSize:12,color:T.accent}} onClick={()=>pushToast(`SMS sent to ${lead.name}! 📱`)}><Ic.sms/></button></td>
              </tr>);
            })}</tbody>
          </table>
        </div>}

      {leads.length>0&&(
        <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
          <button className="btn-ghost" onClick={doExport} style={{fontSize:12}}><Ic.csv/> Download {leads.length} leads as CSV</button>
        </div>
      )}
    </div>
  );
};

// ─── SIGN MAP PAGE ─────────────────────────────────────────────────────────
const SignMapPage=({db,isPro,selectedProp,setSelectedProp,onPickCoord,onSignMode})=>{
  const [highlightId,setHighlightId]=useState(null);
  const visQRs=db.qrcodes.filter(q=>q.lat&&q.lng&&(selectedProp==="all"||q.property_id===selectedProp));
  const topSign=[...visQRs].sort((a,b)=>b.scan_count-a.scan_count)[0];
  const noCoord=db.qrcodes.filter(q=>(selectedProp==="all"||q.property_id===selectedProp)&&(!q.lat||!q.lng));

  return(
    <div style={{padding:"28px 24px",maxWidth:1100,margin:"0 auto"}} className="fade-up">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:14}}>
        <div>
          <h1 style={{fontSize:26,marginBottom:4}}>Sign Map</h1>
          <p style={{color:T.textMuted,fontSize:14}}>Physical placement of each QR sign — click a pin for live stats.</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="btn-primary" style={{fontSize:12,padding:"7px 14px"}} onClick={onSignMode}><Ic.pin/> Sign Mode</button>
          <button className={selectedProp==="all"?"btn-primary":"btn-secondary"} style={{fontSize:12,padding:"7px 14px"}} onClick={()=>setSelectedProp("all")}>All</button>
          {db.properties.map(p=><button key={p.id} className={selectedProp===p.id?"btn-primary":"btn-secondary"} style={{fontSize:12,padding:"7px 14px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} onClick={()=>setSelectedProp(p.id)}>{p.address.split(",")[0]}</button>)}
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        {[
          {label:"Signs on map",  value:visQRs.length,                    color:T.accent},
          {label:"Total scans",   value:visQRs.reduce((a,q)=>a+q.scan_count,0), color:T.blue},
          {label:"Top sign",      value:topSign?.label||"—",              color:T.yellow, small:true},
        ].map(m=><div key={m.label} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 18px",flex:1,minWidth:110}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:m.small?14:24,color:m.color,lineHeight:1,marginBottom:4}}>{m.value}</div>
          <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>{m.label}</div>
        </div>)}
      </div>

      <div className="map-layout" style={{display:"flex",gap:16,alignItems:"flex-start"}}>
        {/* Map */}
        <div style={{flex:1,minWidth:0}}>
          {!isPro?(
            <div style={{background:"#0f1623",borderRadius:12,height:480,border:`1px solid ${T.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:32,textAlign:"center"}}>
              <div style={{fontSize:52}}>🗺️</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:22}}>Sign Map is a Pro Feature</div>
              <div style={{color:T.textMuted,fontSize:14,maxWidth:300}}>Upgrade to see every QR sign pinned on the map with live stats.</div>
              <button className="btn-primary" style={{marginTop:8,padding:"12px 28px"}}>Upgrade to Pro — $19/mo</button>
            </div>
          ):visQRs.length===0?(
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,height:480,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <EmptyState icon="📍" title="No signs placed" desc="Use the pin button on each QR to set its physical location."/>
            </div>
          ):(
            <div style={{borderRadius:12,overflow:"hidden",height:480,border:`1px solid ${T.border}`}}>
              <LeafletSignMap qrcodes={db.qrcodes} properties={db.properties} leads={db.leads} selectedPropId={selectedProp} highlightId={highlightId}/>
            </div>
          )}
          {isPro&&visQRs.length>0&&<div style={{marginTop:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:11,color:T.textMuted}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:".06em"}}>Pin temp</span>
            {[["Cold","🧊",T.blue],["Warm","⚡",T.yellow],["Hot","🔥",T.red]].map(([label,emoji,color])=><span key={label} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:20,height:20,borderRadius:6,background:color,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{emoji}</span>{label}</span>)}
          </div>}
          {isPro&&<div style={{marginTop:7,fontSize:11,color:T.textMuted,textAlign:"right"}}>Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{color:T.accent}}>OpenStreetMap</a> · Free, no API key</div>}
          {noCoord.length>0&&isPro&&<div style={{marginTop:12,background:T.yellow+"11",border:`1px solid ${T.yellow}33`,borderRadius:10,padding:"10px 16px",display:"flex",gap:10,alignItems:"center"}}><span style={{color:T.yellow}}>⚠</span><div style={{fontSize:13,color:T.textDim}}><strong style={{color:T.yellow}}>{noCoord.length}</strong> sign{noCoord.length!==1?"s":""} missing location — use the <Ic.pin/> button on the dashboard to place them.</div></div>}
        </div>

        {/* Signs panel */}
        <div style={{width:252,flexShrink:0,display:"flex",flexDirection:"column",gap:9}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:T.textMuted,letterSpacing:".07em",textTransform:"uppercase",padding:"0 2px 4px"}}>{visQRs.length} Sign{visQRs.length!==1?"s":""} Placed</div>
          {[...visQRs].sort((a,b)=>b.scan_count-a.scan_count).map(qr=>{
            const prop=db.properties.find(p=>p.id===qr.property_id);
            const qrL=db.leads.filter(l=>l.qr_id===qr.id).length;
            const maxS=Math.max(...visQRs.map(q=>q.scan_count),1);
            const color=signColor(qr.label),emoji=signEmoji(qr.label),tempEmoji=heatEmoji(qr.scan_count,maxS),tempColor=heatColor(qr.scan_count,maxS),isHL=highlightId===qr.id;
            return(
              <div key={qr.id} onClick={()=>setHighlightId(isHL?null:qr.id)}
                style={{background:isHL?color+"14":T.card,border:`1px solid ${isHL?color+"55":T.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"all .18s"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                  <div style={{width:32,height:32,borderRadius:8,background:tempColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}} title={emoji}>{tempEmoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{qr.label}</div>
                    <div style={{fontSize:11,color:T.textMuted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{prop?.address.split(",")[0]}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:14,alignItems:"flex-end"}}>
                  <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color,lineHeight:1}}>{qr.scan_count}</div><div style={{fontSize:10,color:T.textMuted,fontWeight:600,textTransform:"uppercase"}}>scans</div></div>
                  <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:T.text,lineHeight:1}}>{qrL}</div><div style={{fontSize:10,color:T.textMuted,fontWeight:600,textTransform:"uppercase"}}>leads</div></div>
                  <button className="btn-ghost" style={{marginLeft:"auto",padding:"4px 8px",fontSize:11}} onClick={e=>{e.stopPropagation();onPickCoord(qr.id);}}><Ic.pin/> Move</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {isPro&&visQRs.length>0&&(
        <div style={{marginTop:28}}>
          <h2 style={{fontSize:17,marginBottom:14}}>Performance by Sign</h2>
          <div className="card" style={{overflow:"hidden"}}>
            <table className="data-table">
              <thead><tr><th>Sign</th><th>Property</th><th>Scans</th><th>Leads</th><th>Conv.</th><th>Location</th></tr></thead>
              <tbody>{[...visQRs].sort((a,b)=>b.scan_count-a.scan_count).map(qr=>{
                const prop=db.properties.find(p=>p.id===qr.property_id);
                const qrL=db.leads.filter(l=>l.qr_id===qr.id).length;
                const conv=qr.scan_count>0?Math.round((qrL/qr.scan_count)*100):0;
                const color=signColor(qr.label);
                return(<tr key={qr.id} onClick={()=>setHighlightId(qr.id)} style={{cursor:"pointer"}}>
                  <td><span style={{display:"flex",alignItems:"center",gap:8}}><span>{signEmoji(qr.label)}</span><span style={{color:T.text,fontWeight:600}}>{qr.label}</span></span></td>
                  <td style={{fontSize:12}}>{prop?.address.split(",")[0]}</td>
                  <td><span style={{fontWeight:700,color}}>{qr.scan_count}</span></td>
                  <td>{qrL}</td>
                  <td><span style={{color:conv>10?T.accent:conv>5?T.yellow:T.textMuted,fontWeight:600}}>{conv}%</span></td>
                  <td style={{fontSize:11,color:T.textMuted,fontFamily:"monospace"}}>{qr.lat?.toFixed(4)}, {qr.lng?.toFixed(4)}</td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SETTINGS ──────────────────────────────────────────────────────────────
const SettingsPage=({user,pushToast})=>{
  const [tpl,setTpl]=useState("Hey {name}, thanks for checking out {address}. Have a question or want more info? Just reply here.");
  const [saved,setSaved]=useState(false);
  const save=()=>{setSaved(true);pushToast("Settings saved!");setTimeout(()=>setSaved(false),2000);};
  return(
    <div style={{padding:"28px 24px",maxWidth:680,margin:"0 auto"}} className="fade-up">
      <h1 style={{fontSize:26,marginBottom:4}}>Settings</h1>
      <p style={{color:T.textMuted,fontSize:14,marginBottom:28}}>Manage your account and integrations.</p>
      <section className="card" style={{padding:22,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:16}}>Plan</h2>{user.plan==="pro"?<span className="badge badge-green"><Ic.star/> Pro</span>:<span className="badge badge-muted">Free</span>}</div>
        {user.plan==="pro"
          ?<div style={{color:T.textMuted,fontSize:14}}>You're on <strong style={{color:T.accent}}>Pro</strong> — unlimited QR codes, SMS, sign map, CSV export.<div style={{marginTop:12}}><button className="btn-secondary" style={{fontSize:13}}>Manage Billing</button></div></div>
          :<div>{["Unlimited QR codes","SMS follow-up automation","Sign placement map","CSV lead export","Multiple properties"].map(f=><div key={f} style={{display:"flex",gap:10,fontSize:14,color:T.textDim,alignItems:"center",marginBottom:7}}><span style={{color:T.accent}}><Ic.check/></span>{f}</div>)}<button className="btn-primary" style={{marginTop:12}}>Upgrade to Pro — $19/mo</button></div>}
      </section>
      <section className="card" style={{padding:22,marginBottom:16,position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}><h2 style={{fontSize:16}}>SMS Automation (Twilio)</h2>{user.plan!=="pro"&&<span className="badge badge-yellow"><Ic.lock/> Pro</span>}</div>
        {user.plan!=="pro"&&<div style={{position:"absolute",inset:0,background:T.card+"CC",backdropFilter:"blur(2px)",borderRadius:"inherit",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,flexDirection:"column",gap:10}}><Ic.lock/><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700}}>Pro feature</div><button className="btn-primary" style={{fontSize:13}}>Upgrade to unlock</button></div>}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><div className="label">Account SID</div><input className="input-field" defaultValue="AC••••••••••••••••••••••••••••••••"/></div>
          <div><div className="label">Auth Token</div><input className="input-field" type="password" defaultValue="••••••••••••••••"/></div>
          <div><div className="label">From Phone Number</div><input className="input-field" defaultValue="+15122223333"/></div>
          <div><div className="label">SMS Template</div><textarea className="input-field" rows={3} value={tpl} onChange={e=>setTpl(e.target.value)} style={{resize:"vertical"}}/><div style={{fontSize:11,color:T.textMuted,marginTop:5}}>Use {"{name}"} and {"{address}"} as placeholders.</div></div>
        </div>
      </section>
      <section className="card" style={{padding:22,marginBottom:22}}>
        <h2 style={{fontSize:16,marginBottom:16}}>Profile</h2>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><div className="label">Agent Name</div><input className="input-field" defaultValue={user.name}/></div>
          <div><div className="label">Email</div><input className="input-field" defaultValue={user.email}/></div>
        </div>
      </section>
      <button className="btn-primary" onClick={save} style={{minWidth:160,justifyContent:"center"}}>{saved?<><Ic.check/> Saved!</>:"Save Settings"}</button>
    </div>
  );
};

// ─── MODALS ────────────────────────────────────────────────────────────────
const AddPropertyModal=({onClose,onAdd,canAdd})=>{
  const [addr,setAddr]=useState("");
  return<Modal title="Add Property" onClose={onClose}>{!canAdd?<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:12}}>🔒</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:8}}>Pro required</div><div style={{color:T.textMuted,fontSize:14,marginBottom:20}}>Free plan is limited to 1 property.</div><button className="btn-primary" style={{width:"100%",justifyContent:"center"}}>Upgrade — $19/mo</button></div>:<><div style={{marginBottom:20}}><div className="label">Property Address</div><input className="input-field" placeholder="e.g. 124 Maple Drive, Austin TX 78701" value={addr} onChange={e=>setAddr(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&addr.trim()&&onAdd(addr.trim())}/></div><div style={{display:"flex",gap:10}}><button className="btn-secondary" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancel</button><button className="btn-primary" style={{flex:2,justifyContent:"center"}} onClick={()=>addr.trim()&&onAdd(addr.trim())} disabled={!addr.trim()}><Ic.plus/> Add Property</button></div></>}</Modal>;
};

const AddQRModal=({propertyId,onClose,onAdd,canAdd})=>{
  const [label,setLabel]=useState(""),[custom,setCustom]=useState(false);
  return<Modal title="Create QR Code" onClose={onClose}>{!canAdd?<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:12}}>🔒</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:8}}>Pro required</div><div style={{color:T.textMuted,fontSize:14,marginBottom:20}}>Free plan allows 1 QR per property.</div><button className="btn-primary" style={{width:"100%",justifyContent:"center"}}>Upgrade — $19/mo</button></div>:<><div style={{marginBottom:14}}><div className="label">Select Sign Type</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{SIGN_TYPES.slice(0,5).map(s=><button key={s.label} onClick={()=>{setLabel(s.label);setCustom(false);}} style={{background:label===s.label?s.color+"22":T.surface,border:`1px solid ${label===s.label?s.color:T.border}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,color:label===s.label?s.color:T.textDim,fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer",transition:"all .15s"}}><span>{s.emoji}</span>{s.label}</button>)}<button onClick={()=>{setCustom(true);setLabel("");}} style={{background:custom?T.accentDim:T.surface,border:`1px solid ${custom?T.accent:T.border}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,color:custom?T.accent:T.textDim,fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>📍 Custom</button></div></div>{custom&&<div style={{marginBottom:14}}><div className="label">Custom Label</div><input className="input-field" placeholder="e.g. Back Yard Sign" value={label} onChange={e=>setLabel(e.target.value)} autoFocus/></div>}<div style={{display:"flex",gap:10,marginTop:8}}><button className="btn-secondary" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancel</button><button className="btn-primary" style={{flex:2,justifyContent:"center"}} onClick={()=>label.trim()&&onAdd(label.trim())} disabled={!label.trim()}><Ic.plus/> Create QR Code</button></div></>}</Modal>;
};

const QRDetailModal=({qr,property,leads,qrUrl,onClose,onPrint,onSimulateScan,onPickCoord,pushToast})=>{
  const color=signColor(qr.label);
  return<Modal title={qr.label} onClose={onClose} width={520}><div style={{display:"flex",gap:20,marginBottom:22,flexWrap:"wrap"}}><div><div className="qr-container scan-anim" style={{width:138,height:138}}><QRCode value={qrUrl} size={118}/></div></div><div style={{flex:1,minWidth:170}}><div style={{marginBottom:14}}><div className="label">Property</div><div style={{fontSize:13,color:T.text,fontWeight:500}}>{property.address}</div></div><div style={{display:"flex",gap:20}}><div><div className="label">Scans</div><div className="stat-num" style={{color,fontSize:24}}>{qr.scan_count}</div></div><div><div className="label">Leads</div><div className="stat-num" style={{fontSize:24}}>{leads.length}</div></div></div>{qr.lat&&<div style={{marginTop:10,fontSize:11,color:T.accent}}>📍 {qr.lat.toFixed(4)}, {qr.lng.toFixed(4)}</div>}</div></div><div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 13px",display:"flex",alignItems:"center",gap:10,marginBottom:18}}><div style={{flex:1,fontSize:11,color:T.textMuted,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{qrUrl}</div><button className="btn-ghost" style={{padding:"4px 10px",flexShrink:0}} onClick={()=>navigator.clipboard?.writeText(qrUrl).then(()=>pushToast("Copied!"))}><Ic.copy/> Copy</button></div>{leads.length>0&&<div style={{marginBottom:18}}><div className="label" style={{marginBottom:9}}>Leads from this sign</div><div style={{display:"flex",flexDirection:"column",gap:7}}>{leads.slice(0,4).map(l=><div key={l.id} style={{display:"flex",alignItems:"center",gap:11,background:T.surface,borderRadius:8,padding:"9px 13px"}}><div style={{width:28,height:28,borderRadius:"50%",background:T.accentDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,fontFamily:"'Syne',sans-serif",color:T.accent,flexShrink:0}}>{l.name[0]}</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text}}>{l.name}</div><div style={{fontSize:11,color:T.textMuted}}>{l.email}</div></div><div style={{fontSize:11,color:T.textMuted}}>{fmtDate(l.created_at)}</div></div>)}</div></div>}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn-ghost" style={{flex:1,justifyContent:"center",minWidth:100}} onClick={onSimulateScan}>🔗 Test Scan</button><button className="btn-ghost" style={{flex:1,justifyContent:"center",minWidth:100}} onClick={onPickCoord}><Ic.pin/> Place Sign</button><button className="btn-primary" style={{flex:1,justifyContent:"center",minWidth:100}} onClick={onPrint}><Ic.dl/> Print</button></div></Modal>;
};

// ─── LANDING PAGE ──────────────────────────────────────────────────────────
const LandingPage=({property,qr,onSubmit,onBack})=>{
  const [name,setName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState(""),[loading,setLoading]=useState(false),[errors,setErrors]=useState({});
  const color=signColor(qr.label),emoji=signEmoji(qr.label);
  const validate=()=>{const e={};if(!name.trim())e.name="Required";if(!phone.trim())e.phone="Required";if(!email.trim()||!email.includes("@"))e.email="Valid email required";return e;};
  const submit=()=>{const e=validate();if(Object.keys(e).length){setErrors(e);return;}setLoading(true);setTimeout(()=>{setLoading(false);onSubmit({name:name.trim(),phone:phone.trim(),email:email.trim()});},900);};
  return(
    <div className="landing-bg" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <button className="btn-ghost" onClick={onBack} style={{position:"fixed",top:16,left:16,zIndex:100,background:T.card+"CC",backdropFilter:"blur(6px)"}}>← Demo: Back</button>
      <div style={{width:"100%",maxWidth:420}} className="fade-up">
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:T.card+"CC",backdropFilter:"blur(8px)",border:`1px solid ${T.border}`,borderRadius:100,padding:"6px 16px",marginBottom:16}}><span>{emoji}</span><span style={{fontSize:12,fontWeight:600,fontFamily:"'Syne',sans-serif",color:T.textDim}}>{qr.label}</span></div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:T.text,lineHeight:1.2}}>{property.address.split(",")[0]}</div>
          <div style={{color:T.textMuted,fontSize:14,marginTop:4}}>{property.address.split(",").slice(1).join(",").trim()}</div>
        </div>
        <div className="card" style={{padding:24}}>
          <div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:18,marginBottom:5}}>Get Price, Photos & More</div><div style={{color:T.textMuted,fontSize:14}}>We'll text you everything instantly.</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div><div className="label">Your Name</div><input className="input-field" placeholder="Jane Smith" value={name} onChange={e=>{setName(e.target.value);setErrors(er=>({...er,name:null}));}} style={errors.name?{borderColor:T.red}:{}}/>{errors.name&&<div style={{color:T.red,fontSize:12,marginTop:3}}>{errors.name}</div>}</div>
            <div><div className="label">Phone Number</div><input className="input-field" placeholder="(512) 000-0000" value={phone} onChange={e=>{setPhone(e.target.value);setErrors(er=>({...er,phone:null}));}} type="tel" style={errors.phone?{borderColor:T.red}:{}}/>{errors.phone&&<div style={{color:T.red,fontSize:12,marginTop:3}}>{errors.phone}</div>}</div>
            <div><div className="label">Email</div><input className="input-field" placeholder="jane@email.com" value={email} onChange={e=>{setEmail(e.target.value);setErrors(er=>({...er,email:null}));}} type="email" style={errors.email?{borderColor:T.red}:{}}/>{errors.email&&<div style={{color:T.red,fontSize:12,marginTop:3}}>{errors.email}</div>}</div>
          </div>
          <button className="btn-primary" style={{width:"100%",justifyContent:"center",marginTop:18,padding:"13px 0",fontSize:15}} onClick={submit} disabled={loading}>{loading?<><div className="spinner"/> Submitting…</>:"Get Listing Info & Photos →"}</button>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12,justifyContent:"center"}}><Ic.sms/><span style={{fontSize:12,color:T.textMuted}}>You'll receive a text instantly.</span></div>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:T.textMuted}}>Powered by <span style={{color:T.accent,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>RealtQR</span></div>
      </div>
    </div>
  );
};

const LandingSuccess=({property,onDone})=>(
  <div className="landing-bg" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{textAlign:"center",maxWidth:380}} className="fade-up">
      <div style={{width:72,height:72,background:T.accentDim,border:`2px solid ${T.accent}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 22px",animation:"glow 2s ease infinite"}}>✓</div>
      <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,marginBottom:10}}>You're all set!</h2>
      <p style={{color:T.textMuted,marginBottom:8}}>We've sent you a text about <strong style={{color:T.text}}>{property?.address.split(",")[0]}</strong>.</p>
      <p style={{color:T.textMuted,fontSize:14,marginBottom:28}}>An agent will text you with answers and listing details shortly.</p>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 20px",marginBottom:24,display:"flex",gap:12,alignItems:"center"}}><span style={{fontSize:22}}>📱</span><div style={{textAlign:"left"}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:2}}>SMS Sent</div><div style={{fontSize:12,color:T.textMuted}}>Check your phone for listing details.</div></div></div>
      <button className="btn-secondary" onClick={onDone} style={{fontSize:13}}>← Back to Dashboard (Demo)</button>
      <div style={{marginTop:18,fontSize:11,color:T.textMuted}}>Powered by <span style={{color:T.accent,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>RealtQR</span></div>
    </div>
  </div>
);

// ─── PRINT PREVIEW ─────────────────────────────────────────────────────────
const PrintPreview=({qr,property,qrUrl,onClose})=>{
  const color=signColor(qr.label),emoji=signEmoji(qr.label);
  return(
    <div style={{background:T.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"14px 24px",display:"flex",alignItems:"center",gap:14}}>
        <button className="btn-ghost" onClick={onClose}>← Back</button>
        <div style={{flex:1,fontFamily:"'Syne',sans-serif",fontWeight:700}}>Print Preview — {qr.label}</div>
        <button className="btn-primary" onClick={()=>window.print()}><Ic.dl/> Print / Save PDF</button>
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:40}}>
        <div style={{width:380,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 30px 80px rgba(0,0,0,.6)",fontFamily:"'Syne',sans-serif"}}>
          <div style={{background:"#00D4AA",padding:"18px 24px",textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,letterSpacing:".1em",color:"#003D30",marginBottom:4}}>OPEN HOUSE</div>
            <div style={{fontSize:22,fontWeight:800,color:"#003D30",lineHeight:1.2}}>{property.address.split(",")[0]}</div>
            <div style={{fontSize:13,color:"#005046",marginTop:4}}>{property.address.split(",").slice(1).join(",").trim()}</div>
          </div>
          <div style={{padding:"28px 24px",textAlign:"center",background:"#fff"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0A0C10",marginBottom:16}}>📱 Scan for price, photos & answers</div>
            <div style={{display:"inline-block",background:"#fff",padding:12,borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,.1)"}}><QRCode value={qrUrl} size={180} fgColor="#0A0C10" bgColor="#ffffff"/></div>
            <div style={{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:8,padding:"4px 12px",fontSize:13,fontWeight:700,color:"#0A0C10"}}>{emoji} {qr.label}</div></div>
            <div style={{marginTop:10,fontSize:11,color:"#666",fontFamily:"DM Sans,sans-serif"}}>{qrUrl}</div>
          </div>
          <div style={{background:"#F5F5F5",padding:"12px 24px",textAlign:"center",borderTop:"1px solid #E5E5E5"}}><div style={{fontSize:11,fontWeight:700,color:"#888",letterSpacing:".06em"}}>POWERED BY REALTQR</div></div>
        </div>
      </div>
    </div>
  );
};
