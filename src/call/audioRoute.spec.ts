import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  audioRouteControl,
  listAudioOutputs,
  openSystemRoutePicker,
  selectAudioOutput,
} from 'src/call/audioRoute';

beforeEach(() => {
  jest.restoreAllMocks();
  jest.mocked(AudioSession.getAudioOutputs).mockReset().mockResolvedValue([]);
  jest.mocked(AudioSession.selectAudioOutput).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.showAudioRoutePicker).mockReset().mockResolvedValue(undefined);
});

describe('audioRouteControl', () => {
  it("rend 'system' sur iOS, où la seule surface est le sélecteur de la plateforme", () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a pas de menu à peupler.
    jest.replaceProperty(Platform, 'OS', 'ios');

    expect(audioRouteControl()).toBe('system');
  });

  it("rend 'menu' ailleurs", () => {
    // Les deux branches, jamais une seule : avec une seule, une constante en
    // dur serait indiscernable d'une lecture correcte de la plateforme.
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(audioRouteControl()).toBe('menu');
  });
});

describe('listAudioOutputs', () => {
  it('normalise et ordonne ce que rend le module natif', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['speaker', 'bluetooth', 'hdmi']);

    await expect(listAudioOutputs()).resolves.toEqual(['bluetooth', 'speaker']);
  });

  it("rend une liste vide quand la session audio n'est pas ouverte", async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue([]);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });

  it('jette les constantes iOS, qui ne sont pas des catégories', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['default', 'force_speaker']);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });
});

describe('selectAudioOutput', () => {
  it('transmet la catégorie choisie, jamais une autre', async () => {
    // Deux appels distincts, et la seconde catégorie vérifiée : un appel qui
    // enverrait toujours 'speaker' passerait un test à une seule valeur.
    await selectAudioOutput('bluetooth');
    await selectAudioOutput('earpiece');

    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(1, 'bluetooth');
    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(2, 'earpiece');
  });
});

describe('openSystemRoutePicker', () => {
  it('appelle le sélecteur système', async () => {
    // Un test ne peut vérifier que l'appel : la méthode native simule un clic
    // sur une vue jamais insérée dans la hiérarchie, et n'a pas de resolver.
    await openSystemRoutePicker();

    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
  });
});
