import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  /** Visual tone: default, reward (cash), warning (police). */
  tone?: 'info' | 'reward' | 'warn';
}

interface ToastState {
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

/** Short top-left notifications ("+$120 drift", "New street: Columbus Ave"). */
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  toast: (text, tone = 'info') => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone }] }));
    window.setTimeout(() => get().dismiss(id), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().toast(text, tone);
