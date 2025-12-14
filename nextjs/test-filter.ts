import { evaluateFilter } from "./src/app/annotation2/_lib/filter-utils";
import type {
  AnnotationRegion,
  FilterNode,
} from "./src/app/annotation2/_types";

const regionLarge: AnnotationRegion = {
  id: 1,
  bbox: [0, 0, 100, 100],
  points: [],
  metrics: { Area: 3000 },
};

const regionSmall: AnnotationRegion = {
  id: 2,
  bbox: [0, 0, 10, 10],
  points: [],
  metrics: { Area: 1000 },
};

// Case 1: Root KEEP, Area >= 2000
// Pipeline usage: Expect match for Large(3000)
const nodeKeep: FilterNode = {
  id: "root",
  type: "group",
  action: "keep",
  logic: "AND",
  enabled: true,
  children: [
    {
      id: "c1",
      type: "condition",
      metric: "Area",
      min: 2000,
      max: 10000,
      enabled: true,
    },
  ],
};

console.log("--- Case 1: Action KEEP, Area >= 2000 ---");
console.log(
  "Region Large (3000) for Pipeline:",
  evaluateFilter(nodeKeep, regionLarge, true, true),
); // Expect true
console.log(
  "Region Small (1000) for Pipeline:",
  evaluateFilter(nodeKeep, regionSmall, true, true),
); // Expect false

// Case 2: Root REMOVE, Area >= 2000
// Pipeline usage: Expect match for Large(3000) because action should be ignored
const nodeRemove: FilterNode = {
  ...nodeKeep,
  action: "remove",
};

console.log("--- Case 2: Action REMOVE, Area >= 2000 ---");
console.log(
  "Region Large (3000) for Pipeline:",
  evaluateFilter(nodeRemove, regionLarge, true, true),
); // Expect true
console.log(
  "Region Small (1000) for Pipeline:",
  evaluateFilter(nodeRemove, regionSmall, true, true),
); // Expect false

// Case 3: Action REMOVE, Area >= 2000 (NOT for pipeline -> for display)
// Display usage: Expect FALSE for Large (Removed/Hidden), TRUE for Small (Kept)
console.log("--- Case 3: Action REMOVE, Area >= 2000 (Display Mode) ---");
console.log(
  "Region Large (3000) for Display:",
  evaluateFilter(nodeRemove, regionLarge, false, false),
); // Expect false
console.log(
  "Region Small (1000) for Display:",
  evaluateFilter(nodeRemove, regionSmall, false, false),
); // Expect true
