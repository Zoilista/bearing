import Link from 'next/link';

function CompassIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="30" stroke="#C4A77D" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" stroke="#4A6B7C" strokeWidth="1" strokeDasharray="3 3" />
      {/* Compass cardinal marks */}
      <line x1="32" y1="4" x2="32" y2="10" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="54" x2="32" y2="60" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="32" x2="10" y2="32" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="54" y1="32" x2="60" y2="32" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" />
      {/* Needle — animated via CSS */}
      <g className="compass-needle">
        <polygon points="32,14 35,32 32,36 29,32" fill="#1A2F3A" />
        <polygon points="32,50 35,32 32,36 29,32" fill="#C4A77D" opacity="0.6" />
      </g>
      <circle cx="32" cy="32" r="3" fill="#1A2F3A" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ── */}
      <section className="hero-section" aria-labelledby="hero-heading">
        <div className="hero-grid" aria-hidden="true" />

        <div style={{ maxWidth: '720px', position: 'relative', zIndex: 1 }}>
          {/* Logo mark */}
          <div style={{ marginBottom: '40px' }}>
            <CompassIcon />
          </div>

          {/* Wordmark */}
          <p
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              marginBottom: '16px',
            }}
          >
            Bearing
          </p>

          <h1
            id="hero-heading"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(2.4rem, 6vw, 4.5rem)',
              fontWeight: 800,
              color: 'var(--ink)',
              lineHeight: 1.08,
              marginBottom: '28px',
            }}
          >
            Doesn't tell you
            <br />
            where to land.
          </h1>

          <p
            style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
              color: 'var(--secondary)',
              maxWidth: '520px',
              marginBottom: '16px',
              lineHeight: 1.6,
            }}
          >
            It helps you find your direction.
          </p>

          <p
            style={{
              fontSize: '1rem',
              color: 'var(--secondary)',
              maxWidth: '560px',
              marginBottom: '48px',
              lineHeight: 1.7,
              opacity: 0.85,
            }}
          >
            Bearing pulls real data from Steam to show you what&apos;s out there — similar
            games, market context, risks, and opportunities. No hype. No guarantees.
            Just honest context to help you navigate.
          </p>

          <Link href="/analyze" className="btn-primary" id="cta-check-idea">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Check your idea
          </Link>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        className="how-section"
        aria-labelledby="how-heading"
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
        }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <p className="report-section-title" style={{ color: 'var(--accent)' }} id="how-heading">
            How it works
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '40px',
              marginTop: '16px',
            }}
          >
            {[
              {
                num: '01',
                title: 'Describe your idea',
                body: 'Pick your genres, describe your core mechanics, and optionally sketch your story or setting.',
              },
              {
                num: '02',
                title: 'We fetch real data',
                body: 'Bearing pulls actual game data from SteamSpy and the Steam Store — no hallucinated titles.',
              },
              {
                num: '03',
                title: 'Get honest context',
                body: "You see comparable games, market risks, and opportunities — with uncertainty noted where it exists.",
              },
            ].map((step) => (
              <div key={step.num}>
                <p
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: 'var(--accent)',
                    marginBottom: '12px',
                    opacity: 0.5,
                  }}
                >
                  {step.num}
                </p>
                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--paper)',
                    marginBottom: '10px',
                  }}
                >
                  {step.title}
                </h2>
                <p style={{ color: 'rgba(232,228,217,0.7)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '56px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/analyze" className="btn-primary" id="cta-how-it-works">
              Try it now
            </Link>
            <p style={{ fontSize: '0.85rem', color: 'rgba(232,228,217,0.45)', margin: 0 }}>
              No account required. Your idea is never stored.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="page-footer"
        style={{
          background: 'var(--paper)',
          borderTop: '1px solid var(--paper-dim)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            color: 'var(--ink)',
            fontSize: '0.9rem',
          }}
        >
          Bearing
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', margin: 0 }}>
          Data from SteamSpy &amp; Steam Web API. Estimates only — not financial advice.
        </p>
      </footer>
    </main>
  );
}
