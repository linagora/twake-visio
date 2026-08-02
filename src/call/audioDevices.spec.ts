import { readAudioDevices } from 'src/call/audioDevices';

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
