import {
  addAccount,
  getActiveAccount,
  listAccounts,
  makeAccountId,
  removeAccount,
  setActiveAccount,
  resetAccountsForTest,
} from 'src/auth/accounts';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

beforeEach(() => {
  resetAccountsForTest();
});

describe('makeAccountId', () => {
  it('compose l\'identité depuis l\'issuer et le sujet', () => {
    expect(makeAccountId('https://sso.linagora.com', 'u-1')).toBe(
      'https%3A%2F%2Fsso.linagora.com|u-1',
    );
  });

  it('ne confond pas deux comptes dont le découpage naïf serait ambigu', () => {
    // Un sub de la forme `google-oauth2|109` est réellement émis par certains
    // fournisseurs. Sans encodage, ces deux appels donnent la même chaîne.
    expect(makeAccountId('https://sso.linagora.com', 'google-oauth2|109')).not.toBe(
      makeAccountId('https://sso.linagora.com|google-oauth2', '109'),
    );
  });
});

describe('registre de comptes', () => {
  it('ajoute un compte et le rend actif', () => {
    const account = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });

    expect(getActiveAccount()?.id).toBe(account.id);
    expect(listAccounts()).toHaveLength(1);
  });

  it('accepte deux comptes sur la même instance', () => {
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    expect(listAccounts()).toHaveLength(2);
  });

  it('ne vole pas le compte actif en ré-ajoutant un compte non actif', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    const second = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });
    setActiveAccount(second.id);

    // Un rafraîchissement de session en arrière-plan repasse par addAccount.
    addAccount({ ...first, displayName: 'Ada Lovelace' });

    expect(getActiveAccount()?.id).toBe(second.id);
    expect(listAccounts()).toHaveLength(2);
  });

  it('bascule le compte actif', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    setActiveAccount(first.id);

    expect(getActiveAccount()?.id).toBe(first.id);
  });

  it('promeut un autre compte quand l\'actif est retiré', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    const second = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    removeAccount(second.id);

    expect(getActiveAccount()?.id).toBe(first.id);
  });

  it('renvoie null quand il ne reste aucun compte', () => {
    const only = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });

    removeAccount(only.id);

    expect(getActiveAccount()).toBe(null);
  });
});
