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
};

export type CallState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting' }
  | { status: 'disconnected'; reason: string };
