import { useEffect, useState, useImperativeHandle, forwardRef, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BaseModalRef {
  /** Trigger animated close */
  close: () => void;
}

export interface BaseModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when modal should close (after animation completes) */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Optional footer with action buttons - if not provided, no footer is rendered */
  footer?: ReactNode;
  /** Max width class (default: max-w-md) */
  maxWidth?: string;
  /** Whether clicking backdrop closes the modal (default: true) */
  closeOnBackdrop?: boolean;
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean;
  /** Whether to show the X close button (default: true) */
  showCloseButton?: boolean;
  /** Optional keyboard event handler for custom key handling */
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * Reusable modal with liquid glass styling.
 * Use this as the base for all modals in the app.
 *
 * To trigger an animated close from parent, use the ref:
 * ```tsx
 * const modalRef = useRef<BaseModalRef>(null);
 * modalRef.current?.close();
 * ```
 */
export const BaseModal = forwardRef<BaseModalRef, BaseModalProps>(function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  onKeyDown: externalKeyDown,
}, ref) {
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Enter animation when modal opens and focus the modal
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsVisible(true);
        // Focus the modal so keyboard events work
        backdropRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Reset visibility when closed
  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Animated close handler
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 150);
  };

  // Expose close method to parent via ref
  useImperativeHandle(ref, () => ({
    close: handleClose,
  }), []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Call external key handler first
    externalKeyDown?.(e);

    if (closeOnEscape && e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center',
        'bg-base/60 backdrop-blur-md',
        'transition-opacity duration-150',
        'outline-none', // Prevent focus ring
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className={cn(
          'w-full mx-4',
          maxWidth,
          'liquid-glass-glow rounded-2xl',
          'transition-[opacity,transform] duration-150',
          isVisible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 translate-y-4'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-text">
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-text/60 hover:text-text hover:bg-highlight-low transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className="px-6 pb-6 pt-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

// ============================================
// Modal Button Components (for consistency)
// ============================================

interface ModalButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
}

export function ModalButton({
  onClick,
  children,
  variant = 'secondary',
  disabled = false,
  className,
}: ModalButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 px-4 py-2.5 rounded-xl font-medium',
        'transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'secondary' && 'bg-highlight-low text-text hover:bg-highlight-med',
        variant === 'primary' && 'bg-rose text-base hover:bg-rose/90',
        variant === 'danger' && 'bg-love text-base hover:bg-love/90',
        className
      )}
    >
      {children}
    </button>
  );
}

export function ModalButtonGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      {children}
    </div>
  );
}

