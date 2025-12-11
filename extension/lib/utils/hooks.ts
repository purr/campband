/**
 * Shared React Hooks
 * Commonly used patterns extracted to reusable hooks
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for showing a temporary check/confirmation state
 * Commonly used for "Added to queue" or "Copied!" feedback
 *
 * @param duration - How long to show the check (default: 1500ms)
 * @returns [showCheck, triggerCheck] - state and trigger function
 *
 * @example
 * const [showCheck, triggerCheck] = useConfirmationState();
 *
 * const handleAdd = () => {
 *   addToQueue(track);
 *   triggerCheck();
 * };
 *
 * return showCheck ? <Check /> : <Plus />;
 */
export function useConfirmationState(duration: number = 1500): [boolean, () => void] {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (showCheck) {
      const timer = setTimeout(() => setShowCheck(false), duration);
      return () => clearTimeout(timer);
    }
  }, [showCheck, duration]);

  const triggerCheck = useCallback(() => {
    setShowCheck(true);
  }, []);

  return [showCheck, triggerCheck];
}

/**
 * Hook for click outside detection
 * Closes a popup/menu when clicking outside its ref
 *
 * @param ref - React ref to the element
 * @param onClose - Callback when clicked outside
 * @param isOpen - Whether the element is currently open
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onClose: () => void,
  isOpen: boolean
) {
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, onClose, isOpen]);
}

