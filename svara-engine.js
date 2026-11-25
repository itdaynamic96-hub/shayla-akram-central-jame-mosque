export function createSvaraEngine(onMessage) {
  const worker = new Worker(new URL("./svara-worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", event => onMessage?.(event.data));
  worker.addEventListener("error", event => {
    onMessage?.({ status: "fatal-error", data: event.message || "Svāra worker failed to start." });
  });
  return {
    postMessage(message) { worker.postMessage(message); },
    terminate() { worker.terminate(); }
  };
}
