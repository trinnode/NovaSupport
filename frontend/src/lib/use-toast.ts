import { useState, useCallback } from 'react';

type Toast = { message: string; type: 'success' | 'error' };

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  return { toast, showToast, dismiss: () => setToast(null) };
}
