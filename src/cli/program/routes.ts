import { routedCommands, type RouteSpec } from "./route-specs.js";

export type { RouteSpec } from "./route-specs.js";

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function findRoutedCommand(path: string[]): RouteSpec | null {
  for (const route of routedCommands) {
    if (route.match(path)) {
      return route;
    }
  }
  return null;
}
