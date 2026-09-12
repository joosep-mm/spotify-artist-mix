# Artist Mix

A browser-only TypeScript app that creates one Spotify playlist from up to 10 Spotify-ranked track search results for each selected artist.

## Spotify setup

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Start the app and copy the redirect URL shown in its setup panel into the Spotify app's Redirect URIs allowlist.
3. Paste the app's Client ID into Artist Mix. Do not use a client secret.

The app uses Spotify's Authorization Code with PKCE flow and requests `playlist-modify-private` and `playlist-modify-public`. It uses the supported Search endpoint because Spotify removed the artist top-tracks endpoint from Development Mode in 2026. Exact stream counts are not exposed by the Web API; results keep Spotify's search ranking, with the deprecated popularity value used opportunistically only if Spotify returns it. The access token is kept in session storage, while the refresh token and Client ID are kept in local storage. Artist searches, selections, and track data are not persisted.

## Development

```sh
npm install
npm run dev
```

## Production

```sh
npm run build
```

The app has no application database or server-side state and can be hosted on JavaScript web hosting. After deployment, add the production URL shown by Artist Mix to the Spotify app's Redirect URIs allowlist.

You may alternatively set `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` at build time so visitors do not need to enter a Client ID.
