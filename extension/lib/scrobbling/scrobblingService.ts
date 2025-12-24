/**
 * Last.fm Scrobbling Service
 * Tracks playback and scrobbles tracks when criteria are met
 */

import type { Track } from '@/types';
import { getDisplayTitle } from '@/lib/utils';
import { authenticateLastFm, scrobbleTrack, updateNowPlaying, type LastFmCredentials } from '@/lib/api/lastfm';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { usePlayerStore } from '@/lib/store/playerStore';
import { useQueueStore } from '@/lib/store/queueStore';
import { audioEngine } from '@/lib/audio';
import { db, type ScrobbledTrack } from '@/lib/db';

// Periodic retry for failed scrobbles (every 5 minutes)
const RETRY_INTERVAL = 5 * 60 * 1000;

// Debug logging
const DEBUG_SCROBBLING = true;

function debugLog(...args: any[]) {
  if (DEBUG_SCROBBLING) {
    console.log('[ScrobblingService]', ...args);
  }
}

export interface PendingScrobble {
  track: Track;
  timestamp: number; // When track started playing
  retryCount: number;
}

export interface QueuedScrobble {
  track: Track;
  timestamp: number; // When track started playing
  queuedAt: number; // When criteria was met (for logging)
}

class ScrobblingService {
  private currentTrack: Track | null = null;
  private trackStartTime: number = 0;
  private trackPlayedTime: number = 0;
  private hasQueuedScrobble: boolean = false; // Changed from hasScrobbled - now we queue instead
  private hasUpdatedNowPlaying: boolean = false;
  private pendingScrobbles: PendingScrobble[] = []; // Failed scrobbles to retry
  private queuedScrobbles: QueuedScrobble[] = []; // Scrobbles ready to send when music stops
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null; // Timer for sending scrobbles after stop
  private lastLoggedProgress: number | null = null; // Track last logged progress to reduce spam
  private lastPlayTime: number = 0; // Track when music was last playing
  private lastNowPlayingUpdate: number = 0; // Track when we last updated "now playing" status

  constructor() {
    // Start periodic retry for failed scrobbles
    this.startPeriodicRetry();
  }

  /**
   * Initialize scrobbling for a new track
   * Only starts if music is actually playing
   * Always gets current track from player store to ensure accuracy
   */
  async startTrack(track: Track, isActuallyPlaying: boolean = true): Promise<void> {
    // CRITICAL: Always get the actual current track from player store to ensure accuracy
    // This prevents tracking wrong tracks during crossfade or state changes
    const actualCurrentTrack = usePlayerStore.getState().currentTrack;

    // Use the actual track from player store, not the passed one
    const trackToUse = actualCurrentTrack || track;

    debugLog('startTrack() called', {
      trackId: trackToUse.id,
      title: trackToUse.title,
      isActuallyPlaying,
      passedTrackId: track.id,
      actualTrackId: actualCurrentTrack?.id,
      match: track.id === actualCurrentTrack?.id,
    });

    // CRITICAL: Don't start scrobbling if music isn't actually playing
    // This prevents scrobbling on page reload when music is stopped
    if (!isActuallyPlaying) {
      debugLog('Music is not playing, not starting scrobbling');
      this.stopTrack(); // Make sure we're stopped
      return;
    }

    const settings = useSettingsStore.getState().lastfm;

    if (!settings.enabled || !settings.sessionKey) {
      debugLog('Scrobbling disabled or no session key, stopping');
      this.stopTrack();
      return;
    }

    // Stop any previous track first and clear its now playing status
    if (this.currentTrack) {
      const isSameTrack = this.currentTrack.id === trackToUse.id;
      const hasQueuedScrobble = this.hasQueuedScrobble;
      debugLog('Stopping previous track before starting new one', {
        previousTrackId: this.currentTrack.id,
        previousTitle: this.currentTrack.title,
        isSameTrack,
        hasQueuedScrobble,
      });
      // Clear now playing for old track
      this.currentTrack = null;
      this.hasUpdatedNowPlaying = false; // Reset flag so new track can update
      // If we have a queued scrobble (track finished or was skipped), send it immediately
      // Also send immediately if it's a different track (skip)
      // Only wait 30 seconds if user manually paused/stopped (which won't trigger startTrack)
      this.stopTrack(hasQueuedScrobble || !isSameTrack);
    }

    // Cancel any pending stop timer (music started again)
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      debugLog('Canceled stop timer - music resumed');
    }

    this.currentTrack = trackToUse;
    this.trackStartTime = Math.floor(Date.now() / 1000);
    this.trackPlayedTime = 0;
    this.hasQueuedScrobble = false;
    this.hasUpdatedNowPlaying = false;
    this.lastLoggedProgress = null; // Reset log tracking for new track
    this.lastPlayTime = Date.now(); // Track when music started
    this.lastNowPlayingUpdate = 0; // Reset "now playing" update timer for new track

    debugLog('=== NEW TRACK STARTED ===', {
      trackId: trackToUse.id,
      title: trackToUse.title,
      artist: trackToUse.artist || trackToUse.bandName,
      duration: trackToUse.duration,
      startTime: this.trackStartTime,
    });

    // Check if this EXACT play session was already scrobbled (same track, same start timestamp)
    // This prevents duplicate scrobbles on page reload, but allows legitimate re-plays
    // Note: Each new play session gets a new timestamp, so re-playing the same song will scrobble again
    const wasAlreadyScrobbled = await this.wasTrackScrobbled(trackToUse.id, this.trackStartTime);
    if (wasAlreadyScrobbled) {
      debugLog('This exact play session already scrobbled (page reload detected), skipping duplicate', {
        trackId: trackToUse.id,
        timestamp: this.trackStartTime,
      });
      this.hasQueuedScrobble = true; // Mark as queued to prevent duplicate from this session
    } else {
      debugLog('New play session - will queue scrobble when criteria met', {
        trackId: trackToUse.id,
        timestamp: this.trackStartTime,
      });
    }

    // Update now playing immediately (force update even if flag is set)
    // Always use the actual track from player store
    // Only update if music is actually playing
    if (isActuallyPlaying) {
      this.updateNowPlaying(trackToUse, true);
    } else {
      debugLog('Skipping now playing update - music is not actually playing');
    }

    // Start checking if we should scrobble
    this.startChecking();
  }

  /**
   * Update playback progress
   * Only updates if music is actually playing
   * Always verifies current track from player store
   */
  updateProgress(currentTime: number, isActuallyPlaying: boolean = true): void {
    if (!this.currentTrack) {
      // This is expected when no track is playing - don't log
      return;
    }

    // CRITICAL: Always verify we're tracking the correct track
    const actualCurrentTrack = usePlayerStore.getState().currentTrack;
    if (actualCurrentTrack && actualCurrentTrack.id !== this.currentTrack.id) {
      debugLog('Track mismatch detected in updateProgress - stopping old track', {
        trackingTrackId: this.currentTrack.id,
        actualTrackId: actualCurrentTrack.id,
      });
      this.stopTrack();
      // Start tracking the new track if music is playing
      if (isActuallyPlaying) {
        this.startTrack(actualCurrentTrack, true).catch(console.error);
      }
      return;
    }

    // CRITICAL: Don't update progress if music isn't actually playing
    // This prevents scrobbling when music is paused or stopped
    if (!isActuallyPlaying) {
      debugLog('Music is not playing, stopping scrobbling progress');
      this.stopTrack();
      return;
    }

    const settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || !settings.sessionKey) {
      debugLog('Scrobbling disabled or no session key, stopping');
      // If scrobbling was disabled, stop tracking
      if (this.currentTrack) {
        this.stopTrack();
      }
      return;
    }

    this.trackPlayedTime = currentTime;
    this.lastPlayTime = Date.now(); // Update last play time

    // Cancel stop timer if music is playing (user resumed)
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      debugLog('Canceled stop timer - music resumed');
    }

    // Periodically refresh "now playing" status (every 30 seconds)
    // This ensures Last.fm knows the track is still playing, especially after scrobble is queued
    // CRITICAL: Only update if we have a current track AND music is actually playing
    const timeSinceLastUpdate = Date.now() - (this.lastNowPlayingUpdate || 0);
    const NOW_PLAYING_UPDATE_INTERVAL = 30 * 1000; // 30 seconds
    if (timeSinceLastUpdate >= NOW_PLAYING_UPDATE_INTERVAL) {
      if (this.currentTrack && isActuallyPlaying) {
        // Double-check that music is still playing before updating
        const playerStore = usePlayerStore.getState();
        const audioIsPlaying = audioEngine.isPlaying();
        if (playerStore.isPlaying && audioIsPlaying) {
          this.updateNowPlaying(this.currentTrack, true).catch(console.error);
          this.lastNowPlayingUpdate = Date.now();
        }
      }
    }

    // Check if we should queue scrobble
    this.checkShouldScrobble();
  }

  /**
   * Stop tracking current track and clear now playing status
   * @param sendImmediately - If true, sends queued scrobbles immediately (for track end/skip).
   *                          If false, waits 30 seconds (for pause/stop).
   */
  stopTrack(sendImmediately: boolean = false): void {
    if (this.currentTrack) {
      debugLog('stopTrack() called', {
        trackId: this.currentTrack.id,
        title: this.currentTrack.title,
        playedTime: this.trackPlayedTime,
        hasQueuedScrobble: this.hasQueuedScrobble,
        sendImmediately,
      });

      // Clear now playing status when stopping
      // Last.fm doesn't have a clear API, but stopping tracking effectively clears it
      // The next track will update it when it starts playing
      this.clearNowPlaying();
    }
    // If no current track, this is expected (already stopped) - don't log

    // Cancel any existing stop timer
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    // Send queued scrobbles immediately if track ended or was skipped
    // Otherwise, wait 30 seconds (user might resume)
    if (sendImmediately) {
      debugLog('Sending queued scrobbles immediately (track ended or skipped)');
      this.sendQueuedScrobbles();
    } else {
      // Start timer to send queued scrobbles after 30 seconds of inactivity
      this.stopTimer = setTimeout(() => {
        this.sendQueuedScrobbles();
        this.stopTimer = null;
      }, 30000); // 30 seconds
    }

    this.currentTrack = null;
    this.trackStartTime = 0;
    this.trackPlayedTime = 0;
    this.hasQueuedScrobble = false;
    this.hasUpdatedNowPlaying = false;
    this.lastLoggedProgress = null; // Reset log tracking
    this.stopChecking();
  }

  /**
   * Clear now playing status on Last.fm
   * Last.fm doesn't have a direct "clear" API, so we just stop sending updates
   * The status will be cleared when a new track starts or the session expires
   */
  private async clearNowPlaying(): Promise<void> {
    // Reset the update flag so we don't send any more updates
    // Last.fm doesn't have a way to clear "now playing" directly
    // The status will be cleared when:
    // 1. A new track starts playing (updates now playing)
    // 2. The session expires (Last.fm clears it automatically)
    this.hasUpdatedNowPlaying = false;
    this.lastNowPlayingUpdate = 0;
    debugLog('Stopped sending now playing updates - status will clear when next track plays');
  }

  /**
   * Update now playing status
   * Only updates if music is actually playing
   * Always updates, even if already called (for track changes)
   */
  private async updateNowPlaying(track: Track, force: boolean = false): Promise<void> {
    if (this.hasUpdatedNowPlaying && !force) {
      debugLog('updateNowPlaying() already called, skipping');
      return;
    }

    // CRITICAL: Don't send "now playing" if music isn't actually playing
    const playerStore = usePlayerStore.getState();
    const isActuallyPlaying = playerStore.isPlaying;
    const audioIsPlaying = audioEngine.isPlaying();

    if (!isActuallyPlaying || !audioIsPlaying) {
      debugLog('Skipping now playing update - music is not actually playing', {
        storeIsPlaying: isActuallyPlaying,
        audioIsPlaying,
      });
      return;
    }

    const settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || !settings.sessionKey) {
      debugLog('Cannot update now playing: scrobbling disabled or no session key');
      return;
    }

    try {
      const credentials: LastFmCredentials = {
        username: settings.username,
        password: settings.password,
        apiKey: settings.apiKey,
        apiSecret: settings.apiSecret,
      };

      const artist = track.artist || track.bandName || 'Unknown Artist';
      const trackTitle = getDisplayTitle(track) || track.title || 'Unknown Track';
      const album = track.albumTitle || undefined;

      // Get actual current track from player store for comparison
      const actualCurrentTrack = usePlayerStore.getState().currentTrack;
      const actualArtist = actualCurrentTrack?.artist || actualCurrentTrack?.bandName || 'Unknown Artist';
      const actualTitle = actualCurrentTrack ? (getDisplayTitle(actualCurrentTrack) || actualCurrentTrack.title || 'Unknown Track') : 'No Track';

      // Get what's actually playing from audio engine
      const currentSrc = audioEngine?.getCurrentSrc?.() || null;
      const queueState = useQueueStore.getState();
      const actuallyPlayingTrack = currentSrc
        ? queueState.queue.find(t => t.streamUrl === currentSrc)
        : null;
      const actuallyPlayingTitle = actuallyPlayingTrack
        ? (getDisplayTitle(actuallyPlayingTrack) || actuallyPlayingTrack.title || 'Unknown Track')
        : 'Unknown';

      debugLog('=== UPDATING NOW PLAYING ===');
      debugLog('Last.fm will show:', { artist, track: trackTitle, album });
      debugLog('Player bar shows:', { artist: actualArtist, track: actualTitle, trackId: actualCurrentTrack?.id });
      debugLog('Audio engine actually playing:', {
        track: actuallyPlayingTitle,
        trackId: actuallyPlayingTrack?.id,
        src: currentSrc?.substring(0, 50),
      });

      // Compare player bar title to actually playing track
      if (actuallyPlayingTrack && actualCurrentTrack) {
        if (actuallyPlayingTrack.id !== actualCurrentTrack.id) {
          console.error('[ScrobblingService] ERROR: Player bar shows different track than what is actually playing!', {
            playerBarTrackId: actualCurrentTrack.id,
            playerBarTitle: actualTitle,
            actuallyPlayingTrackId: actuallyPlayingTrack.id,
            actuallyPlayingTitle: actuallyPlayingTitle,
            playerBarArtist: actualArtist,
            actuallyPlayingArtist: actuallyPlayingTrack.artist || actuallyPlayingTrack.bandName,
          });
        } else {
          debugLog('Track verification: Player bar matches actually playing track ✓');
        }
      }

      if (actualCurrentTrack?.id !== track.id) {
        console.warn('[ScrobblingService] WARNING: Track mismatch! Scrobbling track ID', track.id, 'but player has track ID', actualCurrentTrack?.id);
      }

      await updateNowPlaying(settings.sessionKey, credentials, {
        artist,
        track: trackTitle,
        album,
      });

      debugLog('Now playing updated successfully on Last.fm');
      this.hasUpdatedNowPlaying = true;
    } catch (error) {
      console.warn('[ScrobblingService] Failed to update now playing:', error);
      debugLog('Failed to update now playing', error);
    }
  }

  /**
   * Check if track meets scrobbling criteria
   * Last.fm rules: 50% of duration OR 4 minutes (240s), whichever is SHORTER
   */
  private checkShouldScrobble(): void {
    if (!this.currentTrack) {
      // This is expected when no track is playing - don't log
      return;
    }

    if (this.hasQueuedScrobble) {
      // Don't log every time - only log once when first detected
      return;
    }

    const settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || !settings.sessionKey) {
      // Don't log - this is expected when disabled
      return;
    }

    const trackDuration = this.currentTrack.duration || 0;
    const playedTime = this.trackPlayedTime;

    // Last.fm rules:
    // 1. Track must be at least 30 seconds long (minimum track duration)
    // 2. Must have played for at least 50% of duration OR 4 minutes (240s), whichever is SHORTER
    //    - For a 401 second track: 50% = 200.5s, 4min = 240s → scrobbles at ~200s ✓
    //    - For a 14 minute track: 50% = 420s, 4min = 240s → scrobbles at 240s (4 min) ✓
    // Note: 30 seconds is the MINIMUM TRACK LENGTH, not the play time requirement

    if (trackDuration < settings.minDuration) {
      // Track too short to scrobble (less than 30 seconds)
      return;
    }

    // Calculate minimum play time based on Last.fm rules
    // Use 50% of duration OR 4 minutes (240s), whichever is SHORTER
    const percentBasedTime = (trackDuration * settings.minPlayPercent) / 100;
    const LASTFM_MAX_PLAY_TIME = 240; // 4 minutes in seconds (Last.fm maximum)
    const minPlayTime = Math.min(percentBasedTime, LASTFM_MAX_PLAY_TIME);

    // Only log once when we get close (within 10 seconds) and then when criteria is met
    // This reduces console spam
    const timeUntilScrobble = minPlayTime - playedTime;
    const isClose = timeUntilScrobble <= 10 && timeUntilScrobble > 0;
    const criteriaMet = playedTime >= minPlayTime;

    // Log only:
    // 1. Once when we get close (within 10 seconds)
    // 2. When criteria is met
    // 3. Not more than once per 5 seconds
    const shouldLogNow = (isClose || criteriaMet) && (
      this.lastLoggedProgress === null ||
      criteriaMet ||
      (playedTime - this.lastLoggedProgress) >= 5
    );

    if (shouldLogNow) {
      debugLog('Checking scrobble criteria', {
        trackId: this.currentTrack.id,
        duration: Math.floor(trackDuration),
        playedTime: Math.floor(playedTime),
        minPlayPercent: settings.minPlayPercent,
        calculatedMinPlayTime: Math.floor(minPlayTime),
        timeUntilScrobble: Math.floor(timeUntilScrobble),
        meetsCriteria: criteriaMet,
        note: 'Last.fm: 50% of duration OR 4 minutes, whichever is shorter',
      });
      this.lastLoggedProgress = playedTime;
    }

    if (criteriaMet) {
      debugLog('Criteria met! Queueing scrobble (will send when music stops)', {
        playedTime: Math.floor(playedTime),
        requiredTime: Math.floor(minPlayTime),
        duration: Math.floor(trackDuration),
        rule: `50% (${Math.floor(percentBasedTime)}s) OR 4min (240s) = ${Math.floor(minPlayTime)}s`,
      });
      this.lastLoggedProgress = null; // Reset for next track
      this.queueScrobble();
      // Continue updating "now playing" even after scrobble is queued
      // This ensures Last.fm knows the track is still playing
      if (this.currentTrack) {
        this.updateNowPlaying(this.currentTrack, true).catch(console.error);
      }
    }
  }

  /**
   * Check if this track was recently scrobbled
   * This prevents duplicate scrobbles on page reload/hot reload
   * But allows legitimate re-scrobbles when user plays the track again after some time
   */
  private async wasTrackScrobbled(trackId: number, timestamp: number): Promise<boolean> {
    try {
      const now = Date.now();
      // Check for scrobbles within the last 5 minutes (catches hot-reloads and page reloads)
      // This is more lenient than exact timestamp matching to catch reloads
      const fiveMinutesAgo = now - (5 * 60 * 1000);

      // Query all scrobbled tracks for this trackId
      const allScrobbles = await db.scrobbledTracks
        .where('trackId')
        .equals(trackId)
        .toArray();

      // First check for exact timestamp match (within 10 seconds tolerance for clock drift)
      // This catches page reloads where the same track is still playing with similar start time
      const tolerance = 10; // 10 seconds tolerance (increased for hot-reload)
      const minTimestamp = timestamp - tolerance;
      const maxTimestamp = timestamp + tolerance;

      const exactMatch = allScrobbles.find(
        (s) => s.timestamp >= minTimestamp && s.timestamp <= maxTimestamp
      );

      if (exactMatch) {
        debugLog('Exact timestamp match found - same play session already scrobbled, preventing duplicate', {
          trackId,
          timestamp,
          matchedTimestamp: exactMatch.timestamp,
          timeDiff: Math.abs(timestamp - exactMatch.timestamp),
          scrobbledAt: new Date(exactMatch.scrobbledAt).toISOString(),
        });
        return true;
      }

      // Also check for recent scrobbles (within last 30 seconds) to catch hot-reloads
      // where the timestamp might be slightly different but it's the same play session
      // Use a much tighter window (30 seconds) to only catch actual reloads, not legitimate re-plays
      const thirtySecondsAgo = now - (30 * 1000);
      const recentScrobbles = allScrobbles.filter(
        (s) => s.scrobbledAt >= thirtySecondsAgo
      );

      if (recentScrobbles.length > 0) {
        // If there's a very recent scrobble (within 30 seconds) and the timestamp is very close
        // (within 30 seconds), it's likely a duplicate from hot-reload
        // This tight window prevents legitimate re-plays from being blocked
        const thirtySecondsAgoTimestamp = timestamp - 30;
        const thirtySecondsFromNowTimestamp = timestamp + 30;

        const likelyDuplicate = recentScrobbles.find(
          (s) => s.timestamp >= thirtySecondsAgoTimestamp && s.timestamp <= thirtySecondsFromNowTimestamp
        );

        if (likelyDuplicate) {
          debugLog('Very recent scrobble found - likely duplicate from hot-reload, preventing duplicate', {
            trackId,
            timestamp,
            recentScrobbles: recentScrobbles.length,
            matchedTimestamp: likelyDuplicate.timestamp,
            timeSinceScrobble: Math.floor((now - likelyDuplicate.scrobbledAt) / 1000) + ' seconds',
            timeDiff: Math.abs(timestamp - likelyDuplicate.timestamp) + ' seconds',
          });
          return true;
        }
      }

      // No match = this is a new play session, allow scrobbling
      return false;
    } catch (error) {
      console.warn('[ScrobblingService] Failed to check scrobbled tracks:', error);
      return false; // If check fails, allow scrobbling (better than blocking)
    }
  }

  /**
   * Mark a track as scrobbled in the database
   * This is called IMMEDIATELY when scrobbling to prevent duplicates on hot-reload
   */
  private async markTrackAsScrobbled(track: Track, timestamp: number): Promise<void> {
    try {
      const artist = track.artist || track.bandName || 'Unknown Artist';
      const trackTitle = getDisplayTitle(track) || track.title || 'Unknown Track';
      const album = track.albumTitle || undefined;

      // Check if already exists (race condition protection)
      const existing = await db.scrobbledTracks
        .where('trackId')
        .equals(track.id)
        .and((s) => {
          const tolerance = 10;
          return s.timestamp >= timestamp - tolerance && s.timestamp <= timestamp + tolerance;
        })
        .first();

      if (existing) {
        debugLog('Track already marked as scrobbled in database, skipping duplicate mark', {
          trackId: track.id,
          timestamp,
          existingTimestamp: existing.timestamp,
        });
        return;
      }

      await db.scrobbledTracks.add({
        trackId: track.id,
        artist,
        track: trackTitle,
        album,
        timestamp,
        scrobbledAt: Date.now(),
      });

      debugLog('Track saved to database', {
        trackId: track.id,
        timestamp,
        artist,
        track: trackTitle,
      });

      // Clean up old scrobbled tracks (older than 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      await db.scrobbledTracks
        .where('scrobbledAt')
        .below(oneDayAgo)
        .delete();
    } catch (error) {
      console.warn('[ScrobblingService] Failed to mark track as scrobbled:', error);
      // Non-fatal, continue
    }
  }

  /**
   * Queue a scrobble (don't send yet - will send when music stops)
   */
  private async queueScrobble(): Promise<void> {
    if (!this.currentTrack) {
      return;
    }

    if (this.hasQueuedScrobble) {
      debugLog('queueScrobble() called but already queued');
      return;
    }

    // Always verify we're tracking the correct track
    const actualCurrentTrack = usePlayerStore.getState().currentTrack;
    if (actualCurrentTrack && actualCurrentTrack.id !== this.currentTrack.id) {
      debugLog('Track mismatch in queueScrobble - using actual track', {
        trackingTrackId: this.currentTrack.id,
        actualTrackId: actualCurrentTrack.id,
      });
      this.currentTrack = actualCurrentTrack;
    }

    const settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || !settings.sessionKey) {
      debugLog('Cannot queue scrobble: scrobbling disabled or no session key');
      return;
    }

    // CRITICAL: Check if currentTrack is still valid (might have been cleared)
    if (!this.currentTrack) {
      debugLog('Cannot queue scrobble: currentTrack is null');
      return;
    }

    // Double-check if this exact play session was already scrobbled (race condition protection)
    const wasAlreadyScrobbled = await this.wasTrackScrobbled(this.currentTrack.id, this.trackStartTime);
    if (wasAlreadyScrobbled) {
      debugLog('This play session already scrobbled, skipping duplicate');
      this.hasQueuedScrobble = true;
      return;
    }

    this.hasQueuedScrobble = true;

    // Mark as scrobbled in database IMMEDIATELY (before queuing)
    // This prevents duplicates on hot-reload/page-reload
    await this.markTrackAsScrobbled(this.currentTrack, this.trackStartTime);
    debugLog('Track marked as scrobbled in database (queued for later sending)');

    // CRITICAL: Create a copy of track data to avoid reference issues
    // Store essential track data, not the reference (which might become null)
    const trackData: Track = {
      ...this.currentTrack,
    };

    // Add to queue (will be sent when music stops for 30+ seconds)
    this.queuedScrobbles.push({
      track: trackData,
      timestamp: this.trackStartTime,
      queuedAt: Date.now(),
    });

    debugLog('Scrobble queued (will send when music stops for 30+ seconds)', {
      trackId: trackData.id,
      title: trackData.title,
      timestamp: this.trackStartTime,
      queueSize: this.queuedScrobbles.length,
    });
  }

  /**
   * Send all queued scrobbles to Last.fm
   * Called when music stops for 30+ seconds
   */
  private async sendQueuedScrobbles(): Promise<void> {
    if (this.queuedScrobbles.length === 0) {
      debugLog('No queued scrobbles to send');
      return;
    }

    const settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || !settings.sessionKey) {
      debugLog('Cannot send queued scrobbles: scrobbling disabled or no session key');
      return;
    }

    debugLog(`Sending ${this.queuedScrobbles.length} queued scrobble(s) to Last.fm`);

    const credentials: LastFmCredentials = {
      username: settings.username,
      password: settings.password,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
    };

    const scrobblesToSend = [...this.queuedScrobbles];
    this.queuedScrobbles = []; // Clear queue

    for (const queued of scrobblesToSend) {
      try {
        // CRITICAL: Skip if track is null (might have been cleared)
        if (!queued.track) {
          console.warn('[ScrobblingService] Skipping queued scrobble - track is null', {
            timestamp: queued.timestamp,
            queuedAt: new Date(queued.queuedAt).toISOString(),
          });
          continue;
        }

        const artist = queued.track.artist || queued.track.bandName || 'Unknown Artist';
        const trackTitle = getDisplayTitle(queued.track) || queued.track.title || 'Unknown Track';
        const album = queued.track.albumTitle || undefined;

        debugLog('Sending queued scrobble to Last.fm', {
          artist,
          track: trackTitle,
          album,
          timestamp: queued.timestamp,
          queuedAt: new Date(queued.queuedAt).toISOString(),
        });

        await scrobbleTrack(settings.sessionKey, credentials, {
          artist,
          track: trackTitle,
          album,
          timestamp: queued.timestamp,
        });

        debugLog('Queued scrobble sent successfully', { artist, track: trackTitle });
      } catch (error) {
        console.error('[ScrobblingService] Failed to send queued scrobble:', error);
        debugLog('Queued scrobble failed, adding to pending retry queue', error);

        // Add to pending scrobbles for retry (only if track is valid)
        if (queued.track) {
          this.pendingScrobbles.push({
            track: queued.track,
            timestamp: queued.timestamp,
            retryCount: 0,
          });
        }
      }
    }

    debugLog(`Finished sending queued scrobbles. ${this.pendingScrobbles.length} failed and added to retry queue`);
  }


  /**
   * Start checking if we should scrobble
   */
  private startChecking(): void {
    this.stopChecking();
    debugLog('Starting scrobble check interval');
    // Check every 5 seconds
    this.checkInterval = setInterval(() => {
      this.checkShouldScrobble();
    }, 5000);
  }

  /**
   * Stop checking
   */
  private stopChecking(): void {
    if (this.checkInterval) {
      debugLog('Stopping scrobble check interval');
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Retry failed scrobbles
   */
  async retryFailedScrobbles(): Promise<void> {
    let settings = useSettingsStore.getState().lastfm;
    if (!settings.enabled || this.pendingScrobbles.length === 0) {
      return;
    }

    // Try to re-authenticate if session is missing or might be expired
    if (!settings.sessionKey) {
      if (!settings.username || !settings.password || !settings.apiKey || !settings.apiSecret) {
        console.warn('[ScrobblingService] Cannot retry: missing credentials');
        return;
      }

      try {
        const session = await authenticateLastFm({
          username: settings.username,
          password: settings.password,
          apiKey: settings.apiKey,
          apiSecret: settings.apiSecret,
        });
        useSettingsStore.getState().setLastFmSessionKey(session.sessionKey);
        useSettingsStore.getState().setLastFmConnectionStatus('connected');

        // Get updated settings with new session key
        settings = useSettingsStore.getState().lastfm;
      } catch (error) {
        console.error('[ScrobblingService] Re-authentication failed:', error);
        return;
      }
    }

    if (!settings.sessionKey) {
      return;
    }

    const credentials: LastFmCredentials = {
      username: settings.username,
      password: settings.password,
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
    };

    const remaining: PendingScrobble[] = [];

    for (const pending of this.pendingScrobbles) {
      try {
        const artist = pending.track.artist || pending.track.bandName || 'Unknown Artist';
        const trackTitle = getDisplayTitle(pending.track) || pending.track.title || 'Unknown Track';
        const album = pending.track.albumTitle || undefined;

        await scrobbleTrack(settings.sessionKey, credentials, {
          artist,
          track: trackTitle,
          album,
          timestamp: pending.timestamp,
        });

        console.log('[ScrobblingService] Retried scrobble:', { artist, track: trackTitle });
      } catch (error) {
        console.error('[ScrobblingService] Retry failed:', error);
        pending.retryCount++;
        // Keep for retry if retry count < 5
        if (pending.retryCount < 5) {
          remaining.push(pending);
        }
      }
    }

    this.pendingScrobbles = remaining;
  }

  /**
   * Get pending scrobbles count
   */
  getPendingCount(): number {
    return this.pendingScrobbles.length;
  }

  /**
   * Clear pending scrobbles
   */
  clearPending(): void {
    this.pendingScrobbles = [];
  }

  /**
   * Start periodic retry for failed scrobbles
   */
  private startPeriodicRetry(): void {
    this.stopPeriodicRetry();
    this.retryInterval = setInterval(() => {
      if (this.pendingScrobbles.length > 0) {
        this.retryFailedScrobbles().catch(console.error);
      }
    }, RETRY_INTERVAL);
  }

  /**
   * Stop periodic retry
   */
  private stopPeriodicRetry(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }
}

// Singleton instance
export const scrobblingService = new ScrobblingService();
