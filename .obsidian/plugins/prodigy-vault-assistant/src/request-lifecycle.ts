export class RequestCancelledError extends Error {
  constructor() {
    super("Request cancelled locally");
  }
}

/** Detach local work even when an external port ignores cancellation. */
export async function abortable<Value>(
  signal: AbortSignal,
  work: () => Promise<Value>,
): Promise<Value> {
  if (signal.aborted) throw new RequestCancelledError();
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new RequestCancelledError());
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    // The promise executor captures synchronous throws without deferring input capture.
    return await Promise.race([
      new Promise<Value>((resolve) => {
        if (signal.aborted) throw new RequestCancelledError();
        resolve(work());
      }),
      cancelled,
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
