'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  QrCode,
  Flame,
  MessageSquare,
  Lock,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

const PURPLE = '#534AB7'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

const viewportOnce = { once: true, margin: '-60px' } as const

function Wordmark() {
  return (
    <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", letterSpacing: '-0.5px' }}>
      <span style={{ fontSize: '18px', fontWeight: 300, color: '#1a1a1a' }}>the</span>
      <span style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7' }}>qr</span>
      <span style={{ fontSize: '18px', fontWeight: 500, color: '#1a1a1a' }}>ealtor</span>
    </span>
  )
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-solid border-gray-100">
      <div className="max-w-3xl mx-auto px-8 py-3 flex items-center justify-between">
        <Link href="/" aria-label="theqrealtor home">
          <Wordmark />
        </Link>
        <Link
          href="/auth?tab=signup"
          className="bg-[#534AB7] hover:bg-[#3C3489] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Join beta
        </Link>
      </div>
    </nav>
  )
}

function ScoreBar({ pct, delay }: { pct: number; delay: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-[#534AB7]"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}

function DashboardMockup() {
  return (
    <div className="rounded-xl border border-solid border-gray-200 bg-white overflow-hidden min-h-[210px]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-solid border-gray-100 bg-gray-50">
        <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
        <span className="ml-3 flex-1 max-w-[240px] rounded-md bg-white border border-solid border-gray-200 px-3 py-0.5 text-[11px] text-gray-400">
          theqrealtor.com/dashboard
        </span>
      </div>
      {/* Tabs */}
      <div className="flex items-center gap-4 px-5 pt-3 pb-2 border-b border-solid border-gray-100">
        <span className="text-[11px] font-semibold text-[#534AB7] pb-1" style={{ borderBottom: '2px solid #534AB7' }}>
          All Activity
        </span>
        <span className="text-[11px] font-medium text-gray-400 pb-1">Hot</span>
        <span className="text-[11px] font-medium text-gray-400 pb-1">Inquiries</span>
      </div>
      {/* Activity rows */}
      <div className="p-5">
        <div className="flex flex-col gap-4">
          {/* Anonymous visitors */}
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">JS</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">Anonymous visitor</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: '#EEEDFE', color: '#534AB7' }}>Returning</span>
              </div>
              <div className="text-[11px] text-gray-400">123 Main St</div>
            </div>
            <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-red-600 mt-0.5">Hot</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">AM</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">Anonymous visitor</span>
              </div>
              <div className="text-[11px] text-gray-400">456 Elm St</div>
            </div>
            <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-amber-600 mt-0.5">Warm</span>
            </div>
          </div>
          {/* Named leads who inquired */}
          <div className="flex items-center gap-3 border-t border-solid border-gray-100 pt-4">
            <span className="w-8 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0" style={{ background: '#16A34A', color: '#FFFFFF' }}>SM</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">Sarah M.</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: '#16A34A', color: '#FFFFFF' }}>Inquired</span>
              </div>
              <div className="text-[11px] text-gray-400">321 Pine St</div>
              <div className="text-[11px] font-medium text-[#534AB7]">View inquiry →</div>
            </div>
            <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-red-600 mt-0.5">Hot</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0" style={{ background: '#16A34A', color: '#FFFFFF' }}>DC</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">David C.</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: '#16A34A', color: '#FFFFFF' }}>Inquired</span>
              </div>
              <div className="text-[11px] text-gray-400">654 Cedar St</div>
              <div className="text-[11px] font-medium text-[#534AB7]">View inquiry →</div>
            </div>
            <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-red-600 mt-0.5">Hot</span>
            </div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center justify-center gap-2 px-5 py-2.5 border-t border-solid border-gray-100 bg-gray-50">
        <Lock size={12} className="text-gray-400" />
        <span className="text-[11px] text-gray-400">Your leads. Your data. Never shared.</span>
      </div>
    </div>
  )
}

function Hero() {
  const scrollToHow = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="border-b border-solid border-gray-100">
      <motion.div
        className="max-w-3xl mx-auto py-16 px-8"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
      >
        <motion.div variants={fadeUp} className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#EEEDFE] px-4 py-1.5 text-xs font-medium text-[#534AB7]">
            <span className="w-2 h-2 rounded-full bg-[#534AB7] animate-pulse" />
            Free private beta — limited spots
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-center text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 leading-tight mb-5"
        >
          Every sign attracts buyers.{' '}
          <span style={{ color: '#534AB7' }}>
            Know who&apos;s exploring — and who&apos;s showing stronger buying intent.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="text-center text-lg text-gray-500 leading-relaxed max-w-xl mx-auto mb-8"
        >
          Buyers already stop at your signs. They scan, browse the property, compare details, and often return later.
          <br /><br />
          theqrealtor turns every scan into actionable engagement insights, helping you understand buyer interest while every active QR sign works 24/7 to keep buyers connected to the property — and to you.
        </motion.p>

        <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-12">
          <Link
            href="/auth?tab=signup"
            className="bg-[#534AB7] hover:bg-[#3C3489] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Request beta access
          </Link>
          <button
            onClick={scrollToHow}
            className="border border-solid border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            See how it works
          </button>
        </motion.div>

        <motion.div variants={fadeUp} className="max-w-xl mx-auto">
          <DashboardMockup />
        </motion.div>
      </motion.div>
    </section>
  )
}

function StatsBar() {
  const stats = [
    { value: 'Measure Interest', label: 'Scans, return visits, engagement trends' },
    { value: 'Recognize Intent', label: 'Curiosity vs. stronger buying signals' },
    { value: 'Stay Available 24/7', label: "Buyers connect whenever they're ready" },
  ]
  return (
    <section className="border-b border-solid border-gray-100">
      <motion.div
        className="max-w-3xl mx-auto px-8 py-10 grid grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewportOnce}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </motion.div>
    </section>
  )
}

function TwoMoments() {
  return (
    <section className="border-b border-solid border-gray-100">
      <div className="max-w-3xl mx-auto py-16 px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-[#534AB7] mb-3">
            The difference
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Two moments. Both yours.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <motion.div
            className="bg-gray-50 rounded-xl p-6"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0 }}
          >
            <div className="text-sm font-semibold text-gray-900 mb-3">Before they reach out</div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Every scan, every photo viewed, every return visit builds a silent intent profile. You see engagement in real time. No name. No contact. Just signal.
            </p>
          </motion.div>

          <motion.div
            className="rounded-xl p-6"
            style={{ background: '#534AB7' }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
          >
            <div className="text-sm font-semibold text-white mb-3">When they decide</div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
              The moment a buyer requests a showing or asks a question, their details land in your dashboard. No marketplace. No middleman. Directly to you.
            </p>
          </motion.div>
        </div>

        <motion.p
          className="text-center text-sm text-gray-400"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.3 }}
        >
          Most agents only hear from buyers who call. You see every buyer who was ever interested.
        </motion.p>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      title: 'Place your sign',
      body: 'Print your QR code and place it on your yard sign or A-frame. One sign. Every listing.',
    },
    {
      title: 'Buyers engage, you learn',
      body: 'Buyers scan to view photos, pricing, and details. Their behavior — time on page, photos viewed, return visits — is scored instantly.',
    },
    {
      title: 'Follow up at the right moment',
      body: 'When a buyer requests a showing or asks a question, you get an instant SMS alert and their details go straight to your dashboard.',
    },
  ]

  return (
    <section id="how-it-works" className="border-b border-solid border-gray-100 scroll-mt-16">
      <div className="max-w-3xl mx-auto py-16 px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-[#534AB7] mb-3">
            How it works
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            How buyer interest becomes a conversation.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-h-[180px]">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              className="bg-gray-50 rounded-xl p-5 flex flex-col"
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, ease: 'easeOut', delay: i * 0.4 },
                },
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="w-7 h-7 rounded-full bg-[#EEEDFE] text-[#534AB7] text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <ArrowRight size={16} className="text-gray-300" />
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-2">{step.title}</div>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{step.body}</p>
              <div className="mt-auto h-1 rounded-full bg-gray-200 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#534AB7]"
                  variants={{
                    hidden: { width: 0 },
                    show: {
                      width: '100%',
                      transition: { duration: 0.6, ease: 'easeOut', delay: 0.3 + i * 0.4 },
                    },
                  }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Features() {
  const features = [
    {
      icon: QrCode,
      title: 'One sign. Every listing.',
      body: "Print once, place it on your sign. Every scan reveals how buyers engage with your listing — long after you've left the property.",
    },
    {
      icon: Flame,
      title: 'Surface stronger buying signals.',
      body: 'Cold, warm, or hot — scored by time on page, photos viewed, and return visits. Identify meaningful interest, not just a single scan.',
    },
    {
      icon: MessageSquare,
      title: 'Know exactly when to follow up.',
      body: 'When a buyer submits an inquiry, you get an instant SMS alert with their engagement history. You always know context before you call.',
    },
    {
      icon: Lock,
      title: 'Your data. Never shared.',
      body: 'Every inquiry is stored in your dashboard, under your control — yours to keep and export anytime.',
    },
  ]

  return (
    <section className="border-b border-solid border-gray-100">
      <div className="max-w-3xl mx-auto py-16 px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-h-[300px]">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="bg-gray-50 rounded-xl p-5 border border-solid border-transparent hover:border-gray-300 transition-colors"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.4, ease: 'easeOut', delay: i * 0.15 }}
            >
              <f.icon size={20} className="text-[#534AB7] mb-3" />
              <div className="text-sm font-semibold text-gray-900 mb-2">{f.title}</div>
              <p className="text-sm text-gray-500 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SmartQrSign() {
  return (
    <div className="w-60 flex-shrink-0 flex flex-col items-center">
      <div
        className="bg-white border border-solid border-gray-200 p-5 text-center w-full"
        style={{ borderRadius: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#534AB7] mb-1.5">
          Open House
        </div>
        <div className="text-xl font-bold text-gray-900 mb-4">123 Maple St</div>
        <div className="flex justify-center mb-4">
          <QRCodeSVG value="https://theqrealtor.com" size={120} />
        </div>
        <div className="text-[11px] text-gray-500 leading-relaxed mb-4">
          <div>· View photos &amp; details</div>
          <div>· Request a showing</div>
          <div>· Ask a question</div>
        </div>
        <div className="text-[9px] text-gray-400">Powered by theqrealtor</div>
      </div>
      {/* Sign post */}
      <div className="flex justify-center gap-8">
        <span className="w-0.5 bg-[#D1D5DB]" style={{ height: 40 }} />
        <span className="w-0.5 bg-[#D1D5DB]" style={{ height: 40 }} />
      </div>
    </div>
  )
}

function FlowLabels() {
  const steps = ['Scan', 'Browse', 'Engage', 'Insights']
  return (
    <div className="flex flex-col items-center justify-center flex-shrink-0">
      {steps.map((step, i) => (
        <div key={step} className="flex flex-col items-center">
          {i > 0 && (
            <span className="text-sm leading-none my-2" style={{ color: '#534AB7' }}>↓</span>
          )}
          <span
            style={{
              background: '#EEEDFE',
              color: '#534AB7',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {step}
          </span>
        </div>
      ))}
    </div>
  )
}

function BuyerPhoneCard() {
  return (
    <div
      className="bg-white border border-solid border-[#E5E7EB] p-3 w-full"
      style={{ borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
    >
      {/* Browser bar */}
      <div className="rounded-full bg-gray-100 px-3 py-1 text-center text-[10px] text-gray-400 mb-2.5">
        theqrealtor.com/p/...
      </div>
      {/* Hero image */}
      <div
        className="rounded-lg flex items-center justify-center mb-2.5"
        style={{ background: 'linear-gradient(135deg, #EEEDFE 0%, #C4B5FD 100%)', height: 100 }}
      >
        <span className="text-3xl" role="img" aria-label="Property">🏡</span>
      </div>
      {/* Property details */}
      <div className="text-base font-bold text-gray-900 mb-0.5">$950,000</div>
      <div className="text-xs font-medium text-gray-700 mb-0.5">123 Maple St, San Diego</div>
      <div className="text-[10px] text-gray-400 mb-3">3 bed · 2 bath · 1,820 sqft</div>
      {/* CTAs */}
      <div className="flex flex-col gap-1.5 mb-2.5">
        <span className="block w-full text-center text-[11px] font-semibold rounded-lg py-2 bg-[#534AB7] text-white">
          Request a Showing
        </span>
        <span className="block w-full text-center text-[11px] font-semibold rounded-lg py-2 bg-white border border-solid border-[#534AB7] text-[#534AB7]">
          Ask a Question
        </span>
      </div>
      <div className="text-center text-[8px] text-gray-400">Powered by theqrealtor</div>
    </div>
  )
}

function AnalyticsCard() {
  const metrics = [
    { label: 'Scans', value: '14' },
    { label: 'Repeat Visits', value: '3' },
    { label: 'Avg Time', value: '4m 12s' },
    { label: 'Photos Viewed', value: '18' },
  ]
  return (
    <div className="w-full" style={{ background: '#0F0F13', borderRadius: 16, padding: 16 }}>
      <div className="text-xs font-bold text-white mb-3">Buyer Activity</div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {metrics.map(m => (
          <div key={m.label}>
            <div className="text-[10px] text-gray-500">{m.label}</div>
            <div className="text-sm font-semibold text-white">{m.value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-solid border-gray-800 pt-3 mb-2">
        <span className="text-[11px] text-gray-400">Intent Score</span>
        <span
          className="text-[11px] font-semibold text-white"
          style={{ background: '#EF4444', borderRadius: 20, padding: '2px 10px' }}
        >
          Hot 🔥
        </span>
      </div>
      <div className="text-[10px] text-gray-500">Last active: 2 minutes ago</div>
    </div>
  )
}

function BuyerExperience() {
  const featureCards = [
    {
      icon: '📊',
      title: 'Engagement Analytics',
      body: 'Track scans, repeat visits, time on page, and photo views in real time.',
    },
    {
      icon: '🎯',
      title: 'Buyer Intent',
      body: 'Surface stronger buying signals from engagement patterns before buyers reach out.',
    },
    {
      icon: '💬',
      title: 'Direct Connection',
      body: 'Buyers can request a showing or ask a question instantly — no friction.',
    },
    {
      icon: '🕒',
      title: 'Works 24/7',
      body: 'Every active QR sign keeps working after the open house ends.',
    },
  ]

  return (
    <section className="border-b border-solid border-gray-100">
      <div className="max-w-3xl mx-auto py-16 px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-[#534AB7] mb-3">
            How buyers experience it
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            What buyers see. What you see.
          </h2>
        </motion.div>

        {/* Three columns: sign → flow → phone + analytics */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-8 mb-12">
          <SmartQrSign />
          <div className="self-center">
            <FlowLabels />
          </div>
          <div className="w-60 flex-shrink-0 flex flex-col gap-4">
            <BuyerPhoneCard />
            <AnalyticsCard />
          </div>
        </div>

        {/* Four feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {featureCards.map(card => (
            <div
              key={card.title}
              className="bg-white border border-solid border-[#E5E7EB]"
              style={{ borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
            >
              <div className="text-xl mb-3" role="img" aria-label={card.title}>{card.icon}</div>
              <div className="text-sm font-semibold text-gray-900 mb-2">{card.title}</div>
              <p className="text-sm text-gray-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CommonQuestion() {
  return (
    <section className="border-b border-solid border-gray-100">
      <motion.div
        className="max-w-3xl mx-auto py-16 px-8 text-center"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewportOnce}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest text-[#534AB7] mb-3">
          A common question
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">
          Do buyers actually scan QR codes?
        </h2>
        <p className="text-gray-500 leading-relaxed max-w-xl mx-auto">
          Buyers already pull out their phones at yard signs. Give them an instant reason — photos, pricing, property details, no download required. The experience loads fast enough that curiosity becomes engagement before they walk away.
        </p>
        <p className="text-gray-500 leading-relaxed max-w-xl mx-auto mt-4">
          Most agents assume buyers won&apos;t scan. That assumption is costing them pipeline.
        </p>
      </motion.div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-b border-solid border-gray-100">
      <motion.div
        className="max-w-3xl mx-auto py-16 px-8 text-center"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewportOnce}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">
          Start seeing the <span style={{ color: '#534AB7' }}>buyer interest</span> you&apos;ve been missing.
        </h2>
        <p className="text-gray-500 leading-relaxed max-w-md mx-auto mb-8">
          Join the free private beta. No credit card required. Up to 10 QR codes. Your inquiries, always yours.
        </p>
        <Link
          href="/auth?tab=signup"
          className="inline-block bg-[#534AB7] hover:bg-[#3C3489] text-white rounded-lg px-7 py-3 text-base font-medium transition-colors"
        >
          Request beta access
        </Link>
        <p className="text-xs text-gray-400 mt-4">
          Free for beta agents · Up to 10 QR codes · No card required
        </p>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer>
      <div className="max-w-3xl mx-auto px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-5 text-xs text-gray-400">
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-gray-600 transition-colors">
            Terms of Service
          </Link>
          <Link href="/sms-consent" className="hover:text-gray-600 transition-colors">
            SMS Consent
          </Link>
        </div>
        <span className="text-xs text-gray-400">© 2026 theqrealtor</span>
      </div>
    </footer>
  )
}

function RevealSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { setVisible(entry.isIntersecting) },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      {children}
    </div>
  )
}

export default function MarketingPage() {
  return (
    <div
      className="lp min-h-screen bg-white text-gray-900"
      style={{
        fontFamily: "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
        colorScheme: 'light',
      }}
    >
      <Nav />
      <main>
        <Hero />
        <RevealSection><StatsBar /></RevealSection>
        <RevealSection><TwoMoments /></RevealSection>
        <RevealSection><HowItWorks /></RevealSection>
        <RevealSection><Features /></RevealSection>
        <RevealSection><BuyerExperience /></RevealSection>
        <RevealSection><CommonQuestion /></RevealSection>
        <RevealSection><FinalCta /></RevealSection>
      </main>
      <Footer />
    </div>
  )
}
