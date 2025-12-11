import { useState, useRef, useEffect } from 'react';
import { Image, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, usePlaylistStore, useRouterStore } from '@/lib/store';
import { BaseModal, ModalButton, ModalButtonGroup } from './BaseModal';

export function PlaylistModal() {
  const {
    playlistModalOpen,
    playlistModalMode,
    pendingTrackForPlaylist,
    editingPlaylist,
    closePlaylistModal,
  } = useUIStore();
  const { createPlaylist, updatePlaylist, addTrackToPlaylist, isPlaylistNameTaken } = usePlaylistStore();
  const { navigate } = useRouterStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = playlistModalMode === 'edit';

  // Validate name as user types
  const handleNameChange = (value: string) => {
    setName(value);

    if (!value.trim()) {
      setNameError(null);
      return;
    }

    // Check for duplicate (exclude current playlist if editing)
    const excludeId = isEditMode ? editingPlaylist?.id : undefined;
    if (isPlaylistNameTaken(value.trim(), excludeId)) {
      setNameError(`"${value.trim()}" already exists`);
    } else {
      setNameError(null);
    }
  };

  // Focus input when modal opens
  useEffect(() => {
    if (playlistModalOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [playlistModalOpen]);

  // Populate form when editing
  useEffect(() => {
    if (playlistModalOpen) {
      if (isEditMode && editingPlaylist) {
        setName(editingPlaylist.name);
        setDescription(editingPlaylist.description || '');
        setCoverImage(editingPlaylist.coverImage);
      } else {
        setName('');
        setDescription('');
        setCoverImage(undefined);
      }
      setError(null);
      setNameError(null);
    }
  }, [playlistModalOpen, isEditMode, editingPlaylist]);

  // Reset form when modal closes
  useEffect(() => {
    if (!playlistModalOpen) {
      setName('');
      setDescription('');
      setCoverImage(undefined);
      setError(null);
      setNameError(null);
    }
  }, [playlistModalOpen]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError('Please enter a name');
      return;
    }

    if (nameError) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditMode && editingPlaylist) {
        // Update existing playlist
        await updatePlaylist(editingPlaylist.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          coverImage,
        });
        closePlaylistModal();
      } else {
        // Create new playlist
        const playlistId = await createPlaylist(name.trim(), description.trim() || undefined, coverImage);

        // If there's a pending track, add it to the new playlist
        if (pendingTrackForPlaylist) {
          await addTrackToPlaylist(playlistId, pendingTrackForPlaylist as any);
        }

        closePlaylistModal();
        navigate({ name: 'playlist', id: playlistId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      console.error('[PlaylistModal] Error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

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

  return (
    <BaseModal
      isOpen={playlistModalOpen}
      onClose={closePlaylistModal}
      title={isEditMode ? 'Edit Playlist' : 'Create Playlist'}
      footer={
        <ModalButtonGroup>
          <ModalButton onClick={closePlaylistModal} variant="secondary">
            Cancel
          </ModalButton>
          <ModalButton
            onClick={handleSubmit}
            variant="primary"
            disabled={isSubmitting || !name.trim() || !!nameError}
          >
            {isSubmitting
              ? (isEditMode ? 'Saving...' : 'Creating...')
              : (isEditMode ? 'Save' : 'Create')
            }
          </ModalButton>
        </ModalButtonGroup>
      }
    >
      <div className="space-y-5">
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
                <span className="text-xs">{isEditMode ? 'Change Cover' : 'Add Cover'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Name Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="playlist-name" className="text-sm font-medium text-text">
              Name <span className="text-love">*</span>
            </label>
            {nameError && (
              <span className="text-xs text-love">{nameError}</span>
            )}
          </div>
          <input
            ref={nameInputRef}
            id="playlist-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My awesome playlist"
            maxLength={100}
            className={cn(
              'w-full px-4 py-2.5 rounded-xl',
              'bg-base border',
              'text-text placeholder:text-text/60',
              'focus:outline-none focus:ring-1',
              'transition-colors duration-200',
              nameError
                ? 'border-love focus:border-love focus:ring-love'
                : 'border-highlight-low focus:border-rose focus:ring-rose'
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
      </div>
    </BaseModal>
  );
}

// Legacy export for backwards compatibility
export { PlaylistModal as CreatePlaylistModal };
