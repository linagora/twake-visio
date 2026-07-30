// Les quatre catégories de sortie d'Android, et rien d'autre. Ce sont des
// catégories, pas des appareils : deux casques Bluetooth appairés se
// présentent comme une seule entrée « bluetooth », et le nom du casque n'est
// pas exposé.
export type AudioOutputKind = 'bluetooth' | 'headset' | 'speaker' | 'earpiece';

// L'ordre de présentation est celui de la préférence automatique de LiveKit
// (`preferredOutputList`) : le haut de la liste est ce que le système
// choisirait tout seul.
export const AUDIO_OUTPUT_ORDER: readonly AudioOutputKind[] = [
  'bluetooth',
  'headset',
  'speaker',
  'earpiece',
];

// Le module natif n'est pas typé : `NativeModules.LivekitReactNativeModule`
// traverse un Proxy sans contrat. Les valeurs inconnues sont jetées, les
// doublons écrasés, le reste ordonné.
export function readAudioOutputs(raw: readonly unknown[]): readonly AudioOutputKind[] {
  const seen = new Set<AudioOutputKind>();
  for (const value of raw) {
    const found = AUDIO_OUTPUT_ORDER.find((kind) => kind === value);
    if (found !== undefined) seen.add(found);
  }
  return AUDIO_OUTPUT_ORDER.filter((kind) => seen.has(kind));
}

export type AudioOutputNameKey = `call.output.${AudioOutputKind}`;

export function audioOutputNameKey(kind: AudioOutputKind): AudioOutputNameKey {
  return `call.output.${kind}`;
}

// `FacingMode` de `src/call/media.ts` ne connaît que deux valeurs. iOS peut
// rendre "unknown" pour une caméra externe ou de position non spécifiée : une
// troisième valeur est donc nécessaire ici, et elle ne remonte jamais jusqu'à
// `src/call/layout.ts`, qui n'a pas de miroir défini pour elle.
export type CameraFacing = 'user' | 'environment' | 'unknown';

export type CameraNameKey = 'call.cameraFront' | 'call.cameraBack' | 'call.cameraUnknown';

export type CameraChoice = {
  readonly deviceId: string;
  readonly facing: CameraFacing;
  readonly nameKey: CameraNameKey;
  // `null` quand la face ne compte qu'une caméra. Sinon 1, 2, 3… dans l'ordre
  // d'énumération — le seul que la plateforme donne, et sur Android c'est
  // littéralement l'index qui sert de `deviceId`.
  readonly ordinal: number | null;
};

const NAME_KEYS: Readonly<Record<CameraFacing, CameraNameKey>> = {
  user: 'call.cameraFront',
  environment: 'call.cameraBack',
  unknown: 'call.cameraUnknown',
};

// Les caméras sont nommées depuis `facing`, jamais depuis le `label` brut : sur
// Android celui-ci est l'identifiant Camera2, illisible. Le web affiche le
// `label` sans repli ; c'est une différence à traiter, pas à hériter.
function readFacing(value: unknown): CameraFacing {
  if (value === 'front' || value === 'user') return 'user';
  if (value === 'environment' || value === 'back') return 'environment';
  return 'unknown';
}

// `enumerateDevices()` est typé `Promise<unknown>` et son champ `facing`
// n'appartient pas à `MediaDeviceInfo`. Cette fonction est le seul endroit du
// dépôt qui regarde cette forme, et elle la regarde sans assertion de type :
// le narrowing par `typeof` et par l'opérateur `in` suffit.
//
// Parser et numéroter sont inséparables : l'ordinal dépend de la liste entière.
export function readCameras(raw: unknown): readonly CameraChoice[] {
  if (!Array.isArray(raw)) return [];
  const entries: readonly unknown[] = raw;

  const parsed: { deviceId: string; facing: CameraFacing }[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('kind' in entry) || entry.kind !== 'videoinput') continue;
    if (!('deviceId' in entry) || typeof entry.deviceId !== 'string') continue;
    if (entry.deviceId.length === 0) continue;
    parsed.push({
      deviceId: entry.deviceId,
      facing: 'facing' in entry ? readFacing(entry.facing) : 'unknown',
    });
  }

  const totals = new Map<CameraFacing, number>();
  for (const camera of parsed) totals.set(camera.facing, (totals.get(camera.facing) ?? 0) + 1);

  const running = new Map<CameraFacing, number>();
  return parsed.map((camera) => {
    const rank = (running.get(camera.facing) ?? 0) + 1;
    running.set(camera.facing, rank);
    return {
      deviceId: camera.deviceId,
      facing: camera.facing,
      nameKey: NAME_KEYS[camera.facing],
      // Un ordinal seulement quand la face en compte plus d'une : sinon
      // « Caméra avant 1 » sur un téléphone qui n'en a qu'une.
      ordinal: (totals.get(camera.facing) ?? 0) > 1 ? rank : null,
    };
  });
}
