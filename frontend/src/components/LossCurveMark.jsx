// The signature motif: a descending, converging loss curve reaching a verified floor,
// plotted on a faint grid. Used as the logo mark and the hero instrument panel.

export function LossCurveMark({ size = 28, animate = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="3" stroke="var(--border)" />
      <path d="M5 6 L5 26 L27 26" stroke="var(--dim)" strokeWidth="1" />
      <path
        d="M5 8 C9 9, 10 20, 14 22 C18 24, 20 24.5, 27 24.8"
        stroke="var(--signal)"
        strokeWidth="1.6"
        strokeLinecap="round"
        style={
          animate
            ? { strokeDasharray: 60, strokeDashoffset: 60, animation: "draw 900ms var(--ease) forwards" }
            : undefined
        }
      />
      <circle cx="27" cy="24.8" r="1.8" fill="var(--signal)" />
      <style>{`@keyframes draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

export function LossCurvePlot() {
  // Larger hero instrument: converging loss trace on graph paper with a verified floor.
  return (
    <svg viewBox="0 0 320 180" width="100%" role="img" aria-label="Converging loss curve">
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`h${i}`} x1="28" x2="308" y1={20 + i * 32} y2={20 + i * 32} stroke="var(--grid)" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={`v${i}`} x1={28 + i * 40} x2={28 + i * 40} y1="20" y2="148" stroke="var(--grid)" />
      ))}
      <line x1="28" y1="148" x2="308" y2="148" stroke="var(--dim)" />
      <line x1="28" y1="20" x2="28" y2="148" stroke="var(--dim)" />
      <path
        d="M28 34 C70 40, 78 118, 130 128 C185 138, 220 142, 308 143 L308 148 L28 148 Z"
        fill="url(#fill)"
      />
      <path
        d="M28 34 C70 40, 78 118, 130 128 C185 138, 220 142, 308 143"
        stroke="var(--signal)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        style={{ strokeDasharray: 420, strokeDashoffset: 420, animation: "draw 1100ms var(--ease) 120ms forwards" }}
      />
      <circle cx="308" cy="143" r="3" fill="var(--signal)" />
      <style>{`@keyframes draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}
