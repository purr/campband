/**
 * Last.fm Settings Component
 */

import { useState, useEffect } from 'react';
import { Music, Key, User, Lock, CheckCircle2, XCircle, Loader2, AlertCircle, ExternalLink, Clock, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { authenticateLastFm, type LastFmError } from '@/lib/api/lastfm';
import { scrobblingService } from '@/lib/scrobbling/scrobblingService';

export function LastFmSettings() {
  const {
    lastfm,
    setLastFmEnabled,
    setLastFmCredentials,
    setLastFmSessionKey,
    setLastFmConnectionStatus,
    setLastFmScrobbleCriteria,
  } = useSettingsStore();

  const [username, setUsername] = useState(lastfm.username);
  const [password, setPassword] = useState(lastfm.password);
  const [apiKey, setApiKey] = useState(lastfm.apiKey);
  const [apiSecret, setApiSecret] = useState(lastfm.apiSecret);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<{ message: string; statusCode?: number; errorCode?: number } | null>(null);

  // Sync local state with store when store changes
  useEffect(() => {
    setUsername(lastfm.username);
    setPassword(lastfm.password);
    setApiKey(lastfm.apiKey);
    setApiSecret(lastfm.apiSecret);
  }, [lastfm.username, lastfm.password, lastfm.apiKey, lastfm.apiSecret]);

  // Handle connection test
  const handleConnect = async () => {
    if (!username || !password || !apiKey || !apiSecret) {
      setConnectionError({ message: 'Please fill in all fields' });
      return;
    }

    // Save credentials immediately (so user doesn't lose them)
    setLastFmCredentials(username, password, apiKey, apiSecret);

    setIsConnecting(true);
    setConnectionError(null);
    setLastFmConnectionStatus('connecting');

    try {
      console.log('[LastFmSettings] Attempting to connect...');
      const session = await authenticateLastFm({
        username,
        password,
        apiKey,
        apiSecret,
      });

      console.log('[LastFmSettings] Connection successful');
      // Save session key on success
      setLastFmSessionKey(session.sessionKey);
      setLastFmConnectionStatus('connected');
      // Auto-enable scrobbling when connected
      setLastFmEnabled(true);
      setConnectionError(null);
    } catch (error) {
      console.error('[LastFmSettings] Connection error:', error);
      const lastFmError = error as LastFmError;
      setConnectionError({
        message: lastFmError.message || 'Connection failed',
        statusCode: lastFmError.statusCode,
        errorCode: lastFmError.errorCode,
      });
      setLastFmConnectionStatus('error');
      setLastFmSessionKey(null);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    setLastFmSessionKey(null);
    setLastFmConnectionStatus('disconnected');
    setLastFmEnabled(false);
  };

  // Handle retry failed scrobbles
  const handleRetryScrobbles = async () => {
    await scrobblingService.retryFailedScrobbles();
  };

  const pendingCount = scrobblingService.getPendingCount();
  const isConnected = lastfm.connectionStatus === 'connected' && lastfm.sessionKey !== null;
  const hasCredentials = username && password && apiKey && apiSecret;

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <SettingCard>
        <div className="flex items-center justify-between">
          <SettingInfo
            icon={<Music size={18} />}
            title="Last.fm Scrobbling"
            description={lastfm.enabled && isConnected ? 'Scrobbling tracks to Last.fm' : 'Scrobble tracks to Last.fm'}
          />
          <Toggle
            checked={lastfm.enabled}
            onChange={setLastFmEnabled}
            disabled={!isConnected}
          />
        </div>
      </SettingCard>

      {/* Connection Status */}
      {hasCredentials && (
        <SettingCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn(
                'p-2 rounded-lg shrink-0',
                isConnected ? 'bg-foam/20 text-foam' : lastfm.connectionStatus === 'error' ? 'bg-love/20 text-love' : 'bg-text/10 text-text/50'
              )}>
                {isConnected ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text">
                  {isConnected ? 'Connected' : lastfm.connectionStatus === 'error' ? 'Connection Failed' : 'Not Connected'}
                </p>
                {isConnected ? (
                  <p className="text-xs text-text/40">
                    Logged in as {lastfm.username}
                  </p>
                ) : lastfm.connectionStatus === 'error' && connectionError ? (
                  <div className="space-y-0.5">
                    <p className="text-xs text-love/90 break-all">
                      {connectionError.message}
                    </p>
                    {(connectionError.statusCode || connectionError.errorCode) && (
                      <p className="text-[10px] text-text/50">
                        {connectionError.statusCode && `HTTP ${connectionError.statusCode}`}
                        {connectionError.statusCode && connectionError.errorCode && ' • '}
                        {connectionError.errorCode && `Error ${connectionError.errorCode}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text/40">
                    Enter credentials and connect
                  </p>
                )}
              </div>
            </div>
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-white/5 hover:bg-white/10 text-text/60 hover:text-text',
                  'transition-all duration-200'
                )}
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting || !hasCredentials}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium',
                  'transition-all duration-200',
                  isConnecting || !hasCredentials
                    ? 'bg-white/5 text-text/40 cursor-not-allowed'
                    : 'bg-foam/20 text-foam hover:bg-foam/30'
                )}
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={14} className="inline animate-spin mr-1" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            )}
          </div>
        </SettingCard>
      )}

      {/* Credentials */}
      <div className="space-y-2">
        <SettingCard>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User size={16} className="text-text/50" />
              <label className="text-xs font-medium text-text/60">Username</label>
            </div>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your Last.fm username"
              disabled={isConnected}
            />
          </div>
        </SettingCard>

        <SettingCard>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-text/50" />
              <label className="text-xs font-medium text-text/60">Password</label>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your Last.fm password"
              disabled={isConnected}
            />
          </div>
        </SettingCard>

        <SettingCard>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-text/50" />
              <label className="text-xs font-medium text-text/60">API Key</label>
              <a
                href="https://www.last.fm/api/account/create"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-pine hover:text-rose transition-colors flex items-center gap-1"
              >
                Get API Key
                <ExternalLink size={12} />
              </a>
            </div>
            <Input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your Last.fm API key"
              disabled={isConnected}
            />
          </div>
        </SettingCard>

        <SettingCard>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-text/50" />
              <label className="text-xs font-medium text-text/60">API Secret</label>
            </div>
            <Input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Your Last.fm API secret"
              disabled={isConnected}
            />
          </div>
        </SettingCard>
      </div>

      {/* Scrobbling Criteria */}
      {isConnected && (
        <SettingCard>
          <div className="flex items-center justify-between">
            <SettingInfo
              icon={<Clock size={18} />}
              title="When to Scrobble"
              description={`Scrobble when ${lastfm.minPlayPercent}% played or ${lastfm.minPlayTime}s, whichever is shorter`}
            />
          </div>

          {/* Criteria sliders - animated expand */}
          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-out',
              'max-h-[500px] opacity-100 mt-4'
            )}
          >
            <div className="pl-11 space-y-4">
              <p className="text-xs text-text/50">
                Last.fm requires tracks to be at least 30 seconds long. Tracks will be scrobbled when they meet the minimum play percentage OR minimum play time, whichever is shorter.
              </p>

              {/* Minimum Duration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text/60">
                    Minimum Track Duration
                  </label>
                  <span className="text-xs text-text/40 font-medium">{lastfm.minDuration}s</span>
                </div>
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full" />
                  <div
                    className="absolute left-0 h-1.5 bg-linear-to-r from-rose to-rose/70 rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${Math.min(100, ((lastfm.minDuration - 30) / 570) * 100)}%` }}
                  />
                  <input
                    type="range"
                    min="30"
                    max="600"
                    step="10"
                    value={lastfm.minDuration}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 30;
                      setLastFmScrobbleCriteria(
                        value,
                        lastfm.minPlayPercent,
                        lastfm.minPlayTime
                      );
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-text/40 mt-1">
                  Last.fm minimum: 30 seconds
                </p>
              </div>

              {/* Minimum Play Percentage */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text/60 flex items-center gap-1.5">
                    <Percent size={12} />
                    Minimum Play Percentage
                  </label>
                  <span className="text-xs text-text/40 font-medium">{lastfm.minPlayPercent}%</span>
                </div>
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full" />
                  <div
                    className="absolute left-0 h-1.5 bg-linear-to-r from-rose to-rose/70 rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${((lastfm.minPlayPercent - 50) / 50) * 100}%` }}
                  />
                  <input
                    type="range"
                    min="50"
                    max="100"
                    step="5"
                    value={lastfm.minPlayPercent}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 50;
                      setLastFmScrobbleCriteria(
                        lastfm.minDuration,
                        value,
                        lastfm.minPlayTime
                      );
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-text/40 mt-1">
                  Last.fm minimum: 50% • Scrobble when {lastfm.minPlayPercent}% of track is played
                </p>
              </div>

              {/* Minimum Play Time */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text/60 flex items-center gap-1.5">
                    <Clock size={12} />
                    Alternative: Minimum Play Time
                  </label>
                  <span className="text-xs text-text/40 font-medium">{lastfm.minPlayTime}s</span>
                </div>
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full" />
                  <div
                    className="absolute left-0 h-1.5 bg-linear-to-r from-rose to-rose/70 rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${Math.min(100, ((lastfm.minPlayTime - 30) / 570) * 100)}%` }}
                  />
                  <input
                    type="range"
                    min="30"
                    max="600"
                    step="10"
                    value={lastfm.minPlayTime}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 30;
                      setLastFmScrobbleCriteria(
                        lastfm.minDuration,
                        lastfm.minPlayPercent,
                        value
                      );
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-text/40 mt-1">
                  Scrobble after {lastfm.minPlayTime}s OR {lastfm.minPlayPercent}% of track, whichever is shorter
                </p>
              </div>
            </div>
          </div>
        </SettingCard>
      )}

      {/* Pending Scrobbles */}
      {pendingCount > 0 && (
        <SettingCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="text-gold" />
              <div>
                <p className="text-sm font-medium text-text">
                  {pendingCount} failed scrobble{pendingCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-text/40">
                  Some tracks failed to scrobble and will be retried
                </p>
              </div>
            </div>
            <button
              onClick={handleRetryScrobbles}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium',
                'bg-gold/20 text-gold hover:bg-gold/30',
                'transition-all duration-200'
              )}
            >
              Retry Now
            </button>
          </div>
        </SettingCard>
      )}
    </div>
  );
}

// ============================================
// Shared Components
// ============================================

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      'p-4 rounded-xl',
      'bg-white/2 hover:bg-white/4',
      'border border-white/5 hover:border-white/10',
      'transition-all duration-200'
    )}>
      {children}
    </div>
  );
}

interface SettingInfoProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SettingInfo({ icon, title, description }: SettingInfoProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-white/5 text-text/50">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-text/40">{description}</p>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative w-12 h-7 rounded-full transition-all duration-300 ease-out',
        'focus:outline-none',
        checked
          ? 'bg-linear-to-r from-rose to-rose/80 shadow-lg shadow-rose/20'
          : 'bg-white/10 hover:bg-white/15',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 w-5 h-5 rounded-full',
          'bg-white shadow-md',
          'transition-all duration-300 ease-out',
          checked ? 'translate-x-5 scale-100' : 'translate-x-0 scale-95'
        )}
      />
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 rounded-lg',
        'bg-white/5 border border-white/10',
        'text-sm text-text placeholder:text-text/30',
        'focus:outline-none focus:border-rose/30 focus:bg-white/10',
        'transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  );
}
