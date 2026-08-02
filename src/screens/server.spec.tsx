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
