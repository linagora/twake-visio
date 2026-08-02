import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ScreenHeader } from './screenHeader';
import { tokens } from 'src/ui/tokens';

describe('ScreenHeader', () => {
  it('affiche le titre de l’écran', async () => {
    await render(
      <ScreenHeader
        backLabel="Retour"
        onBackPress={jest.fn()}
        testID="hdr"
        title="Nouvelle réunion"
      />,
    );

    expect(screen.getByTestId('hdr-title')).toHaveTextContent('Nouvelle réunion');
  });

  // La garde de couleur d'`AGENTS.md` : l'égalité stricte échoue sur n'importe
  // quel repli du thème, donc elle prouve que la couleur explicite n'a pas été
  // retirée. C'est la cause qu'on garde, pas le symptôme.
  it('pose une couleur explicite sur le titre', async () => {
    await render(
      <ScreenHeader backLabel="Retour" onBackPress={jest.fn()} testID="hdr" title="Titre" />,
    );

    expect(screen.getByTestId('hdr-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  // LE test de ce composant. Sans cette commande, un écran poussé est un
  // cul-de-sac : `app/_layout.tsx` masque l'en-tête du Stack, donc le cadre
  // n'en fournit aucune.
  it('appelle le rappel de retour quand on presse la flèche', async () => {
    const onBackPress = jest.fn();
    await render(
      <ScreenHeader backLabel="Retour" onBackPress={onBackPress} testID="hdr" title="Titre" />,
    );

    await fireEvent.press(screen.getByTestId('hdr-back'));

    expect(onBackPress).toHaveBeenCalledTimes(1);
  });

  it('nomme la flèche pour les lecteurs d’écran', async () => {
    await render(
      <ScreenHeader backLabel="Retour" onBackPress={jest.fn()} testID="hdr" title="Titre" />,
    );

    expect(screen.getByLabelText('Retour')).toBeTruthy();
  });
});
