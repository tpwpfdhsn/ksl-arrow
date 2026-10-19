import { useReducer } from "react";
import type { Project } from "./model";
export type Commit = (update: Project | ((p: Project) => Project)) => void;
type State = { present: Project; past: Project[]; future: Project[] };
type Action =
  | { type: "commit"; update: Project | ((p: Project) => Project) }
  | { type: "undo" | "redo" };
function reducer(s: State, a: Action): State {
  if (a.type === "undo")
    return s.past.length
      ? {
          present: s.past[s.past.length - 1],
          past: s.past.slice(0, -1),
          future: [s.present, ...s.future],
        }
      : s;
  if (a.type === "redo")
    return s.future.length
      ? {
          present: s.future[0],
          past: [...s.past, s.present],
          future: s.future.slice(1),
        }
      : s;
  if (a.type === "commit") {
    const next =
      typeof a.update === "function" ? a.update(s.present) : a.update;
    return next === s.present
      ? s
      : { present: next, past: [...s.past, s.present].slice(-60), future: [] };
  }
  return s;
}
export function useHistory(initial: Project) {
  const [state, dispatch] = useReducer(reducer, {
    present: initial,
    past: [],
    future: [],
  });
  return {
    project: state.present,
    commit: ((update) => dispatch({ type: "commit", update })) as Commit,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
