import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { AppHeader } from './appHeader';

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof AppHeader>> = {},
): Promise<unknown> {
  return render(
    <AppHeader
      onAvatarPress={jest.fn()}
      testID="header"
      title="Twake Visio"
      userName="Michel Maudet"
      {...overrides}
    />,
  );
}

describe('AppHeader', () => {
  it('pose la couleur explicite du titre', async () => {
    await renderHeader();
    expect(screen.getByTestId('header-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('pose le fond explicite de la barre', async () => {
    await renderHeader();
    expect(screen.getByTestId('header')).toHaveStyle({
      backgroundColor: tokens.color.cardSurface,
    });
  });

  // Le titre change d'un onglet à l'autre : la fixture doit en prendre au
  // moins deux, sinon une constante passerait.
  it.each(['Twake Visio', 'Historique', 'Réglages'])('affiche le titre « %s »', async (title) => {
    await renderHeader({ title });
    expect(screen.getByTestId('header-title')).toHaveTextContent(title);
  });

  it('rend les initiales de la personne connectée', async () => {
    await renderHeader({ userName: 'Sophie Renard' });
    expect(screen.getByTestId('header-avatar-badge-text')).toHaveTextContent('SR');
  });

  // `onAvatarPress`, jamais `onPress`.
  it('appelle onAvatarPress quand on presse l’avatar', async () => {
    const onAvatarPress = jest.fn();
    await renderHeader({ onAvatarPress });
    await fireEvent.press(screen.getByTestId('header-avatar'));
    expect(onAvatarPress).toHaveBeenCalledTimes(1);
  });
});
