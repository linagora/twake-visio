import {
  AUDIO_OUTPUT_ORDER,
  audioOutputNameKey,
  type AudioOutputKind,
  type AudioOutputNameKey,
} from 'src/call/devices';

// Les constantes `AudioDeviceInfo.TYPE_*`, relevées par `javap -p -constants`
// sur `android-36/android.jar` — jamais recopiées de mémoire. HDMI (9),
// TÉLÉPHONIE, REMOTE_SUBMIX… sont bien des sorties, ce ne sont pas des sorties
// de séance : absentes de cette table, elles sont jetées.
const KIND_BY_TYPE: Readonly<Record<number, AudioOutputKind>> = {
  1: 'earpiece',
  2: 'speaker',
  24: 'speaker',
  3: 'headset',
  4: 'headset',
  11: 'headset',
  22: 'headset',
  7: 'bluetooth',
  8: 'bluetooth',
  23: 'bluetooth',
  26: 'bluetooth',
  27: 'bluetooth',
};

export type AudioDeviceChoice = {
  readonly id: number;
  readonly kind: AudioOutputKind;
  // Le nom lu, gardé pour le seul Bluetooth. `null` partout ailleurs : la
  // feuille retombe alors sur `nameKey`, qui est localisée.
  readonly name: string | null;
  readonly nameKey: AudioOutputNameKey;
  // `null` quand aucun autre appareil n'afficherait le même libellé. Sinon 1,
  // 2, 3… dans l'ordre de présentation — deux lignes identiques seraient
  // indiscernables.
  readonly ordinal: number | null;
};

// Les seules catégories qu'on choisit d'office. Le haut-parleur et l'écouteur
// en sont ABSENTS à dessein : arbitrer entre eux n'est pas la question posée, et
// le système le fait déjà. On ne pose une route que pour corriger un tort
// constaté — un casque sur la tête et le son ailleurs.
const HEADSET_KINDS: readonly AudioOutputKind[] = ['bluetooth', 'headset'];

/**
 * L'appareil vers lequel router quand personne n'a encore choisi, ou `null`
 * quand il n'y a rien à corriger.
 *
 * MESURÉ trois fois le 2026-08-02 sur Pixel 10 Pro Fold, dans trois états
 * différents — casque connecté pendant la séance, connecté avant de rejoindre,
 * et séance déjà en cours : `dumpsys audio` lit
 * `Active communication device: type:earpiece` alors que le Jabra est connecté
 * en HFP et que le mode de communication nous appartient. Le son sort de
 * l'écouteur du téléphone avec un casque sur la tête.
 *
 * La cause est structurelle et non accidentelle : sur le chemin 'devices',
 * `src/call/audioRoute.ts` ne démarre plus AudioSwitch — délibérément, deux
 * arbitres sur le même canal étant la cause classique du « le son est reparti
 * tout seul » — mais c'était AudioSwitch qui appelait `startBluetoothSco()`.
 * Plus personne ne choisissait. La feuille annonce pourtant, en première ligne,
 * « Le son suit l'appareil que vous branchez ».
 */
export function preferredAudioDevice(
  devices: readonly AudioDeviceChoice[],
): AudioDeviceChoice | null {
  for (const kind of HEADSET_KINDS) {
    const found = devices.find((device) => device.kind === kind);
    if (found !== undefined) return found;
  }
  return null;
}

type Parsed = { readonly id: number; readonly kind: AudioOutputKind; readonly name: string | null };

function labelOf(device: Parsed): string {
  return device.name ?? device.kind;
}

// Le pont natif ne porte aucun contrat : `listDevices()` est typé
// `Promise<unknown>`, exactement pour la raison qui justifie `readCameras` dans
// `src/call/devices.ts`. Cette fonction est le seul endroit du dépôt qui
// regarde cette forme, et elle la regarde sans assertion de type — le narrowing
// par `typeof` et par l'opérateur `in` suffit.
//
// Parser et numéroter sont inséparables : l'ordinal dépend de la liste entière.
export function readAudioDevices(raw: unknown): readonly AudioDeviceChoice[] {
  if (!Array.isArray(raw)) return [];
  const entries: readonly unknown[] = raw;

  const parsed: Parsed[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('id' in entry) || typeof entry.id !== 'number') continue;
    if (!('type' in entry) || typeof entry.type !== 'number') continue;
    const kind = KIND_BY_TYPE[entry.type];
    if (kind === undefined) continue;
    const given = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : '';
    parsed.push({
      id: entry.id,
      kind,
      // `getProductName()` rend le modèle du TÉLÉPHONE pour une sortie
      // intégrée : une ligne « Pixel 8 » à la place de « Haut-parleur » serait
      // pire que la catégorie. C'est la recommandation Q2 de la spécification.
      name: kind === 'bluetooth' && given.length > 0 ? given : null,
    });
  }

  const ordered = AUDIO_OUTPUT_ORDER.flatMap((kind) =>
    parsed.filter((device) => device.kind === kind),
  );

  // La numérotation regroupe par LIBELLÉ affiché, pas par catégorie : deux
  // Bluetooth de noms différents ne sont pas numérotés, deux Bluetooth sans nom
  // le sont — et ce dernier cas n'est pas hypothétique, c'est ce que donne un
  // refus de `BLUETOOTH_CONNECT`.
  const totals = new Map<string, number>();
  for (const device of ordered) {
    totals.set(labelOf(device), (totals.get(labelOf(device)) ?? 0) + 1);
  }

  const running = new Map<string, number>();
  return ordered.map((device) => {
    const label = labelOf(device);
    const rank = (running.get(label) ?? 0) + 1;
    running.set(label, rank);
    return {
      id: device.id,
      kind: device.kind,
      name: device.name,
      nameKey: audioOutputNameKey(device.kind),
      ordinal: (totals.get(label) ?? 0) > 1 ? rank : null,
    };
  });
}
