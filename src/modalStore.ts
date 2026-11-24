import type { ReactNode } from "react";
export type ModalEntry = {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide: boolean;
  className?: string;
};
let entries: ModalEntry[] = [];
const listeners = new Set<() => void>();
export const modalStore = {
  getSnapshot: () => entries,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(entry: ModalEntry) {
    entries = entries.some((item) => item.id === entry.id)
      ? entries.map((item) => (item.id === entry.id ? entry : item))
      : [...entries, entry];
    listeners.forEach((listener) => listener());
  },
  remove(id: string) {
    entries = entries.filter((item) => item.id !== id);
    listeners.forEach((listener) => listener());
  },
};
