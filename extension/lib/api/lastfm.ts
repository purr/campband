/**
 * Last.fm API Client
 * Handles authentication and scrobbling
 */

import { proxyFetch } from './fetchProxy';
import md5 from 'blueimp-md5';

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

export interface LastFmCredentials {
  username: string;
  password: string;
  apiKey: string;
  apiSecret: string;
}

export interface LastFmSession {
  sessionKey: string;
  username: string;
}

export interface LastFmError {
  message: string;
  statusCode?: number;
  errorCode?: number;
}

export interface ScrobbleData {
  artist: string;
  track: string;
  album?: string;
  timestamp: number; // UNIX timestamp
}

/**
 * Generate API signature for Last.fm requests
 * Parameters must be sorted alphabetically, then concatenated with shared secret, then MD5 hashed
 * Note: format and api_sig parameters are excluded from signature calculation
 */
function generateApiSig(params: Record<string, string>, apiSecret: string): string {
  try {
    // Exclude format and api_sig from signature calculation
    const paramsForSig: Record<string, string> = {};
    Object.keys(params).forEach(key => {
      if (key !== 'format' && key !== 'api_sig') {
        paramsForSig[key] = params[key];
      }
    });

    // Sort parameters alphabetically
    const sortedKeys = Object.keys(paramsForSig).sort();
    const paramString = sortedKeys.map(key => `${key}${paramsForSig[key]}`).join('');
    const sigString = paramString + apiSecret;

    // MD5 hash
    const hash = md5(sigString);
    console.log('[Last.fm] Signature string (without secret):', paramString.substring(0, 100) + '...');
    console.log('[Last.fm] Generated API signature:', hash.substring(0, 16) + '...');
    return hash;
  } catch (error) {
    console.error('[Last.fm] Failed to generate API signature:', error);
    throw new Error('Failed to generate API signature: ' + (error instanceof Error ? error.message : String(error)));
  }
}

// MD5 is now imported from blueimp-md5 library

/**
 * Authenticate with Last.fm using mobile session method
 */
export async function authenticateLastFm(credentials: LastFmCredentials): Promise<LastFmSession> {
  try {
    console.log('[Last.fm] Starting authentication for user:', credentials.username);

    // Build parameters (without format and api_sig - those are added after signature)
    const params: Record<string, string> = {
      method: 'auth.getMobileSession',
      username: credentials.username,
      password: credentials.password,
      api_key: credentials.apiKey,
    };

    // Generate signature BEFORE adding format and api_sig
    const apiSig = generateApiSig(params, credentials.apiSecret);

    // Now add format and api_sig
    params.api_sig = apiSig;
    params.format = 'json';

    const formData = new URLSearchParams();
    Object.keys(params).forEach(key => {
      formData.append(key, params[key]);
    });

    console.log('[Last.fm] Sending authentication request to:', LASTFM_API_BASE);
    const response = await proxyFetch(LASTFM_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Last.fm] HTTP error:', response.status, errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = null;
      }
      const error: LastFmError = {
        message: errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status,
        errorCode: errorData?.error,
      };
      throw error;
    }

    const text = await response.text();
    console.log('[Last.fm] Response received:', text.substring(0, 200));

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('[Last.fm] Failed to parse JSON response:', text);
      const error: LastFmError = {
        message: 'Invalid JSON response from Last.fm API',
        statusCode: response.status,
      };
      throw error;
    }

    if (data.error) {
      console.error('[Last.fm] API error:', data.error, data.message);
      const error: LastFmError = {
        message: data.message || `Error ${data.error}`,
        statusCode: response.status,
        errorCode: data.error,
      };
      throw error;
    }

    if (!data.session || !data.session.key || !data.session.name) {
      console.error('[Last.fm] Invalid response structure:', data);
      throw new Error('Invalid response from Last.fm API');
    }

    console.log('[Last.fm] Authentication successful for:', data.session.name);
    return {
      sessionKey: data.session.key,
      username: data.session.name,
    };
  } catch (error) {
    console.error('[Last.fm] Authentication error:', error);
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    const lastFmError: LastFmError = {
      message: error instanceof Error ? error.message : 'Unknown error during Last.fm authentication',
    };
    throw lastFmError;
  }
}

/**
 * Scrobble a track to Last.fm
 */
export async function scrobbleTrack(
  sessionKey: string,
  credentials: LastFmCredentials,
  scrobbleData: ScrobbleData
): Promise<void> {
  const params: Record<string, string> = {
    method: 'track.scrobble',
    'artist[0]': scrobbleData.artist,
    'track[0]': scrobbleData.track,
    'timestamp[0]': Math.floor(scrobbleData.timestamp).toString(),
    api_key: credentials.apiKey,
    sk: sessionKey,
  };

  // Add album if provided
  if (scrobbleData.album) {
    params['album[0]'] = scrobbleData.album;
  }

  const apiSig = generateApiSig(params, credentials.apiSecret);
  params.api_sig = apiSig;
  params.format = 'json';

  const formData = new URLSearchParams();
  Object.keys(params).forEach(key => {
    formData.append(key, params[key]);
  });

  const response = await proxyFetch(LASTFM_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (parseError) {
    throw new Error('Invalid JSON response from Last.fm API');
  }

  if (data.error) {
    throw new Error(`Last.fm scrobble failed: ${data.message || data.error}`);
  }

  // Check if scrobble was accepted
  if (data.scrobbles && data.scrobbles['@attr'] && data.scrobbles['@attr'].accepted === '0') {
    throw new Error('Last.fm rejected the scrobble');
  }
}

/**
 * Update now playing status
 */
export async function updateNowPlaying(
  sessionKey: string,
  credentials: LastFmCredentials,
  track: { artist: string; track: string; album?: string }
): Promise<void> {
  const params: Record<string, string> = {
    method: 'track.updateNowPlaying',
    artist: track.artist,
    track: track.track,
    api_key: credentials.apiKey,
    sk: sessionKey,
  };

  if (track.album) {
    params.album = track.album;
  }

  const apiSig = generateApiSig(params, credentials.apiSecret);
  params.api_sig = apiSig;
  params.format = 'json';

  const formData = new URLSearchParams();
  Object.keys(params).forEach(key => {
    formData.append(key, params[key]);
  });

  try {
    const response = await proxyFetch(LASTFM_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Last.fm] Failed to update now playing:', response.status, errorText);
      return;
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.warn('[Last.fm] Failed to parse now playing response');
      return;
    }

    if (data.error) {
      // Now playing errors are non-fatal, just log
      console.warn('[Last.fm] Failed to update now playing:', data.message || data.error);
    }
  } catch (error) {
    // Now playing errors are non-fatal, just log
    console.warn('[Last.fm] Error updating now playing:', error);
  }
}
