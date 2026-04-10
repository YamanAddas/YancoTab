export class FSMError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FSMError';
  }
}

export function assertPhase(state, allowedPhases, actionType = 'action') {
  const ok = allowedPhases.includes(state.phase);
  if (!ok) throw new FSMError(`Illegal ${actionType}: phase=${state.phase}`);
}
