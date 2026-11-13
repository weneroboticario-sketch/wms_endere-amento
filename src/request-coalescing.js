export function createScopedSingleFlight() {
  const running = new Map();
  return (scope, execute) => {
    if (running.has(scope)) return running.get(scope);
    const pending = Promise.resolve().then(execute).finally(() => { if (running.get(scope) === pending) running.delete(scope); });
    running.set(scope, pending); return pending;
  };
}
