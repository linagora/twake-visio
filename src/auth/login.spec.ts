import * as webBrowser from 'expo-web-browser';

import { signIn } from 'src/auth/login';
import * as oidc from 'src/auth/oidc';
import * as storage from 'src/auth/storage';
import * as users from 'src/api/users';
import * as discovery from 'src/instance/discovery';
import { resetAccountsForTest } from 'src/auth/accounts';

const CONFIG = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

beforeEach(() => {
  resetAccountsForTest();
  jest.restoreAllMocks();
  jest.spyOn(discovery, 'fetchInstanceConfig').mockResolvedValue({ ok: true, value: CONFIG });
  jest.spyOn(storage, 'saveTokens').mockResolvedValue();
});

describe('signIn', () => {
  it('utilise openAuthSessionAsync et non une WebView', async () => {
    // Le state est généré aléatoirement à l'intérieur de signIn : le mock doit
    // le refléter tel quel dans l'URL de retour, exactement comme le ferait le
    // serveur d'autorisation, plutôt que de figer une valeur qui ne
    // correspondrait jamais à celle réellement envoyée.
    const open = jest
      .spyOn(webBrowser, 'openAuthSessionAsync')
      .mockImplementation(async (url) => {
        const state = new URL(url).searchParams.get('state');
        return { type: 'success', url: `twakevisio://callback?code=abc&state=${state}` } as never;
      });
    jest.spyOn(oidc, 'exchangeCode').mockResolvedValue({
      ok: true,
      value: { accessToken: 'at', refreshToken: 'rt', idToken: null, expiresAt: Date.now() + 1000 },
    });
    jest.spyOn(users, 'fetchMe').mockResolvedValue({
      ok: true,
      value: { id: 'u-1', email: 'ada@linagora.com', displayName: 'Ada' },
    });

    const result = await signIn('https://meet.linagora.com');

    expect(open).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('rejette une réponse dont le state ne correspond pas', async () => {
    jest.spyOn(webBrowser, 'openAuthSessionAsync').mockResolvedValue({
      type: 'success',
      url: 'twakevisio://callback?code=abc&state=FORGED',
    } as never);
    const exchange = jest.spyOn(oidc, 'exchangeCode');

    const result = await signIn('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'state-mismatch' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('remonte l\'annulation utilisateur sans erreur bruyante', async () => {
    jest
      .spyOn(webBrowser, 'openAuthSessionAsync')
      .mockResolvedValue({ type: 'cancel' } as never);

    const result = await signIn('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'cancelled' });
  });
});
