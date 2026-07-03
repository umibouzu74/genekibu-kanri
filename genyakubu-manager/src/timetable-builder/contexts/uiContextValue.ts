import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

export interface UIContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showConfirm: (
    message: string,
    options?: { title?: string; danger?: boolean; confirmLabel?: string },
  ) => Promise<boolean>;
  showInput: (
    message: string,
    options?: { title?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string },
  ) => Promise<string | null>;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
