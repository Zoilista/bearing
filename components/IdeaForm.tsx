'use client';

import { useState, useCallback } from 'react';
import { GENRES, PLATFORMS } from '@/types';
import type { AnalyzeFormData } from '@/types';

interface IdeaFormProps {
  onSubmit: (data: AnalyzeFormData) => void;
  isLoading: boolean;
}

export default function IdeaForm({ onSubmit, isLoading }: IdeaFormProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [mechanics, setMechanics] = useState('');
  const [story, setStory] = useState('');
  const [platform, setPlatform] = useState('steam');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleGenre = useCallback((value: string) => {
    setSelectedGenres((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (selectedGenres.length === 0) newErrors.genres = 'Please select at least one genre.';
    if (!mechanics.trim() || mechanics.trim().length < 10)
      newErrors.mechanics = 'Please describe your core mechanics (at least 10 characters).';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ genres: selectedGenres, mechanics: mechanics.trim(), story: story.trim() || undefined, platform });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ── Genre selection ── */}
      <div style={{ marginBottom: '32px' }}>
        <label className="form-label">Genre(s)</label>
        <p className="form-hint">Select all that describe your game. Multiple selections are encouraged.</p>
        <div className="genre-grid" role="group" aria-label="Genre selection">
          {GENRES.map((g) => (
            <button
              key={g.value}
              type="button"
              role="checkbox"
              aria-checked={selectedGenres.includes(g.value)}
              className={`genre-chip ${selectedGenres.includes(g.value) ? 'selected' : ''}`}
              onClick={() => toggleGenre(g.value)}
              id={`genre-${g.value}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {errors.genres && (
          <p style={{ color: '#B44', fontSize: '0.85rem', marginTop: '8px' }} role="alert">
            {errors.genres}
          </p>
        )}
      </div>

      {/* ── Core mechanics ── */}
      <div style={{ marginBottom: '24px' }}>
        <label htmlFor="mechanics" className="form-label">Core mechanics</label>
        <p className="form-hint">What does the player actually do? Keep it concise.</p>
        <textarea
          id="mechanics"
          className="form-textarea"
          rows={3}
          placeholder="e.g. Turn-based combat with a card-drawing system — each run generates a new deck from a shared pool. Players build synergies across 15–20 encounters."
          value={mechanics}
          onChange={(e) => setMechanics(e.target.value)}
          aria-describedby="mechanics-hint"
          aria-invalid={!!errors.mechanics}
        />
        {errors.mechanics && (
          <p style={{ color: '#B44', fontSize: '0.85rem', marginTop: '6px' }} role="alert">
            {errors.mechanics}
          </p>
        )}
      </div>

      {/* ── Story / concept ── */}
      <div style={{ marginBottom: '24px' }}>
        <label htmlFor="story" className="form-label">
          Story / concept
          <span
            style={{
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 0,
              fontSize: '0.75rem',
              color: 'var(--secondary)',
              marginLeft: '8px',
            }}
          >
            optional — but helps a lot
          </span>
        </label>
        <p className="form-hint">
          Describe the setting, tone, or narrative hook. Bearing will compare this to actual
          game descriptions from Steam.
        </p>
        <textarea
          id="story"
          className="form-textarea"
          rows={5}
          placeholder="e.g. A cursed cartographer trapped in an ever-shifting labyrinthine city. Dark, melancholic tone with occasional moments of deadpan humor. Think Kafka meets Disco Elysium."
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
      </div>

      {/* ── Target platform ── */}
      <div style={{ marginBottom: '40px' }}>
        <label htmlFor="platform" className="form-label">Target platform</label>
        <select
          id="platform"
          className="form-input"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{ cursor: 'pointer' }}
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Submit ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={isLoading}
          id="submit-analyze"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Fetching market data…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Analyze this idea
            </>
          )}
        </button>

        {isLoading && (
          <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', margin: 0 }}>
            Querying SteamSpy &amp; Steam API…
          </p>
        )}
      </div>

      <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--secondary)', opacity: 0.75 }}>
        Your idea is never stored. Data is sourced from SteamSpy and Steam Web API.
      </p>
    </form>
  );
}
