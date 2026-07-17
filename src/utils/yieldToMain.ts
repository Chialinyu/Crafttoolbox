/**
 * Cooperative scheduling helpers — keep the UI responsive during long
 * CPU work without moving the full Potrace pipeline into a Worker yet.
 */

/** Yield to the browser event loop (prefer MessageChannel over setTimeout). */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(null);
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Yield when the browser is idle, falling back to yieldToMain.
 * `timeout` ensures we resume even under sustained load.
 */
export function yieldWhenIdle(timeoutMs = 32): Promise<void> {
  return new Promise((resolve) => {
    const ric = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : null;

    if (ric) {
      ric(() => resolve(), { timeout: timeoutMs });
      return;
    }

    void yieldToMain().then(resolve);
  });
}
