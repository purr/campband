import { useState } from 'react';
import {
  Volume2,
  ChevronDown,
  Info,
  Waves,
  AudioLines,
  Headphones,
  ExternalLink,
  Heart,
  Settings2,
  HeartOff,
  Database,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { DataManagement } from '@/components/settings/DataManagement';
import { EQ_FREQUENCIES, EQ_PRESETS, type EqBand, type EqPresetName } from '@/lib/audio';

export function SettingsPage() {
  return (
    <div className="min-h-full pb-8">
      <PageHeader />

      <div className="px-8 py-6 space-y-6">
        {/* Behavior Section */}
        <SettingsSection
          icon={<Settings2 size={22} />}
          title="Behavior"
          description="Confirmations and prompts"
          defaultOpen={true}
        >
          <div className="space-y-2">
            <BehaviorSettings />
          </div>
        </SettingsSection>

        {/* Audio Section */}
        <SettingsSection
          icon={<Headphones size={22} />}
          title="Audio"
          description="Playback and sound settings"
        >
          <div className="space-y-2">
            <CrossfadeSettings />
            <PlaybackSettings />
            <EqualizerSettings />
          </div>
        </SettingsSection>

        {/* Data Section */}
        <SettingsSection
          icon={<Database size={22} />}
          title="Data"
          description="Export and import your library"
        >
          <DataManagement />
        </SettingsSection>

        {/* About Section */}
        <SettingsSection
          icon={<Info size={22} />}
          title="About"
          description="CampBand information"
        >
          <AboutInfo />
        </SettingsSection>
      </div>
    </div>
  );
}

// ============================================
// Settings Section Container (Collapsible)
// ============================================

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SettingsSection({ icon, title, description, children, defaultOpen = false }: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="w-full">
      {/* Section Header - Clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-4 p-4 rounded-2xl',
          'bg-surface/50 hover:bg-surface/70',
          'border border-white/5 hover:border-white/10',
          'transition-all duration-200',
          'group cursor-pointer',
          isOpen && 'rounded-b-none border-b-0'
        )}
      >
        <div className={cn(
          'p-3 rounded-xl transition-colors duration-200',
          'bg-linear-to-br from-rose/20 to-iris/10',
          'text-rose group-hover:from-rose/30 group-hover:to-iris/20'
        )}>
          {icon}
        </div>
        <div className="flex-1 text-left">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-text/50">{description}</p>
        </div>
        <ChevronDown
          size={20}
          className={cn(
            'text-text/40 transition-transform duration-300',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Section Content - Animated */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className={cn(
          'p-4 pt-2',
          'bg-surface/30 rounded-b-2xl',
          'border border-t-0 border-white/5'
        )}>
          {children}
        </div>
      </div>
    </section>
  );
}

// ============================================
// Crossfade Settings
// ============================================

function CrossfadeSettings() {
  const {
    audio: { crossfadeEnabled, crossfadeDuration },
    setCrossfadeEnabled,
    setCrossfadeDuration,
  } = useSettingsStore();

  return (
    <SettingCard>
      <div className="flex items-center justify-between">
        <SettingInfo
          icon={<Waves size={18} />}
          title="Crossfade"
          description={crossfadeEnabled ? `${crossfadeDuration}s blend between tracks` : 'Smoothly blend between tracks'}
        />
        <Toggle checked={crossfadeEnabled} onChange={setCrossfadeEnabled} />
      </div>

      {/* Duration slider - animated expand */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          crossfadeEnabled ? 'max-h-32 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
        )}
      >
        <div className="pl-11">
          {/* Custom smooth slider */}
          <div className="relative h-8 flex items-center">
            {/* Track background */}
            <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full" />

            {/* Filled track */}
            <div
              className="absolute left-0 h-1.5 bg-linear-to-r from-rose to-rose/70 rounded-full transition-all duration-150 ease-out"
              style={{ width: `${((crossfadeDuration - 1) / 11) * 100}%` }}
            />

            {/* Invisible range input for interaction */}
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={crossfadeDuration}
              onChange={(e) => setCrossfadeDuration(parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Labels - every second */}
          <div className="flex justify-between text-[10px] text-text/40 mt-1 px-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
              <span
                key={s}
                className={cn(
                  'w-4 text-center',
                  s === crossfadeDuration && 'text-rose font-medium'
                )}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SettingCard>
  );
}

// ============================================
// Playback Settings
// ============================================

function PlaybackSettings() {
  const {
    audio: { gaplessPlayback, volumeNormalization },
    setGaplessPlayback,
    setVolumeNormalization,
  } = useSettingsStore();

  return (
    <>
      <SettingCard>
        <div className="flex items-center justify-between">
          <SettingInfo
            icon={<AudioLines size={18} />}
            title="Gapless Playback"
            description="Remove silence between tracks"
          />
          <Toggle checked={gaplessPlayback} onChange={setGaplessPlayback} />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between">
          <SettingInfo
            icon={<Volume2 size={18} />}
            title="Volume Normalization"
            description="Consistent volume across tracks"
          />
          <Toggle checked={volumeNormalization} onChange={setVolumeNormalization} />
        </div>
      </SettingCard>
    </>
  );
}

// ============================================
// Equalizer Settings
// ============================================

const EQ_PRESET_LABELS: Record<EqPresetName | 'custom', string> = {
  flat: 'Flat',
  bass: 'Bass Boost',
  treble: 'Treble',
  vocal: 'Vocal',
  rock: 'Rock',
  electronic: 'Electronic',
  acoustic: 'Acoustic',
  custom: 'Custom',
};

function EqualizerSettings() {
  const {
    audio: { eq },
    setEqEnabled,
    setEqPreset,
    setEqBand,
    resetEq,
  } = useSettingsStore();

  return (
    <SettingCard>
      <div className="flex items-center justify-between">
        <SettingInfo
          icon={<SlidersHorizontal size={18} />}
          title="Equalizer"
          description={eq.enabled ? EQ_PRESET_LABELS[eq.preset] : 'Adjust frequency response'}
        />
        <Toggle checked={eq.enabled} onChange={setEqEnabled} />
      </div>

      {/* Equalizer Panel - animated expand */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          eq.enabled ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
        )}
      >
        <div className="pl-11 space-y-4">
          {/* Preset selector */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EQ_PRESET_LABELS) as (EqPresetName | 'custom')[]).map((preset) => (
              <button
                key={preset}
                onClick={() => setEqPreset(preset)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium',
                  'transition-all duration-200',
                  'border',
                  eq.preset === preset
                    ? 'bg-rose/20 text-rose border-rose/30'
                    : 'bg-white/5 text-text/60 border-white/5 hover:bg-white/10 hover:text-text hover:border-white/10'
                )}
              >
                {EQ_PRESET_LABELS[preset]}
              </button>
            ))}
          </div>

          {/* EQ Bands */}
          <div className="bg-base/40 rounded-xl p-4 border border-white/5">
            {/* Zero line label */}
            <div className="flex justify-between text-[10px] text-text/30 mb-2 px-1">
              <span>+12 dB</span>
              <span>0 dB</span>
              <span>-12 dB</span>
            </div>

            <div className="flex justify-between items-stretch gap-1.5 h-32">
              {EQ_FREQUENCIES.map((freq) => (
                <EqBand
                  key={freq}
                  frequency={freq}
                  gain={eq.gains[freq]}
                  onChange={(gain) => setEqBand(freq, gain)}
                  disabled={eq.preset !== 'custom'}
                />
              ))}
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={resetEq}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg',
              'text-xs text-text/50 hover:text-text',
              'bg-white/5 hover:bg-white/10',
              'transition-all duration-200'
            )}
          >
            <RotateCcw size={12} />
            Reset to flat
          </button>
        </div>
      </div>
    </SettingCard>
  );
}

interface EqBandProps {
  frequency: number;
  gain: number;
  onChange: (gain: number) => void;
  disabled?: boolean;
}

function EqBand({ frequency, gain, onChange, disabled }: EqBandProps) {
  const label = frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
  const normalizedGain = (gain + 12) / 24; // 0 to 1

  return (
    <div className="flex-1 flex flex-col items-center gap-1 group">
      {/* Bar container */}
      <div className="relative w-full flex-1 flex flex-col justify-center">
        {/* Background */}
        <div className="absolute inset-x-1 inset-y-0 bg-white/5 rounded-sm" />

        {/* Zero line */}
        <div className="absolute inset-x-1 top-1/2 h-px bg-white/20" />

        {/* Active bar */}
        <div
          className={cn(
            'absolute inset-x-1 rounded-sm transition-all duration-150',
            gain >= 0 ? 'bg-rose/70' : 'bg-foam/70'
          )}
          style={{
            top: gain >= 0 ? `${(1 - normalizedGain) * 100}%` : '50%',
            bottom: gain >= 0 ? '50%' : `${normalizedGain * 100}%`,
          }}
        />

        {/* Invisible slider */}
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={gain}
          onChange={(e) => onChange(parseInt(e.target.value))}
          disabled={disabled}
          className={cn(
            'absolute inset-0 w-full h-full opacity-0',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
          }}
        />
      </div>

      {/* Frequency label */}
      <span className={cn(
        'text-[9px] tabular-nums transition-colors duration-150',
        'text-text/30 group-hover:text-text/60'
      )}>
        {label}
      </span>
    </div>
  );
}

// ============================================
// Behavior Settings
// ============================================

function BehaviorSettings() {
  const {
    app: { confirmOnUnlike },
    setConfirmOnUnlike,
  } = useSettingsStore();

  return (
    <SettingCard>
      <div className="flex items-center justify-between">
        <SettingInfo
          icon={<HeartOff size={18} />}
          title="Confirm on Unlike"
          description="Ask before removing from favorites"
        />
        <Toggle checked={confirmOnUnlike} onChange={setConfirmOnUnlike} />
      </div>
    </SettingCard>
  );
}

// ============================================
// About Info
// ============================================

function AboutInfo() {
  const credits = [
    {
      name: 'Rosé Pine',
      description: 'Beautiful dark theme',
      url: 'https://rosepinetheme.com',
    },
    {
      name: 'free-bandcamp-downloader',
      description: 'Bandcamp data extraction by 7x11x13',
      url: 'https://github.com/7x11x13/free-bandcamp-downloader',
    },
    {
      name: 'hidden-bandcamp-tracks',
      description: 'Hidden track detection by 7x11x13',
      url: 'https://github.com/7x11x13/hidden-bandcamp-tracks',
    },
  ];

  return (
    <div className="space-y-2">
      <SettingCard>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-text/40 mb-0.5">Version</p>
            <p className="text-sm font-medium text-text">1.0.0</p>
          </div>
          <div>
            <p className="text-xs text-text/40 mb-0.5">Framework</p>
            <p className="text-sm font-medium text-text">WXT + React</p>
          </div>
          <div>
            <p className="text-xs text-text/40 mb-0.5">Styling</p>
            <p className="text-sm font-medium text-text">Tailwind CSS</p>
          </div>
        </div>
      </SettingCard>

      <SettingCard>
        <p className="text-sm text-text/50 leading-relaxed">
          CampBand is a modern Bandcamp client that provides a Spotify-like experience
          for browsing and playing music. Built with <Heart size={12} className="inline text-love" fill="currentColor" /> using React and the Rosé Pine theme.
        </p>
      </SettingCard>

      {/* Credits Section */}
      <SettingCard>
        <div className="space-y-3">
          <p className="text-xs text-text/40 font-medium uppercase tracking-wider">Credits & Inspiration</p>
          <div className="space-y-2">
            {credits.map((credit) => (
              <a
                key={credit.name}
                href={credit.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center justify-between p-2.5 -mx-2 rounded-lg',
                  'hover:bg-white/5 transition-colors duration-150',
                  'group cursor-pointer'
                )}
              >
                <div>
                  <p className="text-sm font-medium text-text group-hover:text-rose transition-colors">
                    {credit.name}
                  </p>
                  <p className="text-xs text-text/40">{credit.description}</p>
                </div>
                <ExternalLink size={14} className="text-text/30 group-hover:text-rose transition-colors" />
              </a>
            ))}
          </div>
        </div>
      </SettingCard>
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
      'bg-white/[0.02] hover:bg-white/[0.04]',
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
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-12 h-7 rounded-full transition-all duration-300 ease-out',
        'focus:outline-none',
        checked
          ? 'bg-linear-to-r from-rose to-rose/80 shadow-lg shadow-rose/20'
          : 'bg-white/10 hover:bg-white/15'
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
