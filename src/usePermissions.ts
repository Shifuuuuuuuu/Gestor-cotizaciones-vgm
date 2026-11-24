import { useSyncExternalStore } from "react";
import { accessState } from "./accessState";
import { can, type AccessModule, type AccessAction } from "../shared/access";
export function usePermissions() {
  const user = useSyncExternalStore(
    accessState.subscribe,
    accessState.getSnapshot,
  );
  return {
    user,
    has: (module: AccessModule, action: AccessAction = "view") =>
      can(user, module, action),
  };
}
