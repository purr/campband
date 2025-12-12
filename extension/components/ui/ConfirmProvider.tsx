import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { HeartOff, UserMinus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BaseModal, ModalButton, ModalButtonGroup, type BaseModalRef } from './BaseModal';

type ConfirmVariant = 'danger' | 'warning' | 'primary';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: ReactNode;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return context.confirm;
}

// ============================================
// Specialized confirm functions for unlike/unfollow
// ============================================

export function useUnlikeConfirm() {
  const confirm = useConfirm();

  return {
    confirmUnlikeTrack: (trackTitle: string) => confirm({
      title: 'Unlike Song',
      message: `Remove "${trackTitle}" from your liked songs?`,
      confirmText: 'Unlike',
      variant: 'danger',
      icon: <HeartOff size={24} />,
    }),
    confirmUnlikeAlbum: (albumTitle: string) => confirm({
      title: 'Unlike Album',
      message: `Remove "${albumTitle}" from your liked albums?`,
      confirmText: 'Unlike',
      variant: 'danger',
      icon: <HeartOff size={24} />,
    }),
    confirmUnfollowArtist: (artistName: string) => confirm({
      title: 'Unfollow Artist',
      message: `Stop following "${artistName}"?`,
      confirmText: 'Unfollow',
      variant: 'danger',
      icon: <UserMinus size={24} />,
    }),
    confirmDeletePlaylist: (playlistName: string) => confirm({
      title: 'Delete Playlist',
      message: `Are you sure you want to delete "${playlistName}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      icon: <Trash2 size={24} />,
    }),
  };
}

// ============================================
// Provider Component
// ============================================

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}

const defaultState: ConfirmState = {
  isOpen: false,
  options: {
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'danger',
  },
  resolve: null,
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(defaultState);
  const modalRef = useRef<BaseModalRef>(null);
  const pendingResult = useRef<boolean>(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve; // Store in ref to avoid stale closure
      setState({
        isOpen: true,
        options: {
          ...options,
          confirmText: options.confirmText || 'Confirm',
          cancelText: options.cancelText || 'Cancel',
          variant: options.variant || 'danger',
        },
        resolve,
      });
    });
  }, []);

  // Called by buttons - triggers animated close
  const handleButtonClick = useCallback((result: boolean) => {
    pendingResult.current = result;
    modalRef.current?.close();
  }, []);

  // Called by BaseModal after animation completes
  const handleClose = useCallback(() => {
    // Use ref to ensure we always have the current resolve function
    resolveRef.current?.(pendingResult.current);
    resolveRef.current = null;
    pendingResult.current = false;
    setState(defaultState);
  }, []);

  // Handle Enter key to confirm
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleButtonClick(true);
    }
  }, [handleButtonClick]);

  const variantStyles = {
    danger: {
      bg: 'bg-love/10',
      text: 'text-love',
      border: 'border-love/20',
    },
    warning: {
      bg: 'bg-gold/10',
      text: 'text-gold',
      border: 'border-gold/20',
    },
    primary: {
      bg: 'bg-rose/10',
      text: 'text-rose',
      border: 'border-rose/20',
    },
  };

  const styles = variantStyles[state.options.variant || 'danger'];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <BaseModal
        ref={modalRef}
        isOpen={state.isOpen}
        onClose={handleClose}
        title={state.options.title}
        maxWidth="max-w-sm"
        onKeyDown={handleKeyDown}
        footer={
          <ModalButtonGroup>
            <ModalButton onClick={() => handleButtonClick(false)} variant="secondary">
              {state.options.cancelText}
            </ModalButton>
            <ModalButton onClick={() => handleButtonClick(true)} variant="danger">
              {state.options.confirmText}
            </ModalButton>
          </ModalButtonGroup>
        }
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          {state.options.icon && (
            <div className={cn(
              'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
              'border',
              styles.bg,
              styles.text,
              styles.border
            )}>
              {state.options.icon}
            </div>
          )}

          {/* Message */}
          <p className="text-sm text-text/80 leading-relaxed pt-2">
            {state.options.message}
          </p>
        </div>
      </BaseModal>
    </ConfirmContext.Provider>
  );
}
