'use client';

export default function LandingPage() {
  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-bold text-xl">PitchFire</span>
          <span className="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded-full">AI</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="/dashboard" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors">
            Launch App
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-block bg-blue-950 border border-blue-800 text-blue-300 text-xs px-3 py-1 rounded-full mb-6">
          Designing for AI Failure — confidence gates · approval gates · DLQ recovery
        </div>
        <h1 className="text-5xl font-bold text-white leading-tight mb-6">
          Your job search,<br />
          <span className="text-blue-400">fully automated.</span>
        </h1>
        <p className="text-gray-400 text-xl max-w-2xl mx-auto mb-10">
          Upload your resume once. PitchFire discovers matched jobs, tailors every application,
          submits autonomously, tracks replies, and books your interviews.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/dashboard" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
            Start for Free
          </a>
          <a href="#pricing" className="border border-gray-700 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-lg font-semibold transition-colors">
            See Pricing
          </a>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-8 mt-20 max-w-2xl mx-auto">
          {[
            { value: '83%', label: 'Latency reduction (12s → 2s per job match)' },
            { value: '99.9%', label: 'Uptime via DLQ + confidence gates' },
            { value: '10+', label: 'Job boards scraped continuously' },
          ].map(m => (
            <div key={m.label} className="text-center">
              <div className="text-3xl font-bold text-blue-400">{m.value}</div>
              <div className="text-gray-500 text-xs mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            A platform, not a wrapper
          </h2>
          <p className="text-gray-400 text-center mb-14 max-w-2xl mx-auto">
            Each agent owns a domain, communicates via BullMQ, and plugs into your stack.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-white text-center mb-4">
          Profitable from user #2
        </h2>
        <p className="text-gray-400 text-center mb-14">
          Break-even: 2 Pro subscribers ($58/mo) &gt; $50/mo infra.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(p => (
            <div
              key={p.name}
              className={`rounded-xl p-6 border ${
                p.highlighted
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              {p.highlighted && (
                <div className="text-xs text-blue-400 font-semibold mb-2 uppercase tracking-wide">
                  Most Popular
                </div>
              )}
              <h3 className="text-white font-bold text-lg mb-1">{p.name}</h3>
              <div className="text-3xl font-bold text-white mb-1">
                {p.price}
                <span className="text-gray-500 text-base font-normal">/mo</span>
              </div>
              <p className="text-gray-400 text-sm mb-6">{p.tagline}</p>
              <ul className="space-y-2 mb-8">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={p.cta.href}
                className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  p.highlighted
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'border border-gray-600 hover:border-gray-400 text-gray-300'
                }`}
              >
                {p.cta.label}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Case Study CTA */}
      <section className="bg-gray-900 border-t border-gray-800 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Designing for AI Failure
          </h2>
          <p className="text-gray-400 mb-6">
            Every autonomous action has a fallback. Confidence &lt; 0.8 → user flag.
            Every application reviewed before submit. DLQ replay on 3rd failure.
            Read the full reasoning behind the architecture.
          </p>
          <a href="/docs/rnd" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
            Read the R&amp;D case study →
          </a>
        </div>
      </section>

      <footer className="border-t border-gray-800 py-8 text-center text-gray-600 text-sm">
        Built by{' '}
        <a href="https://github.com/JawadulHadi" className="text-gray-400 hover:text-white transition-colors">
          Jawad Ul Hadi
        </a>{' '}
        · Backend Lead / AI Systems Architect · MIT License
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: '🔍',
    title: 'Continuous Job Discovery',
    desc: '10+ boards scraped with Playwright stealth. RemoteOK, Wellfound, Greenhouse, Lever, Workday — fresh every cycle.',
  },
  {
    icon: '🎯',
    title: 'Semantic Match Scoring',
    desc: 'voyage-3-lite 1024-dim pgvector cosine similarity. Your resume embedded once; every new job scored in <50ms.',
  },
  {
    icon: '✍️',
    title: 'AI Resume Tailoring',
    desc: 'Claude Sonnet 4.6 generates a targeted variant per application. Score-gated critique loop exits when quality ≥ 0.8.',
  },
  {
    icon: '🤖',
    title: 'Autonomous Apply',
    desc: 'Playwright headless form-fill with ATS-specific playbooks. Every application gated by your approval before submit.',
  },
  {
    icon: '📬',
    title: 'Inbox Intelligence',
    desc: 'Gmail tool-use loop classifies every reply: interview invite, rejection, offer, followup. Auto-updates pipeline.',
  },
  {
    icon: '📅',
    title: 'Interview Booking',
    desc: 'Confidence gate: < 0.8 → flag for user. Google Calendar event + Sonnet-generated personalised prep notes.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    tagline: 'Try the full pipeline',
    highlighted: false,
    features: [
      '10 applications / month',
      '3 job boards',
      'AI resume scoring',
      'Manual apply',
    ],
    cta: { label: 'Get Started', href: '/dashboard' },
  },
  {
    name: 'Pro',
    price: '$29',
    tagline: 'Unlimited autonomous apply',
    highlighted: true,
    features: [
      'Unlimited applications',
      '15+ job boards',
      'AI resume tailoring',
      'Autonomous apply',
      'Inbox intelligence',
      'Interview prep notes',
      'Analytics dashboard',
    ],
    cta: { label: 'Upgrade to Pro', href: '/billing?plan=pro' },
  },
  {
    name: 'Agency',
    price: '$99',
    tagline: 'Manage 10 candidate profiles',
    highlighted: false,
    features: [
      'Everything in Pro',
      '10 candidate profiles',
      'Bulk apply dashboard',
      'White-label ready',
      'Agency analytics',
    ],
    cta: { label: 'Contact Sales', href: 'mailto:hello@pitchfire.io' },
  },
];
