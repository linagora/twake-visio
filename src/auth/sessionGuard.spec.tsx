import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as login from 'src/auth/login';
import * as session from 'src/auth/session';
import { useSessionGuard } from 'src/auth/sessionGuard';

const mockReplace = jest.fn();
let mockPath = '/home';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPath,
}));

// L'écouteur que le crochet enregistre, capturé pour être déclenché à la main.
// Espionner NOTRE module fonctionne : il est `__esModule`, donc le crochet voit
// bien le double — la borne d'`AGENTS.md` ne vise que `react-native`.
let captured: (() => void) | null = null;

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
  captured = null;
  mockPath = '/home';
  jest.spyOn(login, 'signOut').mockResolvedValue();
  jest.spyOn(session, 'onSessionLost').mockImplementation((listener) => {
    captured = listener;
    return () => {
      captured = null;
    };
  });
});

async function loseSession(): Promise<void> {
  await act(async () => {
    captured?.();
  });
}

describe('useSessionGuard', () => {
  it('renvoie vers la connexion quand la session est perdue', async () => {
    await renderHook(() => useSessionGuard());
    await loseSession();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/welcome'));
    // `signOut` retire le COMPTE. Sans lui, `app/index.tsx` redirige vers
    // l'accueil au prochain démarrage puisqu'un compte actif subsiste, et la
    // personne se retrouve devant une application inerte.
    expect(login.signOut).toHaveBeenCalled();
  });

  // L'autre polarité, et c'est la plus importante : le jeton LiveKit a été
  // frappé à l'entrée en séance et survit à la perte de session. Éjecter
  // quelqu'un d'une réunion en cours serait pire que d'attendre.
  it('ne coupe pas une séance en cours', async () => {
    mockPath = '/room/abc-defg-hij/call';
    await renderHook(() => useSessionGuard());
    await loseSession();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(login.signOut).not.toHaveBeenCalled();
  });

  // Et le report n'est pas un abandon : la perte est mémorisée, et le renvoi
  // se fait dès que la séance est quittée.
  it('renvoie une fois la séance quittée', async () => {
    mockPath = '/room/abc-defg-hij/call';
    const view = await renderHook(() => useSessionGuard());
    await loseSession();
    expect(mockReplace).not.toHaveBeenCalled();

    mockPath = '/home';
    await act(async () => {
      view.rerender(undefined);
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/welcome'));
  });

  it('ne renvoie nulle part tant que la session tient', async () => {
    await renderHook(() => useSessionGuard());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(login.signOut).not.toHaveBeenCalled();
  });

  it('ne renvoie QU’UNE fois pour une même perte', async () => {
    // Le renvoi est déclenché par un effet qui dépend du chemin : sans remise
    // à zéro, chaque navigation ultérieure le rejouerait.
    const view = await renderHook(() => useSessionGuard());
    await loseSession();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));

    mockPath = '/historique';
    await act(async () => {
      view.rerender(undefined);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
