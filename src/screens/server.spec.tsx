import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as login from 'src/auth/login';
import * as emailResolution from 'src/instance/emailResolution';
import { ServerScreen } from './server';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ACCOUNT: login.LoginResult = {
  ok: true,
  value: {
    id: 'https://sso.linagora.com|u-1',
    instance: {
      serverUrl: 'https://meet.linagora.com',
      issuer: 'https://sso.linagora.com',
      clientId: 'twake-visio',
      livekitUrl: 'wss://livekit.linagora.com',
      features: { recording: true, subtitle: true, telephony: false, calendar: false },
    },
    email: 'ada@linagora.com',
    displayName: 'Ada',
  },
};

let resolve: jest.SpyInstance<Promise<emailResolution.EmailResolution>, [string]>;
let connect: jest.SpyInstance<Promise<login.LoginResult>, [string, (string | undefined)?]>;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resolve = jest.spyOn(emailResolution, 'fetchServerUrlForEmail');
  connect = jest.spyOn(login, 'signIn');
});

async function submitEmail(address: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('email-input'), address);
  await fireEvent.press(screen.getByTestId('server-continue-btn'));
}

// Le `URL` que l'APPLICATION exécute, à côté de celui de Node que Jest fournit.
// Les deux ne refusent pas les mêmes chaînes : la mesure complète est dans
// `pasted.spec.ts`. Ici il sert à faire rougir des tests qui, écrits sous Node,
// seraient verts contre du code cassé. `require` parce que ce module est en
// Flow et n'expose aucun type.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { URL: ReactNativeURL } = require('react-native/Libraries/Blob/URL') as { URL: typeof URL };

describe('ServerScreen', () => {
  it("demande une adresse email, et non l'URL d'un serveur", async () => {
    await render(<ServerScreen />);

    // react-native-paper rend le libellé à part du champ natif : le testID
    // désigne le champ, le libellé se cherche par son texte.
    const input = screen.getByTestId('email-input');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoCapitalize).toBe('none');
    expect(screen.queryAllByText('server.emailPrompt').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('server.prompt')).toEqual([]);
    expect(screen.queryByTestId('server-input')).toBe(null);
  });

  it("se connecte à l'instance résolue en transmettant l'adresse en login_hint", async () => {
    // Sans login_hint, la page SSO redemande l'adresse que la personne vient
    // de taper : c'est l'erreur classique que twake-mobile-login liste.
    resolve.mockResolvedValue({ ok: true, value: 'https://meet.linagora.com' });
    connect.mockResolvedValue(ACCOUNT);

    await render(<ServerScreen />);
    await submitEmail('ada@linagora.com');

    expect(resolve).toHaveBeenCalledWith('ada@linagora.com');
    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith('https://meet.linagora.com', 'ada@linagora.com');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('révèle la saisie manuelle du serveur quand aucune instance ne répond', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'instance-not-found' });

    await render(<ServerScreen />);
    await submitEmail('ada@example.org');

    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });
    expect(screen.getByText('server.notFound')).toBeTruthy();
    expect(connect).not.toHaveBeenCalled();
  });

  it('mène la voie manuelle jusqu au bout, adresse comprise', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'instance-not-found' });
    connect.mockResolvedValue(ACCOUNT);

    await render(<ServerScreen />);
    await submitEmail('ada@example.org');
    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });

    await fireEvent.changeText(screen.getByTestId('server-input'), 'meet.example.org');
    await fireEvent.press(screen.getByTestId('server-continue-btn'));

    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith('https://meet.example.org', 'ada@example.org');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('refuse une adresse de serveur manuelle illisible sans tenter la connexion', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'instance-not-found' });

    await render(<ServerScreen />);
    await submitEmail('ada@example.org');
    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });

    await fireEvent.changeText(screen.getByTestId('server-input'), 'https://');
    await fireEvent.press(screen.getByTestId('server-continue-btn'));

    await waitFor(() => {
      expect(screen.getByText('server.invalid')).toBeTruthy();
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('laisse retenter la résolution tant que le champ manuel reste vide', async () => {
    // Une faute de frappe dans l'adresse doit rester corrigeable après coup :
    // le champ manuel révélé ne prend la main que lorsqu'il est rempli.
    resolve.mockResolvedValueOnce({ ok: false, error: 'instance-not-found' });
    resolve.mockResolvedValueOnce({ ok: true, value: 'https://meet.linagora.com' });
    connect.mockResolvedValue(ACCOUNT);

    await render(<ServerScreen />);
    await submitEmail('ada@exemple.org');
    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });

    await submitEmail('ada@linagora.com');

    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith('https://meet.linagora.com', 'ada@linagora.com');
    });
  });

  it('ne bascule pas en saisie manuelle sur une adresse mal formée', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'invalid-email' });

    await render(<ServerScreen />);
    await submitEmail('linagora.com');

    await waitFor(() => {
      expect(screen.getByText('server.emailInvalid')).toBeTruthy();
    });
    expect(screen.queryByTestId('server-input')).toBe(null);
  });

  it("révèle la saisie manuelle quand le serveur résolu n'est pas une instance meet", async () => {
    resolve.mockResolvedValue({ ok: true, value: 'https://meet.example.org' });
    connect.mockResolvedValue({ ok: false, error: 'not-a-meet-instance' });

    await render(<ServerScreen />);
    await submitEmail('ada@example.org');

    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });
    expect(screen.getByText('server.invalid')).toBeTruthy();
  });

  it('signale un serveur injoignable et propose la saisie manuelle', async () => {
    resolve.mockResolvedValue({ ok: true, value: 'https://meet.example.org' });
    connect.mockResolvedValue({ ok: false, error: 'unreachable' });

    await render(<ServerScreen />);
    await submitEmail('ada@example.org');

    await waitFor(() => {
      expect(screen.getByText('server.unreachable')).toBeTruthy();
    });
    expect(screen.queryByTestId('server-input')).not.toBe(null);
  });

  it('ne propose pas un autre serveur quand la connexion est simplement abandonnée', async () => {
    // Fermer le navigateur système ne dit rien sur le serveur : proposer d'en
    // saisir un autre ferait douter d'une adresse qui, elle, était bonne.
    resolve.mockResolvedValue({ ok: true, value: 'https://meet.linagora.com' });
    connect.mockResolvedValue({ ok: false, error: 'cancelled' });

    await render(<ServerScreen />);
    await submitEmail('ada@linagora.com');

    await waitFor(() => {
      expect(screen.getByText('server.signInFailed')).toBeTruthy();
    });
    expect(screen.queryByTestId('server-input')).toBe(null);
  });

  // Le retour va à `welcome`, et non à `home` : on n'est pas encore connecté
  // ici. Sans cette flèche, changer d'avis après avoir choisi « se connecter »
  // demandait de tuer l'application.
  it('offre une sortie vers l’écran d’accueil non connecté', async () => {
    await render(<ServerScreen />);

    await fireEvent.press(screen.getByTestId('server-header-back'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});

describe("l'adresse manuelle, sous l'URL de l'APPAREIL", () => {
  /**
   * Ce bloc existe parce que le `try`/`catch` de `normalizeServerUrl` ne
   * refusait presque RIEN sur un téléphone, et que ses tests le laissaient
   * croire.
   *
   * React Native installe son propre `URL` (`polyfillGlobal('URL', …)`,
   * `Libraries/Core/setUpXHR.js:35`), un jeu de regex qui ne jette pas et dont
   * le getter `origin` (`/^(https?:\/\/[^/]+)/`) accepte les espaces. Le test
   * historique passait `'https://'`, qui lève dans les DEUX moteurs : il ne
   * disait donc rien de l'appareil.
   *
   * Conséquence sur le chemin de CONNEXION : quelqu'un tapait « mon serveur »,
   * l'écran l'acceptait, et la connexion partait vers une adresse malformée.
   */
  let nodeUrl: typeof URL;

  beforeEach(() => {
    nodeUrl = globalThis.URL;
    globalThis.URL = ReactNativeURL;
  });

  afterEach(() => {
    globalThis.URL = nodeUrl;
  });

  async function revealManual(): Promise<void> {
    resolve.mockResolvedValue({ ok: false, error: 'instance-not-found' });
    await render(<ServerScreen />);
    await submitEmail('ada@example.org');
    await waitFor(() => {
      expect(screen.queryByTestId('server-input')).not.toBe(null);
    });
  }

  async function submitServer(value: string): Promise<void> {
    await fireEvent.changeText(screen.getByTestId('server-input'), value);
    await fireEvent.press(screen.getByTestId('server-continue-btn'));
  }

  it("REFUSE une adresse à espaces, que l'URL de React Native accepterait", async () => {
    await revealManual();

    await submitServer('mon serveur');

    await waitFor(() => {
      expect(screen.getByText('server.invalid')).toBeTruthy();
    });
    expect(connect).not.toHaveBeenCalled();
  });

  // `startsWith('http')` laissait passer tout schéma commençant par « http ».
  // Node rend alors l'origine « null » — la CHAÎNE, pas la valeur — et cette
  // chaîne partait comme adresse de serveur.
  it('REFUSE un schéma qui ressemble à http sans en être', async () => {
    await revealManual();

    await submitServer('httpsx://evil.example');

    await waitFor(() => {
      expect(screen.getByText('server.invalid')).toBeTruthy();
    });
    expect(connect).not.toHaveBeenCalled();
  });

  // Le dépôt refuse déjà `http` pour un lien de réunion (`deepLinks.spec.ts:53`,
  // `pasted.spec.ts:50`). Une connexion OIDC en clair est pire encore : elle
  // porte des jetons.
  it('REFUSE http en clair, comme les liens de réunion', async () => {
    await revealManual();

    await submitServer('http://meet.example.org');

    await waitFor(() => {
      expect(screen.getByText('server.invalid')).toBeTruthy();
    });
    expect(connect).not.toHaveBeenCalled();
  });

  // La polarité vraie : ce qui doit continuer de passer, port compris.
  it('accepte un hôte nu, et conserve son port', async () => {
    connect.mockResolvedValue(ACCOUNT);
    await revealManual();

    await submitServer('meet.example.org:8443');

    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith('https://meet.example.org:8443', 'ada@example.org');
    });
  });
});
