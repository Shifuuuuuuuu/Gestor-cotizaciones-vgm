import type { Profile } from "../shared/people";
let user: Profile | null = null;
let serialized = "null";
const listeners = new Set<() => void>();
export const accessState = {
  getSnapshot: () => user,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export function setAccessUser(next: Profile | null) {
  const value = JSON.stringify(next);
  if (value === serialized) return;
  serialized = value;
  user = next;
  listeners.forEach((listener) => listener());
}
