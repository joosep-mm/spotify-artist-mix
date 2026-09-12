'use client';

import Image from 'next/image';
import { SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Copy, Headphones, LoaderCircle, LogOut, Music2, Search, Settings2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addPlaylistItems, beginAuthorization, clearAuthorization, createPlaylist, finishAuthorization, getAccessToken, getArtistTopTracks, hasRefreshToken, redirectUri, searchArtists, SpotifyApiError, SpotifyArtist, SpotifyPlaylist } from '@/lib/spotify';

const CLIENT_ID_KEY = 'artist-mix.spotify-client-id';
const MAX_ARTISTS = 20;
type AuthStatus = 'checking' | 'disconnected' | 'connected';
type GenerationState = 'idle' | 'collecting' | 'creating' | 'adding' | 'success';

function artistImage(artist: SpotifyArtist) { return artist.images?.[artist.images.length > 1 ? 1 : 0]?.url; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); }
function friendlyError(error: unknown) {
  if (error instanceof SpotifyApiError) {
    if (error.status === 401) return 'Your Spotify session expired. Connect again to continue.';
    if (error.status === 403) return 'Spotify did not allow that action. Check that your account has access to this app and reconnect.';
    if (error.status === 429) return 'Spotify is receiving too many requests. Wait a moment, then try again.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something unexpected happened. Please try again.';
}

export default function Home() {
  const [clientId, setClientId] = useState('');
  const [draftClientId, setDraftClientId] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [showSetup, setShowSetup] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [selected, setSelected] = useState<SpotifyArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [generation, setGeneration] = useState<GenerationState>('idle');
  const [playlist, setPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [trackCount, setTrackCount] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isGenerating = ['collecting', 'creating', 'adding'].includes(generation);
  const selectedIds = useMemo(() => new Set(selected.map((artist) => artist.id)), [selected]);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      await Promise.resolve();
      if (!active) return;
      const storedClientId = localStorage.getItem(CLIENT_ID_KEY) || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
      setClientId(storedClientId);
      setDraftClientId(storedClientId);
      setShowSetup(!storedClientId);
      if (!storedClientId) { setAuthStatus('disconnected'); return; }
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error');
      try {
        if (oauthError) throw new Error(oauthError === 'access_denied' ? 'Spotify connection was cancelled.' : `Spotify authorization failed: ${oauthError}`);
        if (code) await finishAuthorization(storedClientId, code, params.get('state'));
        setAuthStatus(await getAccessToken(storedClientId) ? 'connected' : 'disconnected');
      } catch (caught) { setError(friendlyError(caught)); setAuthStatus('disconnected'); }
      finally { if (code || oauthError) window.history.replaceState({}, '', window.location.pathname + window.location.hash); }
    }
    void restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    if (authStatus !== 'connected' || query.trim().length < 2) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try { setResults((await searchArtists(clientId, query.trim(), controller.signal)).filter((artist) => !selectedIds.has(artist.id))); }
      catch (caught) { if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(friendlyError(caught)); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authStatus, clientId, query, selectedIds]);

  function saveClientId(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draftClientId.trim();
    if (!value) return;
    if (value !== clientId) clearAuthorization();
    localStorage.setItem(CLIENT_ID_KEY, value);
    setClientId(value);
    setDraftClientId(value);
    setAuthStatus(value === clientId && hasRefreshToken() ? authStatus : 'disconnected');
    setShowSetup(false);
    setError('');
  }

  async function connect() {
    if (!clientId) { setShowSetup(true); return; }
    setError('');
    try { await beginAuthorization(clientId); } catch (caught) { setError(friendlyError(caught)); }
  }

  function disconnect() { clearAuthorization(); setAuthStatus('disconnected'); setSelected([]); setResults([]); setPlaylist(null); setGeneration('idle'); }
  function chooseArtist(artist: SpotifyArtist) {
    if (selected.length >= MAX_ARTISTS || selectedIds.has(artist.id)) return;
    setSelected((current) => [...current, artist]);
    setQuery(''); setResults([]); setPlaylist(null); setGeneration('idle');
  }

  async function generatePlaylist() {
    if (!selected.length || isGenerating) return;
    setError(''); setPlaylist(null); setTrackCount(0);
    try {
      setGeneration('collecting');
      const tracks = [];
      for (const artist of selected) tracks.push(...await getArtistTopTracks(clientId, artist.id));
      const uniqueTracks = Array.from(new Map(tracks.map((track) => [track.uri, track])).values());
      if (!uniqueTracks.length) throw new Error('Spotify did not return any top tracks for this lineup.');
      setGeneration('creating');
      const artistNames = selected.map((artist) => artist.name);
      const title = artistNames.length <= 3 ? artistNames.join(' + ') : `${artistNames.slice(0, 2).join(' + ')} + ${artistNames.length - 2} more`;
      const created = await createPlaylist(clientId, `Artist Mix: ${title}`, `Top tracks from ${artistNames.join(', ')}. Created with Artist Mix.`);
      setGeneration('adding');
      await addPlaylistItems(clientId, created.id, uniqueTracks.map((track) => track.uri));
      setTrackCount(uniqueTracks.length); setPlaylist(created); setGeneration('success');
    } catch (caught) { setError(friendlyError(caught)); setGeneration('idle'); }
  }

  async function copyRedirectUri() { await navigator.clipboard.writeText(redirectUri()); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  const generationLabel = generation === 'collecting' ? 'Finding top tracks…' : generation === 'creating' ? 'Creating playlist…' : generation === 'adding' ? 'Adding tracks…' : 'Generate playlist';

  return (
    <main className="min-h-screen px-4 py-4 sm:px-7 sm:py-6"><div className="mx-auto max-w-[1180px]">
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><Music2 className="size-5" aria-hidden="true" /></span><div><p className="font-heading text-xl font-semibold leading-none">Artist Mix</p><p className="mt-1 text-xs text-muted-foreground">Your favourites, one playlist</p></div></div>
        <div className="flex items-center gap-2">{clientId && <Button variant="ghost" size="icon" aria-label="Spotify app settings" onClick={() => setShowSetup((value) => !value)}><Settings2 /></Button>}{authStatus === 'connected' ? <Button variant="outline" className="h-10 rounded-full px-4" onClick={disconnect}><LogOut className="mr-1" /> Disconnect</Button> : <Button className="h-10 rounded-full px-5" onClick={connect} disabled={authStatus === 'checking'}>{authStatus === 'checking' ? 'Checking…' : 'Connect Spotify'}</Button>}</div>
      </header>

      {showSetup && <section className="mt-6 rounded-[28px] border border-[#cfd9c5] bg-[#f9fcf4] p-5 shadow-sm sm:p-7" aria-labelledby="setup-title">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#537236]">One-time setup</p><h2 id="setup-title" className="mt-1 font-heading text-2xl font-semibold">Connect your Spotify app</h2></div>{clientId && <Button variant="ghost" size="icon" aria-label="Close setup" onClick={() => setShowSetup(false)}><X /></Button>}</div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Create an app in the Spotify Developer Dashboard, add the redirect URL below to its allowlist, then paste its Client ID. A client secret is neither needed nor safe in this browser-only app.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <form onSubmit={saveClientId} className="space-y-2"><label htmlFor="client-id" className="text-sm font-semibold">Spotify Client ID</label><div className="flex gap-2"><Input id="client-id" value={draftClientId} onChange={(event) => setDraftClientId(event.target.value)} placeholder="Paste your Client ID" className="h-11 bg-white" autoComplete="off" /><Button type="submit" className="h-11 px-5" disabled={!draftClientId.trim()}>Save</Button></div></form>
          <div className="space-y-2"><span className="text-sm font-semibold">Redirect URL to allowlist</span><div className="flex min-w-0 gap-2"><code className="flex h-11 min-w-0 flex-1 items-center truncate rounded-lg border bg-white px-3 text-xs">{typeof window === 'undefined' ? '' : redirectUri()}</code><Button type="button" variant="outline" className="h-11 bg-white" onClick={copyRedirectUri}>{copied ? <Check /> : <Copy />}<span className="sr-only">Copy redirect URL</span></Button></div></div>
        </div>
        <a className="mt-5 inline-flex items-center gap-1 text-sm font-semibold underline decoration-[#9bbc7a] underline-offset-4" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Open Spotify Developer Dashboard <ArrowUpRight className="size-4" /></a>
      </section>}

      {error && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p className="flex-1">{error}</p><button onClick={() => setError('')} aria-label="Dismiss error"><X className="size-4" /></button></div>}

      <section className="grid gap-6 pb-8 pt-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:pt-14">
        <div className="rounded-[32px] bg-card p-6 shadow-[0_22px_70px_rgb(30_35_29/8%)] sm:p-10 lg:p-12">
          <div className="mb-9 max-w-2xl"><span className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground"><Sparkles className="size-3.5" /> Build your mix</span><h1 className="font-heading text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">A little bit of everyone you love.</h1><p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Pick a handful of artists. We’ll gather their top tracks and turn them into one ready-to-play Spotify playlist.</p></div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="artist-search">Find an artist</label>
          <div className="relative">
            {searching ? <LoaderCircle className="absolute left-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" /> : <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />}
            <Input id="artist-search" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setSearching(false); } }} className="h-14 rounded-2xl border-0 bg-muted pl-12 pr-4 text-base shadow-none" placeholder={authStatus === 'connected' ? 'Search artists on Spotify' : 'Connect Spotify to search'} disabled={authStatus !== 'connected' || isGenerating} autoComplete="off" />
            {results.length > 0 && <div className="absolute z-20 mt-2 max-h-[360px] w-full overflow-auto rounded-2xl border bg-popover p-2 shadow-[0_20px_55px_rgb(30_35_29/18%)]">{results.map((artist) => <button key={artist.id} onClick={() => chooseArtist(artist)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">{artistImage(artist) ? <Image src={artistImage(artist)!} alt="" width={44} height={44} unoptimized className="size-11 rounded-full object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-secondary text-xs font-bold">{initials(artist.name)}</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{artist.name}</span><span className="text-xs text-muted-foreground">Artist on Spotify</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>)}</div>}
          </div>
          {query.trim().length >= 2 && !searching && !results.length && authStatus === 'connected' && <p className="mt-3 text-sm text-muted-foreground">No more matching artists found.</p>}
          <div className="mt-8"><div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-heading text-lg font-semibold">Your lineup</h2><span className="text-sm text-muted-foreground">{selected.length ? `${selected.length} artist${selected.length === 1 ? '' : 's'} · up to ${selected.length * 10} tracks` : 'Choose up to 20 artists'}</span></div>
            {selected.length ? <div className="flex flex-wrap gap-3">{selected.map((artist) => <div key={artist.id} className="flex items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-2">{artistImage(artist) ? <Image src={artistImage(artist)!} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover" /> : <span className="grid size-9 place-items-center rounded-full bg-secondary text-[11px] font-bold">{initials(artist.name)}</span>}<span className="max-w-40 truncate text-sm font-medium">{artist.name}</span><button className="grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={() => { setSelected((current) => current.filter((item) => item.id !== artist.id)); setPlaylist(null); setGeneration('idle'); }} aria-label={`Remove ${artist.name}`} disabled={isGenerating}><X className="size-3.5" /></button></div>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-center"><p className="text-sm font-medium">Your artist lineup is empty</p><p className="mt-1 text-xs text-muted-foreground">Search above and pick at least one artist.</p></div>}
          </div>
        </div>

        <aside className="flex min-h-[430px] flex-col justify-between overflow-hidden rounded-[32px] bg-[#1f241f] p-7 text-[#f6f3eb] sm:p-9">
          {generation === 'success' && playlist ? <div className="flex h-full flex-col justify-between"><div><span className="grid size-12 place-items-center rounded-2xl bg-[#a7e769] text-[#172015]"><Check className="size-6" /></span><p className="mt-8 text-sm font-medium text-white/55">Playlist created</p><h2 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em]">{playlist.name}</h2><p className="mt-4 text-sm leading-6 text-white/60">{trackCount} unique tracks are waiting for you in Spotify.</p></div><a href={playlist.external_urls.spotify} target="_blank" rel="noreferrer" className="mt-12 flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#a7e769] text-base font-semibold text-[#162012] transition hover:bg-[#b8ef82]">Open in Spotify <ArrowUpRight className="size-4" /></a></div> : <><div><span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Headphones className="size-6" /></span><p className="mt-8 text-sm font-medium text-white/55">{selected.length ? 'Your mix is ready to make' : 'Ready when you are'}</p><h2 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em]">Top tracks, beautifully mixed.</h2><p className="mt-4 text-sm leading-6 text-white/60">Duplicates are removed automatically. Your lineup stays in this tab and Spotify content is never stored.</p></div><Button onClick={authStatus === 'connected' ? generatePlaylist : connect} disabled={authStatus === 'checking' || (authStatus === 'connected' && (!selected.length || isGenerating))} className="mt-12 h-14 w-full rounded-2xl bg-[#a7e769] text-base font-semibold text-[#162012] hover:bg-[#b8ef82] disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100">{isGenerating && <LoaderCircle className="mr-1 animate-spin" />}{authStatus !== 'connected' ? 'Connect to start' : generationLabel}</Button></>}
        </aside>
      </section>

      <footer className="flex flex-col justify-between gap-3 border-t py-5 text-xs text-muted-foreground sm:flex-row"><p>Spotify content is used only for immediate playlist creation and never for model training.</p><a href="https://www.spotify.com" target="_blank" rel="noreferrer" className="font-semibold hover:text-foreground">Powered by Spotify <ArrowUpRight className="inline size-3" /></a></footer>
    </div></main>
  );
}
