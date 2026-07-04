type LoadErrorProps = {
  message: string;
  onRetry?: () => void;
};

// Shared inline load-failure banner. DESIGN.md forbids silent failure: fetch
// errors on list/dashboard loads surface here instead of falling through to an
// empty state. Tokens: red-400 border, red-50 background, red-600 text.
export function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <div role="alert" className="rounded-lg border border-red-400 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-600">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-semibold text-red-600 underline hover:no-underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
