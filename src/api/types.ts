// `lobby` n'est produit par aucun code de statut : c'est fetchRoomAccess, en
// Task 11, qui le construit depuis l'absence du bloc livekit dans la réponse.
// Il vit ici parce que c'est l'union sur laquelle tous les écrans branchent.
export type ApiError =
  | { kind: 'network' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  // Un 410 : la réunion a existé, puis a été supprimée, là où `not-found` dit
  // qu'elle n'existe pas.
  | { kind: 'gone' }
  // Un 404 qui n'est pas du JSON : ce n'est pas l'objet qui manque, c'est la
  // route, là où la requête a abouti. La cause attendue est un serveur Meet trop
  // ancien pour cet appel ; une page de proxy en serait une autre.
  | { kind: 'missing-route' }
  | { kind: 'lobby'; participantId: string }
  // Un 400 de Django REST Framework porte ses refus champ par champ, et c'est
  // souvent la seule chose exploitable : « Room with this Slug already exists »
  // demande de changer le nom, pas de réessayer. S'effondrer en `server`
  // ferait dire à l'écran « la réunion n'a pas pu être créée » là où il doit
  // dire « ce nom est déjà pris ».
  | { kind: 'validation'; fields: Readonly<Record<string, readonly string[]>> }
  | { kind: 'server'; status: number };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
