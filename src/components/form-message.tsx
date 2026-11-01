export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) {
    return <p role="alert" className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>;
  }
  if (success) {
    return <p role="status" className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-sm text-ok">{success}</p>;
  }
  return null;
}
