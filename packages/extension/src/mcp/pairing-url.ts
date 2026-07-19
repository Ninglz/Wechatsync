export function authenticatedWebSocketUrl(
  serverUrl: string,
  token: string | null,
): string {
  if (!token) throw new Error('MCP pairing token is required')
  const url = new URL(serverUrl)
  url.searchParams.set('token', token)
  return url.toString()
}
