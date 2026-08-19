'use client';

import type { AnalysisResponse, ComparableGame } from '@/types';

interface AnalysisReportProps {
  data: AnalysisResponse;
}

function parseOwnersLabel(owners: string): string {
  // owners format: "200,000 .. 500,000"
  const parts = owners.replace(/,/g, '').split('..');
  const low = parseInt(parts[0]?.trim() ?? '0', 10) || 0;
  const high = parseInt(parts[1]?.trim() ?? '0', 10) || low;
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  };
  return `${fmt(low)} – ${fmt(high)}`;
}

function formatRegionalPrice(currency: string, value: number) {
  const amount = value / 100;
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  if (currency === 'TRY') return `₺${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency}`;
}

function RegionalPriceBadge({ label, priceData }: { label: string; priceData: any }) {
  if (!priceData) return null;
  const isDiscounted = priceData.discount_percent > 0;

  return (
    <span className="badge badge-positive" style={{ display: 'inline-flex', gap: '4px' }}>
      <strong>{label}:</strong>
      {isDiscounted ? (
        <>
          <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>
            {formatRegionalPrice(priceData.currency, priceData.initial)}
          </span>
          <span>{formatRegionalPrice(priceData.currency, priceData.final)}</span>
          <span style={{ color: 'var(--accent)', marginLeft: '2px' }}>(-{priceData.discount_percent}%)</span>
        </>
      ) : (
        <span>{formatRegionalPrice(priceData.currency, priceData.final)}</span>
      )}
    </span>
  );
}

function ReviewBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div className="score-bar-track" style={{ flex: 1 }}>
        <div
          className="score-bar-fill"
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Review score: ${score}%`}
        />
      </div>
      <span
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: '0.85rem',
          color: score >= 80 ? 'var(--secondary)' : score >= 60 ? 'var(--accent)' : '#B44',
          minWidth: '38px',
        }}
      >
        {score}%
      </span>
    </div>
  );
}

function GameCard({ game }: { game: ComparableGame }) {
  const steamUrl = `https://store.steampowered.com/app/${game.appid}`;
  const total = game.positive + game.negative;

  return (
    <div className="card fade-up" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <a
            href={steamUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '1rem',
              color: 'var(--ink)',
              textDecoration: 'none',
            }}
            id={`game-link-${game.appid}`}
          >
            {game.name}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: '6px', opacity: 0.5, verticalAlign: 'middle' }}
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '2px' }}>
            {game.developer}
            {game.publisher !== game.developer && ` · pub. ${game.publisher}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {game.isBigBudget && (
            <span className="badge badge-warning" title="AA/AAA budget — not directly comparable to indie projects">
              ⚠ AA/AAA budget
            </span>
          )}
          {game.price?.us || game.price?.tr ? (
            <>
              {game.price.us && <RegionalPriceBadge label="US" priceData={game.price.us} />}
              {game.price.tr && <RegionalPriceBadge label="TR" priceData={game.price.tr} />}
            </>
          ) : game.price_usd === 0 ? (
            <span className="badge badge-positive">Free</span>
          ) : (
            <span className="badge badge-positive">
              ${game.price_usd.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Review bar */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '4px' }}>
          Review score (SteamSpy estimate)
        </p>
        <ReviewBar score={game.reviewScore} />
        <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginTop: '4px', opacity: 0.7 }}>
          {game.positive.toLocaleString()} positive / {game.negative.toLocaleString()} negative ·{' '}
          {total.toLocaleString()} total reviews
        </p>
      </div>

      {/* Owners estimate */}
      <div
        style={{
          background: 'rgba(232,228,217,0.6)',
          borderRadius: '4px',
          padding: '10px 14px',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--secondary)', marginBottom: '2px' }}>
            Est. owners
          </p>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--ink)' }}>
            {parseOwnersLabel(game.owners)}
          </p>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--secondary)', maxWidth: '220px', lineHeight: 1.5, alignSelf: 'flex-end' }}>
          SteamSpy estimate · ±significant margin
        </p>
      </div>

      {/* Relevance */}
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, marginBottom: game.storyRelevance ? '10px' : 0 }}>
        {game.relevanceReason}
      </p>

      {/* Story relevance (if provided) */}
      {game.storyRelevance && (
        <p style={{ fontSize: '0.84rem', color: 'var(--secondary)', lineHeight: 1.6, fontStyle: 'italic', borderTop: '1px solid var(--paper-dim)', paddingTop: '10px' }}>
          Story angle: {game.storyRelevance}
        </p>
      )}

      {/* AA/AAA warning */}
      {game.isBigBudget && (
        <div
          className="disclaimer-box"
          style={{ marginTop: '12px' }}
          role="note"
          aria-label="Budget warning"
        >
          <strong>Note:</strong> This game was likely produced with a significantly larger budget than a typical indie project. A comparable level of production quality or marketing reach may not be achievable without similar resources.
        </div>
      )}
    </div>
  );
}

export default function AnalysisReport({ data }: AnalysisReportProps) {
  const { comparableGames, marketContext, riskFactors, opportunities, storyNarrative, disclaimer, meta } = data;

  return (
    <article aria-label="Analysis report">
      {/* ── Meta ── */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          marginBottom: '40px',
          padding: '16px 20px',
          background: 'var(--ink)',
          borderRadius: '6px',
          alignItems: 'center',
        }}
      >
        <div>
          <p style={{ fontSize: '0.72rem', color: 'rgba(232,228,217,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            Games in database
          </p>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--accent)', fontSize: '1.3rem' }}>
            {meta.gamesInDatabase.toLocaleString()}
          </p>
        </div>
        <div style={{ width: '1px', height: '36px', background: 'rgba(232,228,217,0.15)' }} />
        <div>
          <p style={{ fontSize: '0.72rem', color: 'rgba(232,228,217,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            Genres queried
          </p>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--paper)', fontSize: '0.9rem' }}>
            {meta.genresQueried.join(', ')}
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <p style={{ fontSize: '0.72rem', color: 'rgba(232,228,217,0.4)', textAlign: 'right' }}>
            Generated {new Date(meta.generatedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* ── Comparable games ── */}
      <section aria-labelledby="comparable-heading" style={{ marginBottom: '48px' }}>
        <h2 className="report-section-title" id="comparable-heading">
          Comparable games from Steam
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '4px', lineHeight: 1.6 }}>
          Selected by AI from a real SteamSpy dataset — only actual games on Steam, no invented titles.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '20px', lineHeight: 1.6, fontStyle: 'italic', opacity: 0.8 }}>
          *Prices fetched live from Steam. US and Turkey regions shown as reference points.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(comparableGames ?? []).map((game) => (
            <GameCard key={game.appid} game={game} />
          ))}
        </div>
      </section>

      {/* ── Market context ── */}
      <section aria-labelledby="market-heading" style={{ marginBottom: '40px' }}>
        <h2 className="report-section-title" id="market-heading">
          Market context
        </h2>
        <div className="card" style={{ borderLeft: '3px solid var(--secondary)' }}>
          <p style={{ fontSize: '1rem', lineHeight: 1.75, color: 'var(--ink)' }}>{marketContext}</p>
        </div>
      </section>

      {/* ── Risks & Opportunities ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <section aria-labelledby="risks-heading">
          <h2 className="report-section-title" id="risks-heading">Risk factors</h2>
          <div className="card">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(riskFactors ?? []).map((risk, i) => (
                <li key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>→</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="opportunities-heading">
          <h2 className="report-section-title" id="opportunities-heading">Opportunities</h2>
          <div className="card">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(opportunities ?? []).map((opp, i) => (
                <li key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--secondary)', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>◈</span>
                  <span>{opp}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ── Story narrative ── */}
      {storyNarrative && (
        <section aria-labelledby="story-heading" style={{ marginBottom: '40px' }}>
          <h2 className="report-section-title" id="story-heading">Story & theme context</h2>
          <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: 'var(--ink)', fontStyle: 'italic' }}>
              {storyNarrative}
            </p>
          </div>
        </section>
      )}

      <hr className="divider" />

      {/* ── Sources & Privacy ── */}
      <section aria-labelledby="sources-heading" style={{ marginBottom: '32px' }}>
        <h2 className="report-section-title" id="sources-heading">Sources & disclaimer</h2>
        <div className="disclaimer-box" role="note">
          <p style={{ marginBottom: '10px' }}>
            <strong>Data sources:</strong> All game data in this report was retrieved from{' '}
            <a href="https://steamspy.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--secondary)' }}>SteamSpy</a>{' '}
            and the{' '}
            <a href="https://partner.steamgames.com/doc/webapi" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--secondary)' }}>Steam Web API</a>.
            SteamSpy provides estimated ownership and playtime figures based on sampling — these numbers carry significant uncertainty and should be treated as rough indicators, not precise measurements.
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>Privacy:</strong> Your idea is not stored on our servers. It is used only during this analysis session and is not used to train any AI model.
          </p>
          <p style={{ margin: 0 }}>
            <strong>No guarantees:</strong> Bearing provides context and data — it does not predict commercial success or failure. Market conditions change. Use this as one input among many.
          </p>
        </div>
      </section>

      {/* ── Back to top ── */}
      <div style={{ textAlign: 'center', marginTop: '48px' }}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn-secondary"
          id="btn-back-to-top"
        >
          ↑ Back to top
        </button>
      </div>
    </article>
  );
}
