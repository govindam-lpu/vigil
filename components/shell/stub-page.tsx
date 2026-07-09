type StubPageProps = {
  title: string;
};

export function StubPage({ title }: StubPageProps) {
  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-10 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      </div>
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-base text-neutral-600">
          This section is coming soon. It will be built in an upcoming phase.
        </p>
      </div>
    </div>
  );
}
