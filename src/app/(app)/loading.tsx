export default function Loading() {
  return (
    <div className="animate-pulse space-y-8" role="status">
      <span className="sr-only">Loading page</span>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-64 max-w-full rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>
      <div className="h-48 rounded-xl border border-border bg-card" />
    </div>
  );
}
