/**
 * Data Export/Import UI component for Settings page
 */

import { useState, useRef } from 'react';
import { Download, Upload, Check, AlertCircle, Loader2, Music, Heart, Users, ListMusic, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLibraryStore, usePlaylistStore, useSettingsStore } from '@/lib/store';
import {
  exportData,
  downloadExport,
  importData,
  readFileAsString,
  type ExportOptions,
  type ImportResult,
} from '@/lib/utils/dataExport';

// ============================================
// Checkbox Component
// ============================================

interface CheckboxProps {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Checkbox({ id, label, description, icon, checked, onChange, disabled }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150',
        'border border-transparent',
        checked ? 'bg-rose/10 border-rose/20' : 'hover:bg-highlight-low',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={cn('shrink-0 mt-0.5', checked ? 'text-rose' : 'text-text/60')}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', checked ? 'text-text' : 'text-text/80')}>
            {label}
          </span>
        </div>
        {description && (
          <p className="text-xs text-text/50 mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150',
            checked
              ? 'bg-rose border-rose text-white'
              : 'border-text/30 hover:border-text/50'
          )}
        >
          {checked && <Check size={14} strokeWidth={3} />}
        </div>
      </div>
    </label>
  );
}

// ============================================
// Main Component
// ============================================

export function DataManagement() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export options
  const [exportLikes, setExportLikes] = useState(true);
  const [exportPlaylists, setExportPlaylists] = useState(true);
  const [exportFollowing, setExportFollowing] = useState(true);
  const [exportSettings, setExportSettings] = useState(true);

  // Status
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Get store data
  const { favoriteTracks, favoriteAlbums, favoriteArtists, init: initLibrary } = useLibraryStore();
  const { playlists, init: initPlaylists } = usePlaylistStore();
  const { audio, app, lastfm, setLastFmCredentials, setLastFmSessionKey, setLastFmConnectionStatus, setLastFmScrobbleCriteria, setLastFmEnabled } = useSettingsStore();

  // Counts for display
  const likeCount = favoriteTracks.length + favoriteAlbums.length;
  const playlistCount = playlists.length;
  const followingCount = favoriteArtists.length;

  // Handle export
  const handleExport = async () => {
    // Check if at least one option is selected
    if (!exportLikes && !exportPlaylists && !exportFollowing && !exportSettings && !exportLastfm) {
      return;
    }

    setIsExporting(true);
    setProgress('');
    setImportResult(null);

    try {
      const options: ExportOptions = {
        likes: exportLikes,
        playlists: exportPlaylists,
        following: exportFollowing,
        settings: exportSettings,
        lastfm: exportLastfm,
      };

      const data = await exportData(
        options,
        exportSettings ? { audio: audio as Record<string, unknown>, app: app as Record<string, unknown> } : undefined,
        exportLastfm ? (lastfm as Record<string, unknown>) : undefined,
        setProgress
      );

      downloadExport(data);
      setProgress('Export downloaded successfully!');
    } catch (e) {
      setProgress(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Process imported file
  const processFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setImportResult({
        success: false,
        imported: { tracks: 0, albums: 0, artists: 0, playlists: 0, settings: false },
        errors: ['Please select a .json backup file'],
      });
      return;
    }

    setIsImporting(true);
    setProgress('');
    setImportResult(null);

    try {
      const jsonString = await readFileAsString(file);
      const parsedData = JSON.parse(jsonString);
      const result = await importData(jsonString, setProgress);
      setImportResult(result);

      // Import settings if present
      if (parsedData.settings) {
        // Settings import is handled by the store persistence
        // The store will automatically pick up the imported data
      }

      // Import Last.fm credentials and settings if present
      if (parsedData.lastfm && typeof parsedData.lastfm === 'object') {
        const lastfmData = parsedData.lastfm as Record<string, unknown>;
        if (typeof lastfmData.username === 'string' &&
            typeof lastfmData.password === 'string' &&
            typeof lastfmData.apiKey === 'string' &&
            typeof lastfmData.apiSecret === 'string') {
          setLastFmCredentials(
            lastfmData.username,
            lastfmData.password,
            lastfmData.apiKey,
            lastfmData.apiSecret
          );
        }
        if (typeof lastfmData.sessionKey === 'string') {
          setLastFmSessionKey(lastfmData.sessionKey);
        }
        if (typeof lastfmData.connectionStatus === 'string') {
          setLastFmConnectionStatus(lastfmData.connectionStatus as 'disconnected' | 'connecting' | 'connected' | 'error');
        }
        if (typeof lastfmData.enabled === 'boolean') {
          setLastFmEnabled(lastfmData.enabled);
        }
        if (typeof lastfmData.minDuration === 'number' &&
            typeof lastfmData.minPlayPercent === 'number' &&
            typeof lastfmData.minPlayTime === 'number') {
          setLastFmScrobbleCriteria(
            lastfmData.minDuration,
            lastfmData.minPlayPercent,
            lastfmData.minPlayTime
          );
        }
      }

      // Reinitialize stores to pick up new data
      if (result.success) {
        await initLibrary();
        await initPlaylists();
      }
    } catch (e) {
      setImportResult({
        success: false,
        imported: { tracks: 0, albums: 0, artists: 0, playlists: 0, settings: false },
        errors: [e instanceof Error ? e.message : 'Unknown error'],
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle import file selection
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selected via input
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isExporting && !isImporting) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isExporting || isImporting) return;

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const isAnyExportSelected = exportLikes || exportPlaylists || exportFollowing || exportSettings || exportLastfm;

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-rose" />
          <h3 className="text-sm font-semibold text-text">Export Data</h3>
        </div>

        <p className="text-xs text-text/60">
          Choose what to include in your backup file. Custom playlist covers are always included.
        </p>

        <div className="space-y-2">
          <Checkbox
            id="export-likes"
            label="Liked Songs & Albums"
            description={`${likeCount} items`}
            icon={<Heart size={18} />}
            checked={exportLikes}
            onChange={setExportLikes}
            disabled={isExporting || isImporting}
          />

          <Checkbox
            id="export-playlists"
            label="Playlists"
            description={`${playlistCount} playlists`}
            icon={<ListMusic size={18} />}
            checked={exportPlaylists}
            onChange={setExportPlaylists}
            disabled={isExporting || isImporting}
          />

          <Checkbox
            id="export-following"
            label="Following"
            description={`${followingCount} artists`}
            icon={<Users size={18} />}
            checked={exportFollowing}
            onChange={setExportFollowing}
            disabled={isExporting || isImporting}
          />

          <Checkbox
            id="export-settings"
            label="Settings"
            description="Audio & app preferences"
            icon={<Settings size={18} />}
            checked={exportSettings}
            onChange={setExportSettings}
            disabled={isExporting || isImporting}
          />

          <Checkbox
            id="export-lastfm"
            label="Last.fm Login"
            description="Credentials & scrobbling settings"
            icon={<Music size={18} />}
            checked={exportLastfm}
            onChange={setExportLastfm}
            disabled={isExporting || isImporting}
          />
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || isImporting || !isAnyExportSelected}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
            'font-medium text-sm transition-all duration-150',
            isAnyExportSelected && !isExporting && !isImporting
              ? 'bg-rose text-white hover:bg-rose/90'
              : 'bg-highlight-low text-text/40 cursor-not-allowed'
          )}
        >
          {isExporting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download size={18} />
              Export to File
            </>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Import Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload size={18} className="text-foam" />
          <h3 className="text-sm font-semibold text-text">Import Data</h3>
        </div>

        <p className="text-xs text-text/60">
          Import a backup file to add data to your library. Existing data will not be replaced.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          onClick={!isExporting && !isImporting ? handleImportClick : undefined}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl',
            'font-medium text-sm transition-all duration-200',
            'border-2 border-dashed',
            isExporting || isImporting
              ? 'border-text/10 text-text/40 cursor-not-allowed'
              : isDragging
                ? 'border-foam bg-foam/10 text-foam scale-[1.02]'
                : 'border-foam/30 text-foam hover:border-foam/50 hover:bg-foam/5 cursor-pointer'
          )}
        >
          {isImporting ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              <span>Importing...</span>
            </>
          ) : isDragging ? (
            <>
              <Upload size={24} />
              <span>Drop file here</span>
            </>
          ) : (
            <>
              <Upload size={24} />
              <span>Click or drag & drop backup file</span>
              <span className="text-xs text-text/40 font-normal">.json file</span>
            </>
          )}
        </div>
      </div>

      {/* Progress / Result */}
      {(progress || importResult) && (
        <div className={cn(
          'p-4 rounded-xl',
          importResult?.success === false ? 'bg-love/10' : 'bg-foam/10'
        )}>
          {progress && !importResult && (
            <p className="text-sm text-text/80">{progress}</p>
          )}

          {importResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {importResult.success ? (
                  <>
                    <Check size={18} className="text-foam" />
                    <span className="text-sm font-medium text-foam">Import Complete</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} className="text-love" />
                    <span className="text-sm font-medium text-love">Import Failed</span>
                  </>
                )}
              </div>

              {importResult.success && (
                <ul className="text-xs text-text/60 space-y-1 pl-6">
                  {importResult.imported.tracks > 0 && (
                    <li className="flex items-center gap-1">
                      <Music size={12} /> {importResult.imported.tracks} tracks added
                    </li>
                  )}
                  {importResult.imported.albums > 0 && (
                    <li className="flex items-center gap-1">
                      <Heart size={12} /> {importResult.imported.albums} albums added
                    </li>
                  )}
                  {importResult.imported.artists > 0 && (
                    <li className="flex items-center gap-1">
                      <Users size={12} /> {importResult.imported.artists} artists added
                    </li>
                  )}
                  {importResult.imported.playlists > 0 && (
                    <li className="flex items-center gap-1">
                      <ListMusic size={12} /> {importResult.imported.playlists} playlists added
                    </li>
                  )}
                  {importResult.imported.tracks === 0 &&
                   importResult.imported.albums === 0 &&
                   importResult.imported.artists === 0 &&
                   importResult.imported.playlists === 0 && (
                    <li className="text-text/40">No new items to import (all already exist)</li>
                  )}
                </ul>
              )}

              {importResult.errors.length > 0 && (
                <ul className="text-xs text-love/80 space-y-1 pl-6">
                  {importResult.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

