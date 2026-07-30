export type AccessLevel = 'public' | 'trusted' | 'restricted';

export type Room = {
  readonly id: string | null;
  readonly slug: string;
  readonly name: string;
  readonly accessLevel: AccessLevel;
};

export type RoomAccess = {
  readonly room: Room;
  readonly livekitUrl: string;
  readonly token: string;
  // Exposé par le sérialiseur de détail seulement, jamais par celui de liste :
  // il ne peut donc pas vivre sur `Room`, où `fetchMyRooms` le rendrait
  // toujours faux. Vaut exactement `is_administrator_or_owner` côté serveur,
  // la même règle que la permission `HasPrivilegesOnRoom` qu'exigent les
  // endpoints de modération.
  readonly isAdministrable: boolean;
};

export type CallState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting' }
  | { status: 'disconnected'; reason: string };
