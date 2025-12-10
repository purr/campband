/**
 * Bandcamp Scraper
 *
 * Extracts data from Bandcamp pages by parsing HTML.
 * Ported from Python implementation in _research/scrape_artist.py
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

// ============================================
// Constants
// ============================================

const DELAYS = {
  betweenRequests: 300,
  afterError: 2000,
};

// ============================================
// Fetch Helpers
// ============================================

async function fetchHtml(url: string): Promise<string> {
  console.log('[Scraper] Fetching:', url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function parseHtml(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  return results;
}

// ============================================
// Artist Page
// ============================================

export async function fetchArtistPage(artistUrl: string): Promise<ArtistPage> {
  // Ensure URL ends with /music
  const url = artistUrl.replace(/\/?$/, '/music');
  const html = await fetchHtml(url);
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

  const band: Band = {
    id: bandData.id,
    name: bandData.name,
    subdomain: bandData.subdomain,
    url: bandData.url || artistUrl,
    accountId: bandData.account_id,
    imageId: imageId || undefined,
    location: doc.querySelector('.location')?.textContent?.trim() || undefined,
    bio: doc.querySelector('#bio-text')?.textContent?.trim() || undefined,
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

  return {
    band,
    releases,
    totalReleases: releases.length,
    discographyRealSize,
  };
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

