/**
 * Bandcamp Scraper
 *
 * Extracts data from Bandcamp pages by parsing HTML.
 * Uses centralized request handler for all HTTP requests.
 */

import type {
  Band,
  Track,
  Album,
  DiscographyItem,
  ArtistPage,
  SearchResult,
  SearchResults,
  ItemType,
} from '@/types';
import { extractArtIdFromUrl, extractImageIdFromUrl, buildArtUrl, ImageSizes } from '@/types';
import { fetchHtml, fetchHtmlWithRedirect, buildMusicUrl } from './request';

// ============================================
// Constants & Helpers
// ============================================

const DELAYS = {
  betweenRequests: 300,  // ms between fetching releases
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// HTML Parsing
// ============================================

function parseHtml(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// ============================================
// Data Extraction Helpers
// ============================================

function extractJsonFromAttribute(doc: Document, selector: string, attr: string): any | null {
  const element = doc.querySelector(selector);
  if (!element) return null;

  const data = element.getAttribute(attr);
  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    console.error('[Scraper] Failed to parse JSON from', selector, attr);
    return null;
  }
}

function extractLdJson(doc: Document): any | null {
  const script = doc.querySelector('script[type="application/ld+json"]');
  if (!script || !script.textContent) return null;

  try {
    return JSON.parse(script.textContent);
  } catch {
    console.error('[Scraper] Failed to parse ld+json');
    return null;
  }
}

/**
 * Extract background image ID from inline CSS styles
 * Bandcamp stores custom backgrounds in style tags like:
 * background-image: url(https://f4.bcbits.com/img/0041780408_130.jpg);
 */
function extractBackgroundImageId(doc: Document): number | undefined {
  // Look for background-image in style tags
  const styleTags = doc.querySelectorAll('style');
  for (const style of styleTags) {
    const content = style.textContent || '';
    // Match background-image: url(https://f4.bcbits.com/img/XXXXXXXXXX_XXX.jpg)
    const match = content.match(/background-image:\s*url\(['"]*https?:\/\/f\d\.bcbits\.com\/img\/(\d+)_\d+\.jpg['"]*\)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

// ============================================
// Search
// ============================================

export async function searchBandcamp(query: string): Promise<SearchResults> {
  const url = `https://bandcamp.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const doc = parseHtml(html);

  const results: SearchResults = {
    query,
    artists: [],
    albums: [],
    tracks: [],
  };

  // Parse search results
  const resultItems = doc.querySelectorAll('.searchresult');

  resultItems.forEach((item) => {
    const resultType = item.querySelector('.result-info .itemtype')?.textContent?.trim().toLowerCase();
    const heading = item.querySelector('.result-info .heading a');
    const subhead = item.querySelector('.result-info .subhead');
    const artImg = item.querySelector('.art img');

    if (!heading) return;

    const result: SearchResult = {
      type: resultType === 'artist' ? 'artist' : resultType === 'album' ? 'album' : 'track',
      id: 0, // We don't get ID from search results directly
      name: heading.textContent?.trim() || '',
      url: heading.getAttribute('href') || '',
      imageUrl: artImg?.getAttribute('src') || undefined,
      artist: subhead?.textContent?.trim().replace(/^by\s+/i, '') || undefined,
    };

    // Get genre if available
    const genre = item.querySelector('.result-info .genre')?.textContent?.trim();
    if (genre) {
      result.genre = genre.replace(/^genre:\s+/i, '');
    }

    // Add to appropriate array
    if (result.type === 'artist') {
      results.artists.push(result);
    } else if (result.type === 'album') {
      results.albums.push(result);
    } else {
      results.tracks.push(result);
    }
  });

  // If no results, try query as subdomain (direct artist URL)
  const hasResults = results.artists.length > 0 || results.albums.length > 0 || results.tracks.length > 0;
  if (!hasResults) {
    const directResult = await tryDirectArtistLookup(query);
    if (directResult) {
      results.artists.push(directResult);
    }
  }

  return results;
}

/**
 * Try to fetch the query directly as a Bandcamp subdomain
 * Useful when search returns no results but the artist exists
 */
async function tryDirectArtistLookup(query: string): Promise<SearchResult | null> {
  // Clean the query to make it a valid subdomain
  // Remove spaces, special chars, convert to lowercase
  const subdomain = query
    .toLowerCase()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/[^a-z0-9-]/g, ''); // Keep only alphanumeric and hyphens

  if (!subdomain || subdomain.length < 2) {
    return null;
  }

  const artistUrl = `https://${subdomain}.bandcamp.com`;
  console.log('[Scraper] No search results, trying direct URL:', artistUrl);

  try {
    const artist = await fetchArtistPage(artistUrl);

    // Successfully fetched - create a search result from it
    return {
      type: 'artist',
      id: artist.band.id,
      name: artist.band.name,
      url: artist.band.url,
      imageUrl: artist.band.imageId
        ? `https://f4.bcbits.com/img/${String(artist.band.imageId).padStart(10, '0')}_7.jpg`
        : undefined,
    };
  } catch (error) {
    // Artist doesn't exist at this subdomain
    console.log('[Scraper] Direct lookup failed:', (error as Error).message);
    return null;
  }
}

// ============================================
// Artist Page
// ============================================

/**
 * Result type for artist page fetching
 * Can return either the artist page (discography) OR a single release if the artist only has one
 */
export type ArtistPageResult =
  | { type: 'artist'; data: ArtistPage }
  | { type: 'singleRelease'; data: Album; releaseType: 'album' | 'track' };

export async function fetchArtistPage(artistUrl: string): Promise<ArtistPage> {
  const result = await fetchArtistPageWithRedirect(artistUrl);

  if (result.type === 'singleRelease') {
    // Convert single release to an ArtistPage format
    // This happens when artist has only one track/album and /music redirects to it
    const album = result.data;

    const band: Band = {
      id: album.bandId,
      name: album.artist,
      subdomain: new URL(album.bandUrl || artistUrl).hostname.replace('.bandcamp.com', ''),
      url: album.bandUrl || artistUrl,
    };

    const releases: DiscographyItem[] = [{
      itemType: result.releaseType,
      itemId: album.id,
      bandId: album.bandId,
      url: album.url,
      relativeUrl: album.url.replace(band.url, ''),
      title: album.title,
      artUrl: album.artId ? buildArtUrl(album.artId, ImageSizes.MEDIUM_700) : '',
      artId: album.artId?.toString(),
    }];

    return {
      band,
      releases,
      totalReleases: 1,
      discographyRealSize: 1,
    };
  }

  return result.data;
}

/**
 * Fetch artist page with redirect detection
 * If /music redirects to a track/album, the artist only has one release
 */
export async function fetchArtistPageWithRedirect(artistUrl: string): Promise<ArtistPageResult> {
  // Always build /music URL from base domain to ensure we get discography
  const url = buildMusicUrl(artistUrl);
  console.log('[Scraper] Fetching artist /music page:', url);

  const { html, finalUrl, wasRedirected } = await fetchHtmlWithRedirect(url);

  // Check if we were redirected to a single release
  // Bandcamp redirects /music to /track/... or /album/... ONLY if artist has just one release
  if (wasRedirected) {
    const urlObj = new URL(finalUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    console.log('[Scraper] /music redirected! Path parts:', pathParts);

    if (pathParts[0] === 'track' || pathParts[0] === 'album') {
      console.log('[Scraper] Single-release artist detected:', finalUrl);
      const releaseType = pathParts[0] as 'album' | 'track';
      const release = await fetchReleasePage(finalUrl);
      return { type: 'singleRelease', data: release, releaseType };
    }
  } else {
    console.log('[Scraper] /music did not redirect - normal artist with multiple releases');
  }

  const doc = parseHtml(html);

  // Get band data from data-band attribute
  const bandData = extractJsonFromAttribute(doc, 'script[data-band]', 'data-band');

  if (!bandData) {
    throw new Error('Could not find band data on page');
  }

  // Extract imageId from band data, or try to get it from bio image
  let imageId = bandData.image_id;
  if (!imageId) {
    // Try to get from bio image URL
    // Bandcamp uses .bio-pic .popupImage (full size link) or .bio-pic img (thumbnail)
    const popupLink = doc.querySelector('.bio-pic .popupImage');
    const bioImgSrc = popupLink?.getAttribute('href')
      || doc.querySelector('.bio-pic img')?.getAttribute('src')
      || doc.querySelector('.band-photo')?.getAttribute('src');
    if (bioImgSrc) {
      imageId = extractImageIdFromUrl(bioImgSrc);
    }
  }

  // Extract background image ID from inline CSS
  const backgroundImageId = extractBackgroundImageId(doc);

  const band: Band = {
    id: bandData.id,
    name: bandData.name,
    subdomain: bandData.subdomain,
    url: bandData.url || artistUrl,
    accountId: bandData.account_id,
    imageId: imageId || undefined,
    backgroundImageId,
    location: doc.querySelector('.location')?.textContent?.trim() || undefined,
    bio: (() => {
      const bioElement = doc.querySelector('#bio-text');
      if (!bioElement) return undefined;
      // Get innerHTML to preserve structure for "more"/"less" functionality
      return bioElement.innerHTML.trim() || undefined;
    })(),
    links: [],
  };

  // Get band links
  const linkElements = doc.querySelectorAll('#band-links li a');
  linkElements.forEach((link) => {
    band.links?.push({
      text: link.textContent?.trim() || '',
      url: link.getAttribute('href') || '',
    });
  });

  // Get releases from music grid
  const releases: DiscographyItem[] = [];
  const seenIds = new Set<number>();

  // First, get items from HTML li elements
  const gridItems = doc.querySelectorAll('#music-grid .music-grid-item');

  gridItems.forEach((li) => {
    const dataItemId = li.getAttribute('data-item-id') || '';
    const dataBandId = li.getAttribute('data-band-id') || '';

    if (!dataItemId.includes('-')) return;

    const [itemType, itemIdStr] = dataItemId.split('-');
    const itemId = parseInt(itemIdStr, 10);

    if (seenIds.has(itemId)) return;
    seenIds.add(itemId);

    const link = li.querySelector('a');
    const href = link?.getAttribute('href') || '';
    const title = li.querySelector('.title')?.textContent?.trim() || '';
    const artistOverride = li.querySelector('.artist-override')?.textContent?.trim() || undefined;
    const artImg = li.querySelector('img');

    // Get art URL from img - prefer data-original (real URL) over src (might be placeholder)
    // Lazy-loaded images have src="/img/0.gif" and real URL in data-original
    const imgSrc = artImg?.getAttribute('src') || '';
    const imgDataOriginal = artImg?.getAttribute('data-original') || '';
    // Use data-original if src is placeholder, otherwise use src
    const rawArtUrl = (imgSrc.includes('/img/0.gif') || imgSrc === '') ? imgDataOriginal : imgSrc;
    // If still no URL, try data-original as fallback
    const finalArtUrl = rawArtUrl || imgDataOriginal;
    // Extract artId as STRING to preserve leading zeros (e.g., "0510498139")
    const artId = extractArtIdFromUrl(finalArtUrl);
    // Build a proper URL with medium size if we got an artId, otherwise use raw URL
    const artUrl = artId ? buildArtUrl(artId, ImageSizes.MEDIUM_700) : finalArtUrl;

    releases.push({
      itemType: itemType as ItemType,
      itemId,
      bandId: parseInt(dataBandId, 10) || band.id,
      url: href.startsWith('http') ? href : `${band.url}${href}`,
      relativeUrl: href,
      title: artistOverride ? title.replace(artistOverride, '').trim() : title,
      artistOverride,
      artUrl: artUrl || '',
      artId: artId || undefined, // String to preserve leading zeros
    });
  });

  // Second, get additional items from data-client-items (lazy-loaded)
  const musicGrid = doc.querySelector('#music-grid');
  const clientItemsRaw = musicGrid?.getAttribute('data-client-items');

  if (clientItemsRaw) {
    try {
      const clientItems = JSON.parse(clientItemsRaw);

      clientItems.forEach((item: any) => {
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);

        // Build proper art URL from art_id if available
        // art_id can be 0 or missing for some items
        const artId = item.art_id && item.art_id > 0 ? item.art_id : null;
        const artUrl = artId ? buildArtUrl(artId, ImageSizes.MEDIUM_700) : '';

        releases.push({
          itemType: item.type as ItemType,
          itemId: item.id,
          bandId: item.band_id || band.id,
          url: item.page_url?.startsWith('http') ? item.page_url : `${band.url}${item.page_url}`,
          relativeUrl: item.page_url || '',
          title: item.title || '',
          artistOverride: item.artist || undefined,
          artUrl,
          artId: artId || undefined,
        });
      });
    } catch (e) {
      console.error('[Scraper] Failed to parse data-client-items:', e);
    }
  }

  // Get discography real size from pagedata
  let discographyRealSize: number | undefined;
  const pagedata = doc.querySelector('#pagedata');
  if (pagedata) {
    const blob = extractJsonFromAttribute(doc, '#pagedata', 'data-blob');
    if (blob?.sidebar_disco?.discography_real_size) {
      discographyRealSize = blob.sidebar_disco.discography_real_size;
    }
  }

  console.log('[Scraper] Parsed', releases.length, 'releases for', band.name, '(real size:', discographyRealSize, ')');

  return {
    type: 'artist' as const,
    data: {
      band,
      releases,
      totalReleases: releases.length,
      discographyRealSize,
    },
  };
}

/**
 * Fetch just the release list from an artist's /music page
 * This is a lightweight check used to detect new releases without fetching all data
 * Returns null if fetch fails (don't throw - this is used for background checks)
 */
export async function fetchArtistReleaseList(artistUrl: string): Promise<DiscographyItem[] | null> {
  try {
    // Always build /music URL from base domain
    const url = buildMusicUrl(artistUrl);
    console.log('[Scraper] Fetching release list from:', url);

    const { html, finalUrl, wasRedirected } = await fetchHtmlWithRedirect(url);

    // If redirected to a single release, artist has only one release
    if (wasRedirected) {
      const urlObj = new URL(finalUrl);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      if (pathParts[0] === 'track' || pathParts[0] === 'album') {
        // Parse the single release to get its info
        const doc = parseHtml(html);
        const tralbumData = extractJsonFromAttribute(doc, 'script[data-tralbum]', 'data-tralbum');
        const bandData = extractJsonFromAttribute(doc, 'script[data-band]', 'data-band');

        if (tralbumData && bandData) {
          const artId = tralbumData.art_id?.toString() || extractArtIdFromUrl(
            doc.querySelector('.popupImage img')?.getAttribute('src') || ''
          );

          return [{
            itemType: pathParts[0] as ItemType,
            itemId: tralbumData.id || tralbumData.current?.id,
            bandId: bandData.id,
            url: finalUrl,
            relativeUrl: urlObj.pathname,
            title: tralbumData.current?.title || '',
            artUrl: artId ? buildArtUrl(artId, ImageSizes.MEDIUM_700) : '',
            artId: artId || undefined,
          }];
        }
      }
      return null;
    }

    // Parse the /music page for releases
    const doc = parseHtml(html);
    const bandData = extractJsonFromAttribute(doc, 'script[data-band]', 'data-band');
    if (!bandData) return null;

    const releases: DiscographyItem[] = [];
    const seenIds = new Set<number>();

    // Get items from HTML
    const gridItems = doc.querySelectorAll('#music-grid .music-grid-item');
    gridItems.forEach((li) => {
      const dataItemId = li.getAttribute('data-item-id') || '';
      const dataBandId = li.getAttribute('data-band-id') || '';

      if (!dataItemId.includes('-')) return;

      const [itemType, itemIdStr] = dataItemId.split('-');
      const itemId = parseInt(itemIdStr, 10);

      if (seenIds.has(itemId)) return;
      seenIds.add(itemId);

      const link = li.querySelector('a');
      const href = link?.getAttribute('href') || '';
      const title = li.querySelector('.title')?.textContent?.trim() || '';
      const artistOverride = li.querySelector('.artist-override')?.textContent?.trim() || undefined;
      const artImg = li.querySelector('img');

      const imgSrc = artImg?.getAttribute('src') || '';
      const imgDataOriginal = artImg?.getAttribute('data-original') || '';
      const rawArtUrl = (imgSrc.includes('/img/0.gif') || imgSrc === '') ? imgDataOriginal : imgSrc;
      const finalArtUrl = rawArtUrl || imgDataOriginal;
      const artId = extractArtIdFromUrl(finalArtUrl);
      const artUrl = artId ? buildArtUrl(artId, ImageSizes.MEDIUM_700) : finalArtUrl;

      releases.push({
        itemType: itemType as ItemType,
        itemId,
        bandId: parseInt(dataBandId, 10) || bandData.id,
        url: href.startsWith('http') ? href : `${bandData.url}${href}`,
        relativeUrl: href,
        title: artistOverride ? title.replace(artistOverride, '').trim() : title,
        artistOverride,
        artUrl: artUrl || '',
        artId: artId || undefined,
      });
    });

    // Get lazy-loaded items from data-client-items
    const musicGrid = doc.querySelector('#music-grid');
    const clientItemsRaw = musicGrid?.getAttribute('data-client-items');

    if (clientItemsRaw) {
      try {
        const clientItems = JSON.parse(clientItemsRaw);
        clientItems.forEach((item: any) => {
          if (seenIds.has(item.id)) return;
          seenIds.add(item.id);

          const artId = item.art_id?.toString() || extractArtIdFromUrl(item.art_url || '');

          releases.push({
            itemType: item.type as ItemType,
            itemId: item.id,
            bandId: item.band_id || bandData.id,
            url: item.page_url || `${bandData.url}/${item.type}/${item.slug_text}`,
            relativeUrl: `/${item.type}/${item.slug_text}`,
            title: item.title,
            artistOverride: item.artist,
            artUrl: artId ? buildArtUrl(artId, ImageSizes.MEDIUM_700) : '',
            artId: artId || undefined,
          });
        });
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return releases;
  } catch (error) {
    console.warn('[Scraper] Failed to fetch release list:', error);
    return null;
  }
}

// ============================================
// Album / Track Page
// ============================================

export async function fetchReleasePage(releaseUrl: string): Promise<Album> {
  const html = await fetchHtml(releaseUrl);
  const doc = parseHtml(html);

  // Get main data from data-tralbum attribute
  const tralbumData = extractJsonFromAttribute(doc, 'script[data-tralbum]', 'data-tralbum');
  const bandData = extractJsonFromAttribute(doc, 'script[data-band]', 'data-band');
  const ldJson = extractLdJson(doc);

  // Detect hidden tracks (based on https://github.com/7x11x13/hidden-bandcamp-tracks)
  let hiddenTrackCount: number | undefined;
  const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
  const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content');

  if (ogType === 'album' && ogDescription) {
    const trackCountMatch = ogDescription.match(/(\d+)\s+track\s+album/i);
    if (trackCountMatch) {
      const totalTracks = parseInt(trackCountMatch[1], 10);
      // Get max track number from tralbum data
      const visibleTrackNums = (tralbumData?.trackinfo || [])
        .map((t: any) => t.track_num)
        .filter((n: number) => typeof n === 'number' && n > 0);
      const maxVisibleTrack = visibleTrackNums.length > 0 ? Math.max(...visibleTrackNums) : 0;
      const hidden = totalTracks - maxVisibleTrack;
      if (hidden > 0) {
        hiddenTrackCount = hidden;
        console.log(`[Scraper] Detected ${hidden} hidden track(s) on ${releaseUrl}`);
      }
    }
  }

  if (!tralbumData) {
    throw new Error('Could not find tralbum data on page');
  }

  const current = tralbumData.current || {};

  // Construct band URL from release URL if not available from bandData
  // e.g., https://artist.bandcamp.com/album/name -> https://artist.bandcamp.com
  const bandUrl = bandData?.url || (() => {
    try {
      const url = new URL(releaseUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  })();

  // Extract tracks
  const tracks: Track[] = (tralbumData.trackinfo || []).map((t: any) => ({
    id: t.id || t.track_id,
    trackId: t.track_id,
    title: t.title,
    trackNum: t.track_num,
    duration: t.duration,
    titleLink: t.title_link,
    streamUrl: t.file?.['mp3-128'] || undefined,
    albumUrl: releaseUrl, // Full URL for navigation
    artist: t.artist || tralbumData.artist,
    albumTitle: current.title,
    albumId: current.type === 'album' ? current.id : undefined,
    artId: tralbumData.art_id,
    bandId: current.band_id,
    bandName: bandData?.name || tralbumData.artist,
    bandUrl: bandUrl,
    hasLyrics: t.has_lyrics || false,
    lyrics: undefined, // Lyrics are in ld+json
    streaming: t.streaming === 1,
    isDownloadable: t.is_downloadable || false,
  }));

  // Get lyrics from ld+json
  if (ldJson?.track?.itemListElement) {
    ldJson.track.itemListElement.forEach((item: any) => {
      const trackItem = item.item;
      const trackName = trackItem?.name;
      const lyricsText = trackItem?.recordingOf?.lyrics?.text;

      if (trackName && lyricsText) {
        const track = tracks.find(t => t.title === trackName);
        if (track) {
          track.lyrics = lyricsText;
        }
      }
    });
  }

  // Get tags
  const tags: string[] = [];
  doc.querySelectorAll('.tralbum-tags .tag').forEach((tag) => {
    const text = tag.textContent?.trim();
    if (text) tags.push(text);
  });

  const album: Album = {
    id: current.id,
    url: releaseUrl,
    title: current.title,
    artist: tralbumData.artist,
    artId: tralbumData.art_id,
    bandId: current.band_id,
    bandUrl,
    about: current.about || undefined,
    credits: current.credits || undefined,
    releaseDate: current.release_date || undefined,
    tags,
    tracks,
    hiddenTrackCount,
    hasAudio: tralbumData.hasAudio || tracks.length > 0,
    isPreorder: tralbumData.is_preorder || false,
  };

  return album;
}

// ============================================
// Batch Fetching with Progress
// ============================================

export interface FetchProgress {
  current: number;
  total: number;
  currentItem: string;
}

export type ProgressCallback = (progress: FetchProgress) => void;

export async function fetchArtistWithReleases(
  artistUrl: string,
  onProgress?: ProgressCallback
): Promise<{ artist: ArtistPage; releases: Album[] }> {
  // First, fetch the artist page
  const artist = await fetchArtistPage(artistUrl);

  const releases: Album[] = [];
  const total = artist.releases.length;

  // Fetch each release with delay
  for (let i = 0; i < artist.releases.length; i++) {
    const release = artist.releases[i];

    onProgress?.({
      current: i + 1,
      total,
      currentItem: release.title,
    });

    try {
      await delay(DELAYS.betweenRequests);
      const releaseData = await fetchReleasePage(release.url);
      releases.push(releaseData);
    } catch (error) {
      console.error(`[Scraper] Failed to fetch release ${release.url}:`, error);
      // Continue with next release
    }
  }

  return { artist, releases };
}

// ============================================
// Stream URL Refresh
// ============================================

/**
 * Refresh a track's stream URL by re-fetching the album/track page.
 * Used when a cached stream URL has expired (410 Gone).
 * Also updates the cache with fresh album data.
 *
 * @param track - Track with albumUrl to re-fetch
 * @param updateCache - Optional callback to update cache with fresh album data
 * @returns Fresh stream URL or null if not found
 */
export async function refreshStreamUrl(
  track: { id: number; albumUrl?: string },
  updateCache?: (album: Album) => void
): Promise<string | null> {
  if (!track.albumUrl) {
    console.error('[Scraper] Cannot refresh stream URL: no albumUrl');
    return null;
  }

  try {
    console.log('[Scraper] Refreshing stream URL for track', track.id, 'from', track.albumUrl);
    const album = await fetchReleasePage(track.albumUrl);

    // Update cache with fresh album data (includes fresh stream URLs for all tracks)
    if (updateCache) {
      updateCache(album);
    }

    // Find the track by ID
    const freshTrack = album.tracks?.find(t => t.id === track.id || t.trackId === track.id);

    if (freshTrack?.streamUrl) {
      console.log('[Scraper] Got fresh stream URL for track', track.id);
      return freshTrack.streamUrl;
    }

    console.warn('[Scraper] Track not found in refreshed album data:', track.id);
    return null;
  } catch (error) {
    console.error('[Scraper] Failed to refresh stream URL:', error);
    return null;
  }
}

