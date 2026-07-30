import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';
import { clearTokens, loadTokens, saveTokens } from 'src/auth/storage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const TOKENS: TokenSet = {
  accessToken: 'at',
  refreshToken: 'rt',
  idToken: 'it',
  expiresAt: 1_800_000_000_000,
};

const ACCOUNT = 'https%3A%2F%2Fsso.linagora.com|u-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dérivation de clé', () => {
  it('ne fait pas collisionner deux comptes ne différant que par un caractère hors alphabet', async () => {
    await saveTokens('https%3A%2F%2Fhost%3A8443|u1', TOKENS);
    await saveTokens('https%3A%2F%2Fhost%2F8443|u1', TOKENS);

    const mock = jest.mocked(setItemAsync);
    expect(mock).toHaveBeenCalledTimes(2);
    const [firstKey] = mock.mock.calls[0] ?? [];
    const [secondKey] = mock.mock.calls[1] ?? [];
    expect(firstKey).not.toBe(secondKey);
  });

  it('reste injective sur un point de code hors du plan de base', async () => {
    // padStart impose un plancher : avec quatre chiffres, U+10000 et
    // U+1000 suivi de « 0 » produisaient la même clé.
    await saveTokens('a\u{10000}b', TOKENS);
    await saveTokens('aက' + '0b', TOKENS);

    const mock = jest.mocked(setItemAsync);
    const [firstKey] = mock.mock.calls[0] ?? [];
    const [secondKey] = mock.mock.calls[1] ?? [];
    expect(firstKey).not.toBe(secondKey);
  });

  it('emploie une seule et même clé pour écrire, lire et purger', async () => {
    await saveTokens(ACCOUNT, TOKENS);
    await loadTokens(ACCOUNT);
    await clearTokens(ACCOUNT);

    const [written] = jest.mocked(setItemAsync).mock.calls[0] ?? [];
    const [read] = jest.mocked(getItemAsync).mock.calls[0] ?? [];
    const [deleted] = jest.mocked(deleteItemAsync).mock.calls[0] ?? [];
    expect(read).toBe(written);
    expect(deleted).toBe(written);
  });
});

describe('saveTokens', () => {
  it('écrit le TokenSet sérialisé dans le magasin chiffré', async () => {
    await saveTokens(ACCOUNT, TOKENS);
    expect(setItemAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^tokens\./),
      JSON.stringify(TOKENS),
    );
  });
});

describe('loadTokens', () => {
  it('restitue à l\'identique ce que saveTokens a écrit', async () => {
    jest.mocked(getItemAsync).mockResolvedValueOnce(JSON.stringify(TOKENS));
    expect(await loadTokens(ACCOUNT)).toEqual(TOKENS);
  });

  it('rend null quand rien n\'est stocké', async () => {
    jest.mocked(getItemAsync).mockResolvedValueOnce(null);
    expect(await loadTokens(ACCOUNT)).toBe(null);
  });

  it('rend null sur un contenu corrompu, sans lever', async () => {
    // Indistinguable d'une absence pour l'appelant, ce qui est voulu : dans les
    // deux cas il faut se reconnecter. Mais il ne faut surtout pas planter.
    jest.mocked(getItemAsync).mockResolvedValueOnce('{ pas du json');
    expect(await loadTokens(ACCOUNT)).toBe(null);
  });
});
