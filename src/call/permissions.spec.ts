import { PermissionsAndroid, Platform } from 'react-native';

import { ensureMediaPermissions } from 'src/call/permissions';

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
