import { addAccount, resetAccountsForTest, type Account } from 'src/auth/accounts';
import {
  endGuestSession,
  rememberGuestName,
  resetGuestForTest,
  startGuestSession,
} from 'src/auth/guest';
import { getVisitor, visitorName, visitorServerUrl } from 'src/auth/visitor';

const ACCOUNT: Account = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

beforeEach(() => {
  resetAccountsForTest();
  resetGuestForTest();
});

describe('getVisitor', () => {
  it('rend null quand il n’y a ni compte ni session invité', () => {
    expect(getVisitor()).toBe(null);
  });

  it('rend le compte actif quand il y en a un', () => {
    addAccount(ACCOUNT);

    expect(getVisitor()).toEqual({ kind: 'account', account: ACCOUNT });
  });

  it('rend la session invité en l’absence de compte', () => {
    startGuestSession('https://meet.acme.com');
    rememberGuestName('Camille');

    expect(getVisitor()).toEqual({
      kind: 'guest',
      serverUrl: 'https://meet.acme.com',
      displayName: 'Camille',
    });
  });

  // La branche qui compte : les deux présents. Reprendre l'invité ferait entrer
  // quelqu'un de connecté sans aucun de ses droits.
  it('préfère le COMPTE quand une session invité traîne aussi', () => {
    startGuestSession('https://meet.acme.com');
    addAccount(ACCOUNT);

    expect(getVisitor()).toEqual({ kind: 'account', account: ACCOUNT });
  });
});

describe('la session invité', () => {
  it('survit à endGuestSession pour le NOM, pas pour le serveur', () => {
    startGuestSession('https://meet.acme.com');
    rememberGuestName('Camille');

    endGuestSession();

    expect(getVisitor()).toBe(null);
    startGuestSession('https://meet.autre.com');
    expect(visitorName(getVisitor()!)).toBe('Camille');
  });

  it('rend un nom vide quand rien n’a été mémorisé', () => {
    startGuestSession('https://meet.acme.com');

    expect(visitorName(getVisitor()!)).toBe('');
  });
});

describe('visitorServerUrl', () => {
  it('rend celui de l’instance pour un compte', () => {
    expect(visitorServerUrl({ kind: 'account', account: ACCOUNT })).toBe(
      'https://meet.linagora.com',
    );
  });

  it('rend celui de la session pour un invité', () => {
    expect(
      visitorServerUrl({ kind: 'guest', serverUrl: 'https://meet.acme.com', displayName: 'C' }),
    ).toBe('https://meet.acme.com');
  });
});
