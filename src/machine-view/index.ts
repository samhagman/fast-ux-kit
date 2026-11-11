/**
 * Machine View is now Machine Graph. This entry keeps the old import path and names working:
 *
 *   import { MachineView } from "@samhagman/fast-ux-kit/machine-view";        // still works
 *   import { MachineGraphView } from "@samhagman/fast-ux-kit/machine-graph";  // the new name
 *
 * @deprecated Import from `/machine-graph`.
 */
export * from "../machine-graph/index.js";
export {
  /** @deprecated Renamed to `MachineGraphView`. */
  MachineGraphView as MachineView,
  /** @deprecated Renamed to `useMachineGraph`. */
  useMachineGraph as useMachineView,
} from "../machine-graph/index.js";
export type {
  /** @deprecated Renamed to `MachineGraphViewProps`. */
  MachineGraphViewProps as MachineViewProps,
  /** @deprecated Renamed to `MachineGraphController`. */
  MachineGraphController as MachineViewController,
  /** @deprecated Renamed to `UseMachineGraphOptions`. */
  UseMachineGraphOptions as UseMachineViewOptions,
} from "../machine-graph/index.js";
