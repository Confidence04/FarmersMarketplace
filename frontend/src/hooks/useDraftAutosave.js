import { useEffect, useRef } from 'react';
import { loadDraft, saveDraft } from '../utils/draftOutbox';

/**
 * Restores the Add-product draft from IndexedDB on mount and autosaves
 * changes (debounced) so a dropped connection never loses a listing (FE-24).
 */
export function useDraftAutosave(form, setForm, { delay = 500 } = {}) {
  const restored = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDraft().then((draft) => {
      if (!cancelled && draft) setForm((prev) => ({ ...prev, ...draft }));
      restored.current = true;
    });
    return () => { cancelled = true; };
  }, [setForm]);

  useEffect(() => {
    if (!restored.current) return undefined;
    const id = setTimeout(() => saveDraft(form), delay);
    return () => clearTimeout(id);
  }, [form, delay]);
}

export default useDraftAutosave;
