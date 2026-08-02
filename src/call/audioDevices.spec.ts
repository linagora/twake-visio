import { preferredAudioDevice, readAudioDevices } from 'src/call/audioDevices';

// Les constantes `AudioDeviceInfo.TYPE_*`, relevées par `javap -constants` sur
// `android-36/android.jar` — jamais recopiées de mémoire.
const TYPE_BUILTIN_EARPIECE = 1;
const TYPE_BUILTIN_SPEAKER = 2;
const TYPE_WIRED_HEADSET = 3;
const TYPE_BLUETOOTH_SCO = 7;
const TYPE_HDMI = 9;
const TYPE_BLE_HEADSET = 26;

describe('readAudioDevices', () => {
  it("rend une liste vide quand ce n'est pas un tableau", () => {
    expect(readAudioDevices(null)).toEqual([]);
    expect(readAudioDevices(undefined)).toEqual([]);
    expect(readAudioDevices({ id: 1, type: TYPE_BLUETOOTH_SCO })).toEqual([]);
  });

  it('lit un tableau vide sans broncher', () => {
    expect(readAudioDevices([])).toEqual([]);
  });

  it('jette les entrées qui ne sont pas des objets, et garde les autres', () => {
    const list = readAudioDevices([
      'bluetooth',
      null,
      { id: 7, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(7);
  });

  it('jette une entrée sans `id` numérique, et garde celle qui en a un', () => {
    const list = readAudioDevices([
      { type: TYPE_BLUETOOTH_SCO, name: 'Sans id' },
      { id: '9', type: TYPE_BLUETOOTH_SCO, name: 'Id texte' },
      { id: 9, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Jabra Evolve2');
  });

  it('jette une entrée sans `type` numérique, et garde celle qui en a un', () => {
    const list = readAudioDevices([
      { id: 1, name: 'Sans type' },
      { id: 2, type: 'bluetooth', name: 'Type texte' },
      { id: 3, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(3);
  });

  it('jette un type que la feuille ne sait pas présenter, et garde ceux qu’elle sait', () => {
    // HDMI est bien une sortie, ce n'est pas une sortie de séance. La borne
    // dans les deux sens : sans l'entrée gardée, une implémentation qui rendrait
    // toujours `[]` passerait.
    const list = readAudioDevices([
      { id: 1, type: TYPE_HDMI, name: 'Téléviseur' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('speaker');
  });

  it('range chaque type sous sa catégorie', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 8' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
      { id: 3, type: TYPE_WIRED_HEADSET, name: 'Pixel 8' },
      { id: 4, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 5, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => [d.id, d.kind])).toEqual([
      [4, 'bluetooth'],
      [5, 'bluetooth'],
      [3, 'headset'],
      [2, 'speaker'],
      [1, 'earpiece'],
    ]);
  });

  it("garde le nom d'un Bluetooth, et jette celui d'une sortie intégrée", () => {
    // `getProductName()` rend le modèle du téléphone pour les sorties
    // intégrées : « Pixel 8 » à la place de « Haut-parleur » serait pire que
    // la catégorie. Les deux polarités, sinon un `name` toujours nul passerait.
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
    ]);

    expect(list[0]?.name).toBe('Tesla Model 3');
    expect(list[1]?.name).toBeNull();
  });

  it('retombe sur la catégorie quand le nom Bluetooth est vide ou absent', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: '   ' },
      { id: 2, type: TYPE_BLE_HEADSET },
    ]);

    expect(list[0]?.name).toBeNull();
    expect(list[1]?.name).toBeNull();
  });

  it('porte toujours la clé de repli de sa catégorie', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 8' },
    ]);

    expect(list[0]?.nameKey).toBe('call.output.bluetooth');
    expect(list[1]?.nameKey).toBe('call.output.earpiece');
  });

  it('numérote deux appareils qui afficheraient le même libellé', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
      { id: 2, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([1, 2]);
  });

  it('ne numérote pas quand les libellés diffèrent', () => {
    // L'autre polarité de la même conditionnelle : sans elle, une
    // numérotation systématique donnerait « Tesla Model 3 1 ».
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([null, null]);
  });

  it('numérote deux sorties sans nom de la même catégorie', () => {
    // Deux Bluetooth dont aucun n'a de nom lisible : le repli est identique,
    // donc les deux lignes seraient indiscernables sans ordinal.
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO },
      { id: 2, type: TYPE_BLE_HEADSET },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([1, 2]);
  });
});

describe('preferredAudioDevice', () => {
  it('rend le casque Bluetooth quand il y en a un', () => {
    // Le besoin d'origine : casque sur la tête, son dans l'écouteur du
    // téléphone. Mesuré trois fois sur Pixel 10 Pro Fold — `dumpsys audio` lit
    // `Active communication device: type:earpiece` avec le Jabra connecté et le
    // mode de communication accordé. Sur le chemin 'devices', AudioSwitch n'est
    // plus démarré et c'est lui qui appelait `startBluetoothSco()` : plus
    // personne ne choisit.
    const devices = readAudioDevices([
      { id: 1, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 10 Pro Fold' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 10 Pro Fold' },
      { id: 3, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve3 85' },
    ]);

    expect(preferredAudioDevice(devices)?.id).toBe(3);
  });

  it('préfère le Bluetooth au casque filaire quand les deux sont branchés', () => {
    const devices = readAudioDevices([
      { id: 1, type: TYPE_WIRED_HEADSET, name: 'Casque' },
      { id: 2, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve3 85' },
    ]);

    expect(preferredAudioDevice(devices)?.id).toBe(2);
  });

  it("rend le casque filaire quand il n'y a pas de Bluetooth", () => {
    // La seconde polarité de la préférence ci-dessus : sans elle, le test
    // précédent passerait aussi contre « rends toujours le premier ».
    const devices = readAudioDevices([
      { id: 1, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 10 Pro Fold' },
      { id: 2, type: TYPE_WIRED_HEADSET, name: 'Casque' },
    ]);

    expect(preferredAudioDevice(devices)?.id).toBe(2);
  });

  it("rend null quand aucun casque n'est disponible", () => {
    // Et surtout PAS le haut-parleur. Choisir entre écouteur et haut-parleur
    // n'est pas la question posée : sans casque, on laisse le système décider,
    // ce qu'il fait déjà. Poser une route ici serait un changement de
    // comportement que personne n'a demandé.
    const devices = readAudioDevices([
      { id: 1, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 10 Pro Fold' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 10 Pro Fold' },
    ]);

    expect(preferredAudioDevice(devices)).toBeNull();
  });

  it('rend null sur une liste vide', () => {
    expect(preferredAudioDevice([])).toBeNull();
  });

  it('rend le PREMIER Bluetooth quand deux sont connectés', () => {
    // Le cas du propriétaire : casque et voiture en même temps. L'ordre de la
    // liste décide, et cette liste est celle que `readAudioDevices` a triée.
    const devices = readAudioDevices([
      { id: 7, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve3 85' },
      { id: 9, type: TYPE_BLE_HEADSET, name: 'Tesla Model Y' },
    ]);

    expect(preferredAudioDevice(devices)?.id).toBe(7);
  });
});
