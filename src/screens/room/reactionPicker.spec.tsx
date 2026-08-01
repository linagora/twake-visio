import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { ReactionPicker } from './reactionPicker';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ReactionPicker', () => {
  it('affiche les huit cibles', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy();
    expect(screen.getByTestId('reaction-thumbs-down')).toBeTruthy();
    expect(screen.getByTestId('reaction-clapping-hands')).toBeTruthy();
    expect(screen.getByTestId('reaction-red-heart')).toBeTruthy();
    expect(screen.getByTestId('reaction-face-with-tears-of-joy')).toBeTruthy();
    expect(screen.getByTestId('reaction-face-with-open-mouth')).toBeTruthy();
    expect(screen.getByTestId('reaction-party-popper')).toBeTruthy();
    expect(screen.getByTestId('reaction-folded-hands')).toBeTruthy();
  });

  it('envoie la clé pressée, et seulement celle-là', async () => {
    const onSend = jest.fn();
    await render(<ReactionPicker onSend={onSend} />);

    await fireEvent.press(screen.getByTestId('reaction-red-heart'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('red-heart');

    // Une seconde cible, distincte : sans elle, un rappel qui enverrait
    // toujours 'red-heart' passerait le premier appui aussi.
    await fireEvent.press(screen.getByTestId('reaction-party-popper'));

    expect(onSend).toHaveBeenCalledWith('party-popper');
  });

  it('porte un accessibilityLabel distinct par bouton', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-thumbs-up').props.accessibilityLabel).toBe(
      'reaction.thumbsUp',
    );
    // La dernière de la table, distincte de la première : sans elle, une
    // fonction qui rendrait toujours la même clé passerait le test ci-dessus.
    expect(screen.getByTestId('reaction-folded-hands').props.accessibilityLabel).toBe(
      'reaction.please',
    );
  });

  it('porte une couleur explicite sur son titre de section', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-picker-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('cible quatre boutons par rangée avec une largeur explicite', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-grid')).toHaveStyle({ width: 200 });
  });
});
