'use client'

import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  QrCode,
  Flame,
  MessageSquare,
  Lock,
  Bell,
  BarChart2,
} from 'lucide-react'

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
      {/* Leads */}
      <div className="p-5">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
          Your leads
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">Sarah M.</span>
              <span className="text-[11px] font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                Hot
              </span>
            </div>
            <ScoreBar pct={85} delay={0.8} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">James T.</span>
              <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                Warm
              </span>
            </div>
            <ScoreBar pct={55} delay={0.8} />
          </div>
        </div>
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
          Every lead belongs to you.{' '}
          <span className="text-[#534AB7]">Build your database</span>, not your
          broker&apos;s.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="text-center text-lg text-gray-500 leading-relaxed max-w-xl mx-auto mb-8"
        >
          Place a QR code on your yard sign. Buyers scan it, you get their
          contact info, their behavior score, and an instant SMS alert — all in
          your private dashboard.
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
    { value: '100%', label: 'Your leads, no sharing' },
    { value: '< 30s', label: 'SMS alert on scan' },
    { value: '10', label: 'QR codes in beta' },
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

function HowItWorks() {
  const steps = [
    {
      title: 'Place your QR sign',
      body: 'Print your unique QR code and put it on your yard sign or open house A-frame.',
    },
    {
      title: 'Buyer scans, you learn',
      body: 'Buyers land on your property page. Their behavior — photos viewed, time on page, return visits — is scored.',
    },
    {
      title: 'Call the right buyer first',
      body: 'You get an instant SMS alert with the lead’s score. Your dashboard shows you exactly who to call.',
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
            Three steps to buyer intent data
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
                hidden: { opacity: 0, y: 18 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, ease: 'easeOut', delay: i * 0.15 },
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
                      transition: { duration: 0.6, ease: 'easeOut', delay: 0.3 + i * 0.15 },
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
      title: 'Permanent QR codes',
      body: 'One QR per sign. Reassign it to a new listing anytime — your sign, your data, forever.',
    },
    {
      icon: Flame,
      title: 'Behavior-based scoring',
      body: 'Cold, warm, or hot — scored by time on page, photos viewed, and return visits.',
    },
    {
      icon: MessageSquare,
      title: 'Instant SMS alerts',
      body: 'Text notification the moment a buyer scans your sign, with their lead score included.',
    },
    {
      icon: Lock,
      title: 'No brokerage visibility',
      body: 'Your leads stay yours. No sharing, no broker dashboard access, no data handed off.',
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
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.1 }}
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

const QR_PATTERN = [
  [1, 1, 1, 0, 1, 1, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 1, 1, 0, 1, 1, 1],
  [0, 0, 0, 1, 0, 0, 0],
  [1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 1, 0, 1, 0],
  [1, 1, 1, 0, 1, 0, 1],
]

function MiniQr() {
  return (
    <div className="inline-grid grid-cols-7 border border-solid border-gray-200 p-1 bg-white">
      {QR_PATTERN.flatMap((row, r) =>
        row.map((cell, c) => (
          <span
            key={`${r}-${c}`}
            className={`w-2 h-2 ${cell ? 'bg-black' : 'bg-white'}`}
          />
        ))
      )}
    </div>
  )
}

function AFrameSign() {
  return (
    <div className="w-48 flex-shrink-0">
      <div className="bg-white border border-solid border-gray-200 rounded-lg p-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#534AB7] mb-1.5">
          Open House
        </div>
        <div className="text-sm font-semibold text-gray-900 mb-3">123 Maple St</div>
        <MiniQr />
        <p className="text-[10px] text-gray-500 leading-snug mt-3 mb-3">
          Scan to request a showing or ask a question
        </p>
        <div className="text-[9px] text-gray-400">Powered by theqrealtor</div>
      </div>
      {/* A-frame legs */}
      <div className="flex justify-between px-8">
        <span className="w-1 h-8 bg-gray-200 rounded-b" />
        <span className="w-1 h-8 bg-gray-200 rounded-b" />
      </div>
    </div>
  )
}

function PhoneMockup() {
  return (
    <div className="w-56 flex-shrink-0 bg-white border border-solid border-gray-200 rounded-3xl shadow-sm p-2.5">
      {/* Notch */}
      <div className="flex justify-center mb-2">
        <span className="w-16 h-1.5 rounded-full bg-gray-200" />
      </div>
      {/* URL bar */}
      <div className="rounded-full bg-gray-100 px-3 py-1 text-center text-[10px] text-gray-400 mb-2">
        theqrealtor.com/p/...
      </div>
      {/* Property image placeholder */}
      <div className="h-20 rounded-lg bg-[#EEEDFE] mb-2.5" />
      <div className="text-xs font-semibold text-gray-900 mb-0.5">
        123 Maple St, San Diego
      </div>
      <div className="text-[10px] text-gray-400 mb-2">3 bed · 2 bath · 1,820 sqft</div>
      <p className="text-[9px] text-gray-400 leading-snug mb-2.5">
        By contacting the agent you authorize the listing agent to contact you.
      </p>
      {/* Contact preference toggle */}
      <div className="flex gap-1.5 mb-2.5">
        <span className="flex-1 text-center text-[10px] font-medium rounded-md py-1 bg-[#534AB7] text-white">
          Phone
        </span>
        <span className="flex-1 text-center text-[10px] font-medium rounded-md py-1 bg-gray-100 text-gray-500">
          Email
        </span>
      </div>
      {/* CTAs */}
      <div className="flex flex-col gap-1.5 mb-2.5">
        <span className="block w-full text-center text-[11px] font-semibold rounded-lg py-2 bg-[#534AB7] text-white">
          Request a showing
        </span>
        <span className="block w-full text-center text-[11px] font-semibold rounded-lg py-2 bg-white border border-solid border-[#534AB7] text-[#534AB7]">
          Ask a question
        </span>
      </div>
      <div className="text-center text-[8px] text-gray-400">Powered by theqrealtor</div>
    </div>
  )
}

function BuyerExperience() {
  const captions = [
    {
      icon: Bell,
      text: 'You get an instant SMS alert the moment they scan — with their lead score',
    },
    {
      icon: Lock,
      text: 'Their contact info goes directly into your dashboard — no brokerage access, ever',
    },
    {
      icon: BarChart2,
      text: 'Every photo viewed, every return visit, every minute on page — scored and waiting for you',
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
            From sidewalk to your inbox in seconds
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-12 min-h-[320px]"
        >
          <AFrameSign />
          <div className="text-xs font-medium text-[#534AB7] whitespace-nowrap">
            buyer scans →
          </div>
          <PhoneMockup />
        </motion.div>

        <div className="flex flex-col gap-4 max-w-xl mx-auto">
          {captions.map((c, i) => (
            <motion.div
              key={c.text}
              className="flex items-start gap-3"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.1 }}
            >
              <c.icon size={16} className="text-[#534AB7] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-600 leading-relaxed">{c.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
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
          Ready to own your leads?
        </h2>
        <p className="text-gray-500 leading-relaxed max-w-md mx-auto mb-8">
          Join the free private beta. No credit card. No brokerage access. Just
          your buyers, your data, your dashboard.
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
        <StatsBar />
        <HowItWorks />
        <Features />
        <BuyerExperience />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
