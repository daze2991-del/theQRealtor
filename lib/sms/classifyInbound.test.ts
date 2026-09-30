import { describe, expect, it } from 'vitest'
import {
  classifyInbound,
  FREEFORM_OPT_OUT_PHRASES,
  HELP_KEYWORDS,
  OPT_IN_KEYWORDS,
  OPT_OUT_KEYWORDS,
} from './classifyInbound'

const c = (body: string, optOutType?: string) => classifyInbound({ body, optOutType })

describe('keyword lists mirror Twilio Advanced Opt-Out exactly', () => {
  it('has the configured lists, and no "yes"', () => {
    expect([...OPT_OUT_KEYWORDS]).toEqual(['cancel', 'end', 'optout', 'quit', 'revoke', 'stop', 'stopall', 'unsubscribe'])
    expect([...OPT_IN_KEYWORDS]).toEqual(['start', 'unstop'])
    expect([...HELP_KEYWORDS]).toEqual(['help', 'info'])
  })
})

describe('whole-message keyword match', () => {
  it.each(OPT_OUT_KEYWORDS)('opt-out: %s', kw => {
    expect(c(kw)).toEqual({ eventType: 'opt_out', detectionSource: 'keyword_match', matchedKeyword: kw })
  })
  it.each(OPT_IN_KEYWORDS)('opt-in: %s', kw => {
    expect(c(kw)).toEqual({ eventType: 'opt_in', detectionSource: 'keyword_match', matchedKeyword: kw })
  })
  it.each(HELP_KEYWORDS)('help: %s', kw => {
    expect(c(kw)).toEqual({ eventType: 'help', detectionSource: 'keyword_match', matchedKeyword: kw })
  })

  it.each(['STOP', 'Stop', 'Stop.', ' stop! ', 'stop!!!', '"stop"', 'STOP 🛑', '\nStop\t', 'sToP?'])(
    'casing / punctuation / whitespace / emoji variant %j is opt-out "stop"',
    v => {
      expect(c(v)).toEqual({ eventType: 'opt_out', detectionSource: 'keyword_match', matchedKeyword: 'stop' })
    },
  )

  it.each(['START', 'Start.', ' unstop! '])('opt-in variant %j', v => {
    expect(c(v).eventType).toBe('opt_in')
    expect(c(v).detectionSource).toBe('keyword_match')
  })

  it.each(['HELP', 'Help?', ' info. '])('help variant %j', v => {
    expect(c(v).eventType).toBe('help')
  })
})

describe('Twilio OptOutType takes precedence', () => {
  it.each([
    ['STOP', 'opt_out'],
    ['stop', 'opt_out'],
    ['START', 'opt_in'],
    ['HELP', 'help'],
  ] as const)('OptOutType=%s → %s', (oot, event) => {
    const r = c('whatever they typed', oot)
    expect(r.eventType).toBe(event)
    expect(r.detectionSource).toBe('twilio_opt_out_type')
  })

  it('records the actual keyword sent when the body is one', () => {
    expect(c('Unsubscribe', 'STOP')).toEqual({ eventType: 'opt_out', detectionSource: 'twilio_opt_out_type', matchedKeyword: 'unsubscribe' })
  })

  it('falls back to the OptOutType value when the body is not a keyword', () => {
    expect(c('', 'STOP').matchedKeyword).toBe('stop')
  })

  it('ignores an unrecognized OptOutType and classifies the body', () => {
    expect(c('hello', 'SOMETHING')).toEqual({ eventType: null, detectionSource: null, matchedKeyword: null })
    expect(c('stop', 'SOMETHING').detectionSource).toBe('keyword_match')
  })
})

describe('ordinary messages (null)', () => {
  it.each([
    'yes',
    'YES',
    'Yes!',
    "I'll end up coming Saturday",
    'Can you help me?',
    'I need info on the house',
    'help me please',
    'Is it still available?',
    'Can I stop by Saturday?',
    'We should start the paperwork',
    'Cancel my showing and reschedule for Friday',
    '',
    '   ',
    '👍',
  ])('%j → null', body => {
    expect(c(body)).toEqual({ eventType: null, detectionSource: null, matchedKeyword: null })
  })
})

describe('freeform opt-out', () => {
  it.each([
    ['please stop texting me', 'stop text'],
    ['Stop messaging me.', 'stop messag'],
    ['stop sending me these', 'stop send'],
    ['STOP CONTACTING ME', 'stop contact'],
    ['stop calling me', 'stop call'],
    ['please unsubscribe me from this', 'unsubscrib'],
    ['I already unsubscribed', 'unsubscrib'],
    ['Remove me from your list', 'remove me'],
    ['take me off this list', 'take me off'],
    ['opt me out', 'opt me out'],
    ['I want to opt out', 'opt out'],
    ['please opt-out', 'opt out'],
    ["don't text me again", "don't text"],
    ['Don’t text me', "don't text"],
    ['dont text me', 'dont text'],
    ['Do not text this number', 'do not text'],
    ['no more texts please', 'no more text'],
    ['No more messages!', 'no more message'],
    ['just leave me alone', 'leave me alone'],
    ['wrong number', 'wrong number'],
    ['Stop it', 'stop it'],
    ['please stop', 'please stop'],
  ])('%j → opt_out via %j', (body, phrase) => {
    expect(c(body)).toEqual({ eventType: 'opt_out', detectionSource: 'freeform_match', matchedKeyword: phrase })
  })

  it('never produces opt_in or help', () => {
    for (const body of ['please start texting me again', 'I need help, stop texting me']) {
      expect(['opt_out', null]).toContain(c(body).eventType)
    }
  })

  it('every listed phrase matches on its own', () => {
    for (const p of FREEFORM_OPT_OUT_PHRASES) {
      const r = c(`hey ${p} ok`)
      expect(r.eventType, p).toBe('opt_out')
    }
  })

  // Accepted over-matches — documented here so they stay visible. Suppressing
  // someone who didn't ask is recoverable (they text START); the reverse isn't.
  it.each([
    "don't stop texting me",
    'Please stop by at 3',
  ])('accepted over-match: %j → opt_out', body => {
    expect(c(body).eventType).toBe('opt_out')
  })
})
