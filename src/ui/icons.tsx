type P = { className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

export const Plus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M12 5v14M5 12h14" /></svg>
);
export const Settings = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
export const Trash2 = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);
export const Pin = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3z" />
  </svg>
);
export const PinOff = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M3 3l18 18M9 3h6l-1 6 4 3v2h-7M6 14v-2l3-2.2" />
  </svg>
);
export const Send = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
export const StopCircle = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="12" cy="12" r="10" />
    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
  </svg>
);
export const Paperclip = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5" />
  </svg>
);
export const X = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Check = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Brain = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0" />
  </svg>
);
export const Eye = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const EyeOff = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M3 3l18 18M10.6 10.6a3 3 0 1 0 3.8 3.8M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.7 13.7 0 0 1-2.4 3.2M6.6 6.6A13.6 13.6 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.5-1" />
  </svg>
);
