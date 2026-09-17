export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-sky-700">
          Driplin
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Drought compliance for Central Texas properties
        </p>
      </div>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
