export function getSessionKey(sessionId: string, apiKey: string): string {
  return `${sessionId}-${apiKey.slice(-8)}`;
}
