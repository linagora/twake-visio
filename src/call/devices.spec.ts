import {
  AUDIO_OUTPUT_ORDER,
  audioOutputNameKey,
  readAudioOutputs,
  readCameras,
} from 'src/call/devices';

describe('readAudioOutputs', () => {
  it("ordonne selon la préférence automatique de LiveKit, quelle que soit la forme de l'entrée", () => {
    // L'ordre de présentation est celui de `preferredOutputList`
    // (bluetooth > headset > speaker > earpiece) : le haut de la liste est ce
    // que le système choisirait tout seul.
    expect(readAudioOutputs(['earpiece', 'speaker', 'bluetooth'])).toEqual([
      'bluetooth',
      'speaker',
      'earpiece',
    ]);
  });

  it("jette ce qui n'est pas une catégorie connue, y compris ce qui n'est pas une chaîne", () => {
    // `NativeModules.LivekitReactNativeModule` traverse un Proxy non typé :
    // rien ne garantit que le tableau ne contienne que des chaînes.
    expect(readAudioOutputs(['speaker', 'hdmi', 42, null, undefined, {}])).toEqual(['speaker']);
  });

  it('écrase les doublons', () => {
    expect(readAudioOutputs(['speaker', 'speaker', 'headset'])).toEqual(['headset', 'speaker']);
  });

  it('rend une liste vide sur une liste vide', () => {
    // Cas atteint au pré-écran : `getAudioOutputs()` rend `[]` tant que
    // `startAudioSession()` n'a pas tourné.
    expect(readAudioOutputs([])).toEqual([]);
  });

  it('expose les quatre catégories, dans leur ordre de préférence', () => {
    expect(AUDIO_OUTPUT_ORDER).toEqual(['bluetooth', 'headset', 'speaker', 'earpiece']);
  });

  it('ne modifie pas le tableau reçu', () => {
    // Le module est pur : `raw` est encore lisible par l'appelant après
    // l'appel, dans le même ordre. `readonly unknown[]` empêche `push`/`sort`
    // au typage, mais pas un `as unknown[]` local qui les réintroduirait — la
    // garde vaut donc d'être vérifiée, pas seulement supposée par le type.
    const raw = ['earpiece', 'speaker', 'bluetooth'];
    const snapshot = [...raw];

    readAudioOutputs(raw);

    expect(raw).toEqual(snapshot);
  });
});

describe('audioOutputNameKey', () => {
  it('compose la clé de traduction de chaque catégorie', () => {
    // Deux catégories distinctes, jamais une seule : avec une seule, un retour
    // codé en dur serait indiscernable d'une composition correcte.
    expect(audioOutputNameKey('bluetooth')).toBe('call.output.bluetooth');
    expect(audioOutputNameKey('earpiece')).toBe('call.output.earpiece');
  });
});

describe('readCameras', () => {
  it('jette les entrées audio et les identifiants vides, comme le fait le web', () => {
    // Android rend un `audioinput` factice libellé "Audio", et zéro
    // `audiooutput` : un menu caméra qui ne filtrerait pas afficherait une
    // ligne « Audio ».
    expect(
      readCameras([
        { kind: 'audioinput', deviceId: 'audio-1', label: 'Audio' },
        { kind: 'videoinput', deviceId: '', facing: 'front' },
        { kind: 'videoinput', deviceId: '0', facing: 'front', label: 'camera-2-id' },
      ]),
    ).toEqual([{ deviceId: '0', facing: 'user', nameKey: 'call.cameraFront', ordinal: null }]);
  });

  it('traduit "front" en user et "unknown" en unknown', () => {
    // Android rend "front"/"environment" ; iOS peut rendre "unknown" pour une
    // caméra externe ou de position non spécifiée. `FacingMode` de `media.ts`
    // ne connaît que deux valeurs : la troisième s'arrête ici.
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: 'a', facing: 'front' },
        { kind: 'videoinput', deviceId: 'b', facing: 'unknown' },
      ]),
    ).toEqual([
      { deviceId: 'a', facing: 'user', nameKey: 'call.cameraFront', ordinal: null },
      { deviceId: 'b', facing: 'unknown', nameKey: 'call.cameraUnknown', ordinal: null },
    ]);
  });

  it('accepte aussi "user" et "back", déjà dans le vocabulaire de sortie', () => {
    // `readFacing` accepte ces deux valeurs en plus de "front"/"environment" —
    // une entrée déjà normalisée reste stable. Non documenté comme rendu par
    // une plateforme réelle, mais c'est une branche du code livré : elle a sa
    // propre preuve, distincte du test "front"/"unknown" ci-dessus.
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: 'a', facing: 'user' },
        { kind: 'videoinput', deviceId: 'b', facing: 'back' },
      ]),
    ).toEqual([
      { deviceId: 'a', facing: 'user', nameKey: 'call.cameraFront', ordinal: null },
      { deviceId: 'b', facing: 'environment', nameKey: 'call.cameraBack', ordinal: null },
    ]);
  });

  it("ne pose pas d'ordinal quand une face ne compte qu'une caméra", () => {
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: '0', facing: 'front' },
        { kind: 'videoinput', deviceId: '1', facing: 'environment' },
      ]).map((camera) => camera.ordinal),
    ).toEqual([null, null]);
  });

  it('numérote par face et non globalement', () => {
    // Deux avant et trois arrière donnent 1,2 et 1,2,3 — pas 1..5. Une fixture
    // où toutes les caméras seraient arrière ne prouverait rien de cette règle.
    const cameras = readCameras([
      { kind: 'videoinput', deviceId: 'f1', facing: 'front' },
      { kind: 'videoinput', deviceId: 'b1', facing: 'environment' },
      { kind: 'videoinput', deviceId: 'f2', facing: 'front' },
      { kind: 'videoinput', deviceId: 'b2', facing: 'environment' },
      { kind: 'videoinput', deviceId: 'b3', facing: 'environment' },
    ]);

    expect(cameras.map((camera) => [camera.deviceId, camera.ordinal])).toEqual([
      ['f1', 1],
      ['b1', 1],
      ['f2', 2],
      ['b2', 2],
      ['b3', 3],
    ]);
  });

  it("conserve l'ordre d'énumération, le seul que la plateforme donne", () => {
    // Sur Android, le `deviceId` **est** l'index d'énumération : réordonner
    // ferait pointer « Caméra arrière 2 » vers une autre caméra que celle que
    // la plateforme a numérotée ainsi.
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: '1', facing: 'environment' },
        { kind: 'videoinput', deviceId: '0', facing: 'front' },
      ]).map((camera) => camera.deviceId),
    ).toEqual(['1', '0']);
  });

  it('survit à undefined, à un objet et à des entrées vides', () => {
    // `enumerateDevices()` est typé `Promise<unknown>` : rien ne garantit un
    // tableau, ni des objets bien formés dedans.
    expect(readCameras(undefined)).toEqual([]);
    expect(readCameras({ kind: 'videoinput' })).toEqual([]);
    expect(readCameras([{}, null, 'x'])).toEqual([]);
  });

  it('ne modifie ni la liste reçue ni les objets caméra qu’elle contient', () => {
    // Deux caméras de la même face, pas une seule : la numérotation par face
    // écrit dans une `Map` locale, mais rien ne garantit qu'une implémentation
    // future n'écrive pas l'ordinal calculé directement sur l'entrée source.
    const front1 = { kind: 'videoinput', deviceId: 'f1', facing: 'front' };
    const front2 = { kind: 'videoinput', deviceId: 'f2', facing: 'front' };
    const raw = [front1, front2];
    const snapshot = raw.map((entry) => ({ ...entry }));

    readCameras(raw);

    expect(raw).toEqual(snapshot);
    expect(front1).toEqual(snapshot[0]);
    expect(front2).toEqual(snapshot[1]);
  });
});
