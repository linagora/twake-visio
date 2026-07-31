import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallbackScreen } from 'src/screens/callback';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CallbackScreen', () => {
  // La raison d'être de cet écran est de ne PAS être « Unmatched Route ».
  // C'est donc son existence même qui est la garde : si le fichier
  // `app/callback.tsx` disparaît, expo-router n'a plus de cible pour la
  // redirection OIDC et l'écran d'erreur revient.
  it('rend un état d’attente, jamais une erreur', async () => {
    await render(<CallbackScreen />);

    expect(screen.getByTestId('callback-screen')).toBeTruthy();
    expect(screen.getByTestId('callback-spinner')).toBeTruthy();
    expect(screen.getByTestId('callback-label')).toHaveTextContent('callback.signingIn');
  });

  // L'écran est traversé, pas habité : il ne doit porter aucune commande. Une
  // action ici entrerait en course avec le `router.replace('/home')` de signIn,
  // qui s'exécute pendant que cet écran est monté.
  it('ne propose aucune action', async () => {
    await render(<CallbackScreen />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
