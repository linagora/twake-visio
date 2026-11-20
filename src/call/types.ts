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
  // La présence de `accesses` dans la réponse de `join/`. Le sérialiseur de
  // salon ne la pose que pour un rôle d'administrateur ou de propriétaire,
  // le critère de `is_administrator_or_owner`, qu'applique la permission
  // `HasPrivilegesOnRoom` des endpoints de modération. Il voyage avec l'accès
  // parce que c'est la demande d'entrée qui l'apprend ; la salle d'attente,
  // qui n'en sait rien, le pose à faux.
  readonly isAdministrable: boolean;
};

export type CallState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting' }
  | { status: 'disconnected'; reason: string };
