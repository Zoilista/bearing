'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import IdeaForm from '@/components/IdeaForm';
import AnalysisReport from '@/components/AnalysisReport';
import type { AnalyzeFormData, AnalysisResponse } from '@/types';

function LoadingIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Step 0: "Querying SteamSpy for comparable games..." (0s - 4s)
    // Step 1: "Enriching with Steam tag data..." (4s - 8s)
    // Step 2: "Running market analysis..." (8s+)
    const timer1 = setTimeout(() => setStep(1), 4000);
    const timer2 = setTimeout(() => setStep(2), 8000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const messages = [
    'Querying SteamSpy for comparable games...',
    'Enriching with Steam tag data...',
    'Running market analysis...'
  ];

  return (
    <div
      style={{
        marginTop: '48px',
        padding: '40px 24px',
        background: 'var(--ink)',
        borderRadius: '12px',
        color: 'var(--paper)',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(26, 47, 58, 0.15)',
      }}
      role="status"
      aria-live="polite"
      aria-label="Analysis in progress"
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="32" cy="32" r="30" stroke="#C4A77D" strokeWidth="2" opacity="0.4" />
          <circle cx="32" cy="32" r="22" stroke="#4A6B7C" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          <line x1="32" y1="4" x2="32" y2="10" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <line x1="32" y1="54" x2="32" y2="60" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="4" y1="32" x2="10" y2="32" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="54" y1="32" x2="60" y2="32" stroke="#4A6B7C" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <g className="compass-needle">
            <polygon points="32,14 35,32 32,36 29,32" fill="white" />
            <polygon points="32,50 35,32 32,36 29,32" fill="#C4A77D" opacity="0.8" />
          </g>
          <circle cx="32" cy="32" r="4" fill="white" />
        </svg>
      </div>
      <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.25rem', marginBottom: '12px', color: 'white' }}>
        Finding your bearing…
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        {messages.map((msg, idx) => (
          <p
            key={idx}
            style={{
              fontSize: '0.9rem',
              margin: 0,
              color: step === idx ? 'var(--accent)' : 'var(--paper)',
              opacity: step === idx ? 1 : step > idx ? 0.4 : 0.2,
              transition: 'all 0.4s ease',
              transform: step === idx ? 'scale(1.02)' : 'scale(1)',
              fontWeight: step === idx ? 600 : 400,
            }}
          >
            {step > idx ? '✓ ' : step === idx ? '→ ' : ''}{msg}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: AnalyzeFormData) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(
            `Too many requests. Please wait ${json.resetInSeconds ?? 60} seconds before trying again.`
          );
        } else {
          setError(json.error ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      setResult(json as AnalysisResponse);

      // Smooth scroll to results
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Nav ── */}
      <nav
        className="page-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--paper-dim)',
          position: 'sticky',
          top: 0,
          background: 'rgba(232, 228, 217, 0.92)',
          backdropFilter: 'blur(12px)',
          zIndex: 100,
        }}
        aria-label="Site navigation"
      >
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: '1.1rem',
            color: 'var(--ink)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          id="nav-home-link"
        >
          <svg width="18" height="18" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="32" cy="32" r="30" stroke="#C4A77D" strokeWidth="3" />
            <polygon points="32,14 35,32 32,36 29,32" fill="#1A2F3A" />
            <polygon points="32,50 35,32 32,36 29,32" fill="#C4A77D" opacity="0.6" />
            <circle cx="32" cy="32" r="3" fill="#1A2F3A" />
          </svg>
          Bearing
        </Link>

        {result && (
          <button
            onClick={handleReset}
            className="btn-secondary"
            style={{ padding: '8px 20px', fontSize: '0.875rem' }}
            id="btn-new-analysis"
          >
            New analysis
          </button>
        )}
      </nav>

      {/* ── Main ── */}
      <main style={{ flex: 1 }}>
        {/* Form section */}
        <section
          className="content-section"
          aria-labelledby="form-heading"
          style={{
            maxWidth: '720px',
            margin: '0 auto',
          }}
        >
          <div style={{ marginBottom: '40px' }}>
            <p
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                marginBottom: '12px',
              }}
            >
              Idea validation
            </p>
            <h1
              id="form-heading"
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                fontWeight: 800,
                color: 'var(--ink)',
                marginBottom: '12px',
              }}
            >
              Tell us about your game
            </h1>
            <p style={{ color: 'var(--secondary)', lineHeight: 1.7, maxWidth: '540px' }}>
              We&apos;ll query SteamSpy and Steam&apos;s API for real comparable games, then use AI
              to find the closest matches — based only on that real data, never invented titles.
            </p>
          </div>

          {!result && <IdeaForm onSubmit={handleSubmit} isLoading={isLoading} />}

          {/* Loading pseudo-progress */}
          {isLoading && <LoadingIndicator />}

          {/* Error state */}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: '32px',
                padding: '20px 24px',
                background: '#FFF3F3',
                border: '1px solid #FCC',
                borderLeft: '3px solid #B44',
                borderRadius: '4px',
              }}
            >
              <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#B44', marginBottom: '6px' }}>
                Something went wrong
              </p>
              <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>{error}</p>
            </div>
          )}
        </section>

        {/* Results section */}
        {result && (
          <section
            className="content-section"
            id="results-section"
            aria-labelledby="results-heading"
            style={{
              maxWidth: '840px',
              margin: '0 auto',
            }}
          >
            <div style={{ marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--paper-dim)' }}>
              <p
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  marginBottom: '8px',
                }}
              >
                Analysis complete
              </p>
              <h2
                id="results-heading"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
                  fontWeight: 800,
                  color: 'var(--ink)',
                }}
              >
                Your market context
              </h2>
            </div>

            <AnalysisReport data={result} />

            <div style={{ marginTop: '40px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={handleReset} className="btn-primary" id="btn-try-another">
                Try another idea
              </button>
            </div>
          </section>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        className="page-footer"
        style={{
          borderTop: '1px solid var(--paper-dim)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            color: 'var(--ink)',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          Bearing
        </Link>
        <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', margin: 0 }}>
          Data from SteamSpy & Steam Web API · Estimates only
        </p>
      </footer>
    </div>
  );
}
