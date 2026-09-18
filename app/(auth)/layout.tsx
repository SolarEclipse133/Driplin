import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-sky-100 via-slate-50 to-slate-50 px-4 py-12">
      {/* soft decorative glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-sky-200/40 blur-3xl"
      />
      <div className="relative mb-8 flex flex-col items-center text-center">
        <Logo size="lg" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Drought compliance for Central Texas properties
        </p>
      </div>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-sky-900/5 sm:p-8">
        {children}
      </div>
      <p className="relative mt-6 text-xs text-slate-400">
        Automatic watering-schedule compliance · Austin Water &amp; LCRA aware
      </p>
    </main>
  );
}
