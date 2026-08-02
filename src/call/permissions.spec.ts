import { PermissionsAndroid, Platform } from 'react-native';

import {
  ensureBluetoothPermission,
  ensureMediaPermissions,
  ensureNotificationPermission,
} from 'src/call/permissions';

describe('ensureMediaPermissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('demande la caméra et le micro sur Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'granted',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'granted',
    } as never);

    await expect(ensureMediaPermissions()).resolves.toBe(true);

    // Les deux dans le même appel : demander le micro seulement après un refus
    // de la caméra imposerait deux invites successives à la personne.
    expect(request).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
  });

  it('rend false si le micro est refusé, même caméra accordée', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'granted',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'denied',
    } as never);

    // Une réunion sans micro n'est pas une réunion dégradée, c'est une réunion
    // muette : l'appelant doit pouvoir le dire avant d'entrer.
    await expect(ensureMediaPermissions()).resolves.toBe(false);
  });

  it('rend false sur un refus définitif', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'never_ask_again',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'never_ask_again',
    } as never);

    await expect(ensureMediaPermissions()).resolves.toBe(false);
  });

  it("ne demande rien hors d'Android, où les invites viennent du système", async () => {
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple');
    jest.replaceProperty(Platform, 'OS', 'ios');

    await expect(ensureMediaPermissions()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });
});

describe('ensureBluetoothPermission', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ne demande rien hors d'Android, où ce module de permission n'existe pas", async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'ios');

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("ne demande rien sous l'API 31, où BLUETOOTH_CONNECT n'est pas une permission d'exécution", async () => {
    // `Platform.Version` est un ACCESSEUR (`Platform.ios.js`), pas une propriété :
    // `jest.replaceProperty` y jette « Cannot replace the `Version` property
    // because it has a getter ». Mesuré, pas supposé.
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("demande BLUETOOTH_CONNECT à partir de l'API 31, jamais une autre permission", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  });

  it('rend false sur un refus, y compris définitif', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('never_ask_again' as never);

    await expect(ensureBluetoothPermission()).resolves.toBe(false);
  });
});

describe('ensureNotificationPermission', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ne demande rien hors d'Android", async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'ios');

    await expect(ensureNotificationPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("ne demande rien sous l'API 33, où POST_NOTIFICATIONS n'est pas une permission d'exécution", async () => {
    // Même remarque que pour BLUETOOTH_CONNECT : `Platform.Version` est un
    // ACCESSEUR, `jest.replaceProperty` y jette.
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(32);

    await expect(ensureNotificationPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("demande POST_NOTIFICATIONS à partir de l'API 33, jamais une autre permission", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);

    await expect(ensureNotificationPermission()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  });

  it('rend false sur un refus, y compris définitif', async () => {
    // MESURÉ sur appareil le 2026-08-02 : sans cette demande,
    // `POST_NOTIFICATIONS: granted=false`, et la notification du service de
    // premier plan est SUPPRIMÉE — `dumpsys activity services` la montrait bien
    // attachée (`isForeground=true types=0x000000C0`) alors qu'aucune ligne
    // n'apparaissait dans le volet. Le service tourne quand même ; c'est la
    // seule raison pour laquelle un refus ne bloque pas la séance.
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('never_ask_again' as never);

    await expect(ensureNotificationPermission()).resolves.toBe(false);
  });
});
