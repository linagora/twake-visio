export type ApiError =
  | { kind: 'network' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'lobby'; participantId: string }
  | { kind: 'server'; status: number };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
