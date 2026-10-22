import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal keyboard behaviour (#1502): moves focus into the dialog, traps Tab /
 * Shift+Tab inside it, closes on Escape and restores focus to the trigger.
 *
 * Usage: const ref = useModalA11y(isOpen, onClose); <div ref={ref} role="dialog" aria-modal="true" …>
 */
export function useModalA11y(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector(FOCUSABLE);
    (first || node)?.focus?.();

    function onKeyDown(e) {
      if (!ref.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(ref.current.querySelectorAll(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === head || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (document.activeElement === tail || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        head.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  return ref;
}
