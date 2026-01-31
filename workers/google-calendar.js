// Google Calendar Integration for Nova Portal
// ============================================

const GOOGLE_CLIENT_ID = '15763323792-s8r3eup5frd3t5jfe5st0cpbo1j106mn.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://api.beric.ca/oauth/callback';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

// Generate OAuth URL
export function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Exchange code for tokens
export async function exchangeCodeForTokens(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    })
  });
  return response.json();
}

// Refresh access token
export async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  return response.json();
}

// Fetch calendar events
export async function fetchCalendarEvents(accessToken, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50'
  });
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status}`);
  }
  
  return response.json();
}

// Get valid access token (refresh if needed)
export async function getValidAccessToken(env) {
  if (!env.NOVA_KV) return null;
  
  const tokens = await env.NOVA_KV.get('google-tokens', 'json');
  if (!tokens) return null;
  
  // Check if token is expired (with 5 min buffer)
  if (tokens.expires_at && Date.now() > tokens.expires_at - 300000) {
    // Refresh the token
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    if (newTokens.access_token) {
      const updated = {
        ...tokens,
        access_token: newTokens.access_token,
        expires_at: Date.now() + (newTokens.expires_in * 1000)
      };
      await env.NOVA_KV.put('google-tokens', JSON.stringify(updated));
      return updated.access_token;
    }
    return null;
  }
  
  return tokens.access_token;
}
