export function nextRealtimeRetryDelay(failureCount) {
  const steps = [2000, 5000, 15000, 30000];
  const index = Math.max(0, Math.min(steps.length - 1, Number(failureCount || 1) - 1));
  return steps[index];
}
