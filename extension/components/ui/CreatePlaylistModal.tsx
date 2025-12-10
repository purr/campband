import { useState, useRef, useEffect } from 'react';
import { X, Image, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, usePlaylistStore, useRouterStore } from '@/lib/store';

export function CreatePlaylistModal() {
  const { createPlaylistModalOpen, closeCreatePlaylistModal, pendingTrackForPlaylist } = useUIStore();
  const { createPlaylist, addTrackToPlaylist } = usePlaylistStore();
  const { navigate } = useRouterStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState<string | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enter animation when modal opens
  useEffect(() => {
    if (createPlaylistModalOpen) {
      // Trigger enter animation after mount
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      // Focus after animation starts
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [createPlaylistModalOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!createPlaylistModalOpen) {
      setName('');
      setDescription('');
      setCoverImage(undefined);
      setError(null);
      setIsVisible(false);
    }
  }, [createPlaylistModalOpen]);

  // Animated close handler
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      closeCreatePlaylistModal();
    }, 150);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const playlistId = await createPlaylist(name.trim(), description.trim() || undefined, coverImage);

      // If there's a pending track, add it to the new playlist
      if (pendingTrackForPlaylist) {
        await addTrackToPlaylist(playlistId, pendingTrackForPlaylist as any);
      }

      closeCreatePlaylistModal();
      navigate({ name: 'playlist', id: playlistId });
    } catch (err) {
      setError('Failed to create playlist. Please try again.');
      console.error('[CreatePlaylistModal] Error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      setCoverImage(reader.result as string);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setCoverImage(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!createPlaylistModalOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-base/60 backdrop-blur-md',
        'transition-opacity duration-150',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          'w-full max-w-md mx-4',
          'liquid-glass-glow rounded-2xl',
          'transition-[opacity,transform] duration-150',
          isVisible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 translate-y-4'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-text">Create Playlist</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-text/60 hover:text-text hover:bg-highlight-low transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Cover Image */}
          <div className="flex justify-center">
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {coverImage ? (
                <div className="relative">
                  <img
                    src={coverImage}
                    alt="Playlist cover"
                    className="w-32 h-32 rounded-xl object-cover shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className={cn(
                      'absolute -top-2 -right-2 p-1 rounded-full',
                      'bg-love text-base shadow-lg',
                      'hover:bg-love/90 transition-colors'
                    )}
                    aria-label="Remove cover"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-32 h-32 rounded-xl',
                    'bg-highlight-low border-2 border-dashed border-highlight-med',
                    'flex flex-col items-center justify-center gap-2',
                    'text-text/60 hover:text-text hover:border-rose',
                    'transition-colors duration-200'
                  )}
                >
                  <Image size={24} />
                  <span className="text-xs">Add Cover</span>
                </button>
              )}
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label htmlFor="playlist-name" className="block text-sm font-medium text-text mb-2">
              Name <span className="text-love">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="playlist-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome playlist"
              maxLength={100}
              className={cn(
                'w-full px-4 py-2.5 rounded-xl',
                'bg-base border border-highlight-low',
                'text-text placeholder:text-text/60',
                'focus:outline-none focus:border-rose focus:ring-1 focus:ring-rose',
                'transition-colors duration-200'
              )}
            />
          </div>

          {/* Description Input */}
          <div>
            <label htmlFor="playlist-description" className="block text-sm font-medium text-text mb-2">
              Description <span className="text-text/60">(optional)</span>
            </label>
            <textarea
              id="playlist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              maxLength={500}
              rows={3}
              className={cn(
                'w-full px-4 py-2.5 rounded-xl resize-none',
                'bg-base border border-highlight-low',
                'text-text placeholder:text-text/60',
                'focus:outline-none focus:border-rose focus:ring-1 focus:ring-rose',
                'transition-colors duration-200'
              )}
            />
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-sm text-love">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl font-medium',
                'bg-highlight-low text-text',
                'hover:bg-highlight-med transition-colors duration-200'
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl font-medium',
                'bg-rose text-base',
                'hover:bg-rose/90 transition-colors duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

