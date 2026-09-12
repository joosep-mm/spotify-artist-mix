export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
export const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
export const SPOTIFY_SCOPES = ['playlist-modify-private', 'playlist-modify-public'];

const ACCESS_TOKEN_KEY = 'artist-mix.access-token';
const REFRESH_TOKEN_KEY = 'artist-mix.refresh-token';
const VERIFIER_KEY = 'artist-mix.pkce-verifier';
const STATE_KEY = 'artist-mix.oauth-state';

export type SpotifyImage = { url: string; height?: number | null; width?: number | null };
export type SpotifyArtist = { id: string; name: string; images: SpotifyImage[]; external_urls: { spotify?: string }; uri: string };
export type SpotifyTrack = { id: string; name: string; uri: string; artists: Array<{ id: string; name: string }>; album: { name: string; images: SpotifyImage[] }; external_urls: { spotify?: string }; popularity?: number };
export type SpotifyPlaylist = { id: string; name: string; external_urls: { spotify?: string } };
type StoredAccessToken = { accessToken: string; expiresAt: number };
type TokenResponse = { access_token: string; token_type: string; scope: string; expires_in: number; refresh_token?: string };

export class SpotifyApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'SpotifyApiError'; this.status = status; }
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function randomValue(byteLength: number) { return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength))); }
async function createCodeChallenge(verifier: string) { return base64UrlEncode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }
export function redirectUri() { return `${window.location.origin}${window.location.pathname}`; }

export async function beginAuthorization(clientId: string) {
  const verifier = randomValue(64);
  const state = randomValue(24);
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL('/authorize', SPOTIFY_ACCOUNTS_BASE);
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SPOTIFY_SCOPES.join(' '), code_challenge_method: 'S256', code_challenge: challenge, state }).toString();
  window.location.assign(url.toString());
}

function storeToken(response: TokenResponse) {
  const token: StoredAccessToken = { accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
  sessionStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(token));
  if (response.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
  return token.accessToken;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json() as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok) throw new SpotifyApiError(payload.error_description || payload.error || 'Spotify authorization failed.', response.status);
  return storeToken(payload);
}

export async function finishAuthorization(clientId: string, code: string, returnedState: string | null) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  if (!verifier || !returnedState || returnedState !== expectedState) throw new Error('The Spotify sign-in response could not be verified. Please try connecting again.');
  try { return await tokenRequest(new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier })); }
  finally { sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY); }
}

async function refreshAccessToken(clientId: string) {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  try { return await tokenRequest(new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken })); }
  catch { clearAuthorization(); return null; }
}

export async function getAccessToken(clientId: string) {
  const stored = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (stored) {
    try { const token = JSON.parse(stored) as StoredAccessToken; if (token.accessToken && token.expiresAt > Date.now() + 60_000) return token.accessToken; }
    catch { sessionStorage.removeItem(ACCESS_TOKEN_KEY); }
  }
  return refreshAccessToken(clientId);
}

export function hasRefreshToken() { return Boolean(localStorage.getItem(REFRESH_TOKEN_KEY)); }
export function clearAuthorization() { sessionStorage.removeItem(ACCESS_TOKEN_KEY); sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY); localStorage.removeItem(REFRESH_TOKEN_KEY); }

function wait(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }

async function spotifyFetch<T>(clientId: string, path: string, init?: RequestInit, authRetry = true, rateAttempt = 0): Promise<T> {
  const accessToken = await getAccessToken(clientId);
  if (!accessToken) throw new SpotifyApiError('Connect your Spotify account to continue.', 401);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && authRetry) { sessionStorage.removeItem(ACCESS_TOKEN_KEY); return spotifyFetch<T>(clientId, path, init, false, rateAttempt); }
  if (response.status === 429 && rateAttempt < 3) {
    const retryAfterSeconds = Number(response.headers.get('Retry-After'));
    const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1000
      : (2 ** rateAttempt) * 1000 + Math.floor(Math.random() * 250);
    await wait(delay);
    return spotifyFetch<T>(clientId, path, init, authRetry, rateAttempt + 1);
  }
  if (!response.ok) {
    let message = `Spotify request failed (${response.status}).`;
    try { const payload = await response.json() as { error?: { message?: string } | string }; if (typeof payload.error === 'string') message = payload.error; else if (payload.error?.message) message = payload.error.message; }
    catch { /* Keep the HTTP fallback. */ }
    throw new SpotifyApiError(message, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function searchArtists(clientId: string, query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, type: 'artist', limit: '8' });
  const response = await spotifyFetch<{ artists: { items: SpotifyArtist[] } }>(clientId, `/search?${params}`, { signal });
  return response.artists.items;
}

export async function searchArtistTracks(clientId: string, artist: SpotifyArtist) {
  const safeName = artist.name.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  const params = new URLSearchParams({ q: `artist:"${safeName}"`, type: 'track', limit: '10' });
  const response = await spotifyFetch<{ tracks: { items: SpotifyTrack[] } }>(clientId, `/search?${params}`);
  return response.tracks.items
    .filter((track) => track.artists.some((trackArtist) => trackArtist.id === artist.id))
    .sort((first, second) => (second.popularity ?? -1) - (first.popularity ?? -1))
    .slice(0, 10);
}

export function createPlaylist(clientId: string, name: string, description: string) {
  return spotifyFetch<SpotifyPlaylist>(clientId, '/me/playlists', { method: 'POST', body: JSON.stringify({ name, description, public: false }) });
}

export async function addPlaylistItems(clientId: string, playlistId: string, uris: string[]) {
  for (let index = 0; index < uris.length; index += 100) {
    await spotifyFetch<{ snapshot_id: string }>(clientId, `/playlists/${encodeURIComponent(playlistId)}/items`, { method: 'POST', body: JSON.stringify({ uris: uris.slice(index, index + 100) }) });
  }
}
