# Artist Mix

A browser-only TypeScript app that creates a shuffled Spotify playlist from selected artists. Choose a track count per artist or a single total count, then review and reshuffle the running order before creating the playlist.

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

## GitHub Pages

The repository includes a separate static build and a GitHub Actions workflow. Its relative asset paths work with `https://username.github.io/repository/` addresses and custom domains.

1. Push the repository to GitHub with `main` as its default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run **Deploy to GitHub Pages** from the Actions tab.
4. Add the exact HTTPS address shown by Artist Mix to the Spotify app's Redirect URIs allowlist. Keep the trailing slash when the address contains a repository path.

The workflow can optionally preconfigure the public Spotify Client ID. Add a GitHub Actions repository variable named `SPOTIFY_CLIENT_ID`; no client secret is used. If omitted, visitors can enter the Client ID in the app and it stays in their browser.

For a custom domain, configure the domain in **Settings → Pages** and update its DNS records as GitHub instructs. Then replace the old Spotify redirect URI with the exact HTTPS custom-domain address.

To test the static build locally:

```sh
npm run build:github-pages
npm run preview:github-pages
```
