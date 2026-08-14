export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "brand-mark brand-mark--small" : "brand-mark"} aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img">
        <path d="M10.1 9.2 5.7 16l4.4 6.8M21.9 9.2l4.4 6.8-4.4 6.8M13.2 24.3l5.6-16.6" />
      </svg>
    </span>
  );
}
