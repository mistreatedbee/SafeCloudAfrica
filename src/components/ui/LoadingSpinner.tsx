type Props = {
  /** Pixel width and height. When omitted, defaults to `w-4 h-4` unless `className` sets size. */
  size?: number;
  className?: string;
};

export function LoadingSpinner({ size, className }: Props) {
  const base =
    'inline-block shrink-0 rounded-full border-2 border-white/40 border-t-white animate-spin';
  const mergedClass =
    size != null ? [base, className].filter(Boolean).join(' ') : [base, className ?? 'w-4 h-4'].filter(Boolean).join(' ');

  return (
    <span
      style={size != null ? { width: size, height: size } : undefined}
      className={mergedClass}
      aria-hidden="true"
    />
  );
}

