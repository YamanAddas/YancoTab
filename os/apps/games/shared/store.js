export function createStore(reducer, initialState) {
  let state = initialState;
  const listeners = new Set();

  const getState = () => state;

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const dispatch = (action) => {
    const out = reducer(state, action);
    state = out.state;
    for (const fn of listeners) fn(state, out.events || []);
    return out;
  };

  return { getState, dispatch, subscribe };
}
