export default function Loading() {
  return (
    <div className="flex items-center gap-3 p-2 text-sm text-gray-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#00C9A7]" />
      Loading…
    </div>
  );
}
