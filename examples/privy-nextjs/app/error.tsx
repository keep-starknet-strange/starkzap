'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-bold text-red-400">Something went wrong!</h1>
      <p className="text-gray-400">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-starknet-primary rounded hover:bg-starknet-light transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
