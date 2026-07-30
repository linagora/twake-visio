import { forceRefresh, getAccessToken, resetSessionForTest } from 'src/auth/session';
import * as oidc from 'src/auth/oidc';
import * as storage from 'src/auth/storage';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

const ACCOUNT = 'https://sso.linagora.com|u-1';

beforeEach(() => {
  resetSessionForTest();
  jest.restoreAllMocks();
  jest.spyOn(storage, 'saveTokens').mockResolvedValue();
});

describe('getAccessToken', () => {
  it('renvoie le jeton stocké tant qu\'il n\'est pas expiré', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() + 600_000,
    });
    const refresh = jest.spyOn(oidc, 'refreshTokens');

    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe('valid');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rafraîchit quand le jeton est dans la fenêtre de garde', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'stale',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() + 5_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });

    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe('fresh');
  });

  it('renvoie null quand aucun jeton n\'est stocké', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue(null);
    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe(null);
  });
});

describe('forceRefresh — rafraîchissement en vol unique', () => {
  it('ne déclenche qu\'un seul appel réseau pour trois demandes concurrentes', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    const refresh = jest.spyOn(oidc, 'refreshTokens').mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                value: {
                  accessToken: 'fresh',
                  refreshToken: 'rt2',
                  idToken: null,
                  expiresAt: Date.now() + 3_600_000,
                },
              }),
            10,
          ),
        ),
    );

    const results = await Promise.all([
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['fresh', 'fresh', 'fresh']);
  });

  it('persiste le nouveau refresh_token en cas de rotation', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rotated',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });
    const save = jest.spyOn(storage, 'saveTokens').mockResolvedValue();

    await forceRefresh(ACCOUNT, CONFIG);

    expect(save).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ refreshToken: 'rotated' }),
    );
  });

  it('ne lance qu\'un rafraîchissement même si la lecture du stockage est lente', async () => {
    // Le test précédent ne suffit pas : avec un loadTokens résolu
    // immédiatement, les trois appelants sont traités en FIFO dans le même lot
    // de microtâches, et le premier a fini sa séquence synchrone avant que le
    // second ne reprenne. Le test passerait donc même si l'insertion dans la
    // carte avait lieu APRÈS un await. Un loadTokens lent supprime cette
    // chance de timing : si l'insertion n'est pas synchrone, les trois
    // franchissent la vérification pendant l'attente.
    jest.spyOn(storage, 'loadTokens').mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                accessToken: 'old',
                refreshToken: 'rt',
                idToken: null,
                expiresAt: Date.now() - 1_000,
              }),
            10,
          ),
        ),
    );
    const refresh = jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });

    await Promise.all([
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('libère le verrou après un rejet, pour qu\'une reconnexion reste possible', async () => {
    // Le test suivant couvre un refus typé du SSO, qui est une résolution.
    // Celui-ci couvre un vrai rejet — saveTokens n'entoure pas setItemAsync
    // d'un try/catch, donc une écriture Keychain refusée en est un. Un nettoyage
    // placé sur le chemin de succès plutôt que dans un finally laisserait la
    // promesse rejetée dans la carte, et le compte ne pourrait plus jamais se
    // reconnecter sans redémarrer l'application.
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    const refresh = jest
      .spyOn(oidc, 'refreshTokens')
      .mockRejectedValueOnce(new Error('SSO injoignable'))
      .mockResolvedValueOnce({
        ok: true,
        value: {
          accessToken: 'fresh',
          refreshToken: 'rt2',
          idToken: null,
          expiresAt: Date.now() + 3_600_000,
        },
      });

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe('fresh');

    // C'est cette assertion qui prouve la libération du verrou, et elle tient
    // que l'échec soit un rejet ou une résolution : si la carte n'était pas
    // vidée, le second appel recevrait la promesse déjà résolue du premier et
    // rendrait null sans rappeler le SSO.
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('conserve un jeton valide quand seule sa persistance échoue', async () => {
    // refreshTokens réussit, l'écriture Keychain est refusée. Écarter le jeton
    // ici renverrait l'utilisateur vers une reconnexion alors que sa session
    // vient d'être renouvelée avec succès.
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });
    jest.spyOn(storage, 'saveTokens').mockRejectedValue(new Error('keychain refusé'));

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe('fresh');
  });

  it('renvoie null et libère le verrou quand le rafraîchissement échoue', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest
      .spyOn(oidc, 'refreshTokens')
      .mockResolvedValue({ ok: false, error: 'invalid_grant' });

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
  });
});
