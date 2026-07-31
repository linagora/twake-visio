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
  it("compose l'identité depuis l'issuer et le sujet", () => {
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

    // La mise à jour se fait sur place : position conservée et enregistrement
    // remplacé. Un filter+append passerait les deux assertions précédentes.
    const listed = listAccounts();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe(first.id);
    expect(listed[0]?.displayName).toBe('Ada Lovelace');
    expect(listed[1]?.id).toBe(second.id);
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

  it("promeut un autre compte quand l'actif est retiré", () => {
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

// La mémorisation est la raison d'être du magasin : sans elle, `app/index.tsx`
// retombe sur `/welcome` à chaque démarrage à froid. Elle ne peut se vérifier
// qu'en rejouant le chargement du module, puisque l'hydratation n'a lieu qu'à
// l'import — d'où `jest.resetModules()` et le ré-import.
describe('mémorisation entre deux démarrages', () => {
  // `require` et non `import` : la configuration Jest de ce dépôt est en
  // CommonJS, où un `import()` dynamique lève « A dynamic import callback was
  // invoked without --experimental-vm-modules ». Et c'est le seul moyen de
  // rejouer le chargement du module, donc d'exercer l'hydratation — qui n'a lieu
  // qu'à l'import. Une fonction `hydrateForTest()` exportée serait pire : une
  // API de test dans du code de production.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const reload = (): typeof import('src/auth/accounts') => require('src/auth/accounts');
  const mmkv = (): typeof import('react-native-mmkv') => require('react-native-mmkv');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const ACCOUNT = {
    id: makeAccountId(CONFIG.issuer, 'u-1'),
    instance: CONFIG,
    email: 'ada@linagora.com',
    displayName: 'Ada',
  };

  it('retrouve le compte actif après un redémarrage à froid', () => {
    addAccount(ACCOUNT);
    setActiveAccount(ACCOUNT.id);

    jest.resetModules();
    const reloaded = reload();

    expect(reloaded.getActiveAccount()?.id).toBe(ACCOUNT.id);
    expect(reloaded.getActiveAccount()?.email).toBe('ada@linagora.com');
    // L'instance suit le compte : sans elle, l'application saurait qui est
    // connecté mais plus à quel serveur, et tout appel partirait dans le vide.
    expect(reloaded.getActiveAccount()?.instance.serverUrl).toBe(CONFIG.serverUrl);
    reloaded.resetAccountsForTest();
  });

  // Trouvé par mutation : les autres cas appellent `setActiveAccount` juste
  // après `addAccount`, et comme il persiste lui aussi, retirer l'écriture
  // d'`addAccount` les laissait tous verts. Celui-ci n'active rien
  // explicitement — `addAccount` s'en charge quand aucun compte ne l'est — donc
  // il n'exerce que son écriture à elle.
  it('mémorise un compte ajouté, sans activation explicite', () => {
    addAccount(ACCOUNT);

    jest.resetModules();
    const reloaded = reload();

    expect(reloaded.listAccounts()).toHaveLength(1);
    expect(reloaded.getActiveAccount()?.id).toBe(ACCOUNT.id);
    reloaded.resetAccountsForTest();
  });

  it('oublie un compte retiré, plutôt que de le ressusciter au redémarrage', () => {
    addAccount(ACCOUNT);
    removeAccount(ACCOUNT.id);

    jest.resetModules();
    const reloaded = reload();

    expect(reloaded.listAccounts()).toHaveLength(0);
    expect(reloaded.getActiveAccount()).toBeNull();
    reloaded.resetAccountsForTest();
  });

  // Une entrée corrompue est jetée, jamais rendue à moitié : un compte sans
  // instance ferait planter chaque écran qui la lit, loin d'ici.
  it('écarte une entrée malformée au lieu de la rendre', () => {
    addAccount(ACCOUNT);
    const { createMMKV } = mmkv();
    createMMKV({ id: 'accounts' }).set(
      'accounts',
      JSON.stringify([{ id: 'x', email: 'e', displayName: 'd' }]),
    );

    jest.resetModules();
    const reloaded = reload();

    expect(reloaded.listAccounts()).toHaveLength(0);
    reloaded.resetAccountsForTest();
  });
});
