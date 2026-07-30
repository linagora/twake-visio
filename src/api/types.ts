// `lobby` n'est produit par aucun code de statut : c'est fetchRoomAccess, en
// Task 11, qui le construit depuis l'absence du bloc livekit dans la réponse.
// Il vit ici parce que c'est l'union sur laquelle tous les écrans branchent.
export type ApiError =
  | { kind: 'network' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'lobby'; participantId: string }
  | { kind: 'server'; status: number };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
