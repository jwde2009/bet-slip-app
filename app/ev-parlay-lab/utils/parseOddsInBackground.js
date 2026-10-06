// Keep the worker construction literal so webpack can bundle its dependencies.
// A timeout/error never retries parsing on the UI thread.
export function parseOddsInBackground(text, context, {
  makeWorker = () => new Worker(new URL("../workers/parseOdds.worker.js", import.meta.url)),
  timeoutMs = 30000,
} = {}) {
  let worker;
  let timer;
  let settled = false;
  let rejectTask;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker?.terminate();
    callback(value);
  };
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    try {
      worker = makeWorker();
      worker.onmessage = event => {
        const result = event.data;
        if (result?.error) finish(reject, new Error(result.error));
        else if (Array.isArray(result?.rows)) finish(resolve, result.rows);
        else finish(reject, new Error("Invalid parser response."));
      };
      worker.onerror = () => finish(reject, new Error("Background parser could not start. Refresh the app and try again."));
      worker.onmessageerror = () => finish(reject, new Error("Background parser response could not be read."));
      timer = setTimeout(() => finish(reject, new Error("Parsing took too long and was stopped. Download TXT and attach the capture for review.")), timeoutMs);
      worker.postMessage({ text, context });
    } catch (error) {
      finish(reject, error);
    }
  });
  return { promise, cancel() {
    const error = new Error("Parsing canceled.");
    error.name = "AbortError";
    finish(rejectTask, error);
  } };
}
