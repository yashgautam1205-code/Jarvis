export default function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      {/* Grid */}
      <div className="absolute inset-0 grid-bg opacity-60" />
      {/* Vignette */}
      <div className="absolute inset-0 vignette" />
      {/* Scan line */}
      <div className="scan-line" />
    </div>
  );
}

