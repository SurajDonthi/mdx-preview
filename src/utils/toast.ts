export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  type?: 'success' | 'info' | 'error';
  duration?: number;
}

type ToastListener = (toast: ToastMessage) => void;
const listeners = new Set<ToastListener>();

export function showToast(
  title: string,
  message?: string,
  type: 'success' | 'info' | 'error' = 'success',
  duration = 4000
) {
  const toast: ToastMessage = {
    id: Math.random().toString(36).substring(2, 9),
    title,
    message,
    type,
    duration,
  };
  listeners.forEach((listener) => listener(toast));
}

export function subscribeToast(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
