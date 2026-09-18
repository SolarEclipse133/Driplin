/** The Driplin brand mark: a water drop in a rounded tile + wordmark. */
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const tile =
    size === "lg" ? "h-11 w-11 text-2xl" : size === "md" ? "h-8 w-8 text-lg" : "h-7 w-7 text-base";
  const word =
    size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-base";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-sm ${tile}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-[60%] w-[60%]"
        >
          <path d="M12 2.5c3.4 4.2 7 8.2 7 12.3a7 7 0 1 1-14 0c0-4.1 3.6-8.1 7-12.3Z" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight text-slate-900 ${word}`}>
        Driplin
      </span>
    </span>
  );
}
