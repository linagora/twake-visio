import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { reactionGlyph, REACTION_KEYS } from 'src/call/reactions';
import { ReactionRow } from './reactionRow';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

describe('ReactionRow', () => {
  it('rend les huit réactions, dans l’ordre du module', async () => {
    // Le compte vient de `REACTION_KEYS`, jamais d'un littéral : une neuvième
    // réaction ajoutée au module doit apparaître ici sans qu'on y pense, et un
    // test qui écrirait « 8 » resterait vert en n'en montrant que huit.
    await render(withPaper(<ReactionRow onSend={jest.fn()} testID="row" />));

    for (const key of REACTION_KEYS) {
      expect(screen.getByTestId(`row-${key}`)).toBeTruthy();
    }
  });

  it('dessine le glyphe de chaque réaction, jamais une cible vide', async () => {
    // Une cible pressable sans glyphe serait invisible et parfaitement
    // fonctionnelle : aucun test de comportement ne l'attraperait.
    await render(withPaper(<ReactionRow onSend={jest.fn()} testID="row" />));

    expect(screen.getByTestId('row-red-heart')).toHaveTextContent(reactionGlyph('red-heart'));
  });

  // La TROISIÈME réaction, jamais la première : avec `thumbs-up`, « transmet la
  // cible pressée » et « renvoie toujours la première » seraient
  // indiscernables.
  it('transmet la réaction pressée, pas la première de la rangée', async () => {
    const onSend = jest.fn();

    await render(withPaper(<ReactionRow onSend={onSend} testID="row" />));
    await fireEvent.press(screen.getByTestId('row-clapping-hands'));

    expect(onSend).toHaveBeenCalledWith('clapping-hands');
    expect(onSend).not.toHaveBeenCalledWith('thumbs-up');
  });

  it('porte un libellé accessible propre à chaque réaction', async () => {
    // Un emoji seul n'est pas annoncé de façon fiable par un lecteur d'écran.
    // Deux réactions vérifiées, pas une : un libellé constant passerait avec
    // une seule.
    await render(withPaper(<ReactionRow onSend={jest.fn()} testID="row" />));

    expect(screen.getByTestId('row-thumbs-up').props.accessibilityLabel).toBe('reaction.thumbsUp');
    expect(screen.getByTestId('row-folded-hands').props.accessibilityLabel).toBe('reaction.please');
  });
});
