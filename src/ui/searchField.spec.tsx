import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SearchField } from './searchField';

describe('SearchField', () => {
  it('pose la couleur explicite de la saisie', async () => {
    await render(
      <SearchField
        onQueryChange={jest.fn()}
        placeholder="Rechercher une réunion"
        testID="search"
        value=""
      />,
    );
    expect(screen.getByTestId('search-input')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  // Le texte indicatif ne suit PAS `color` : RN le prend sur
  // `placeholderTextColor`. Sans lui, Paper n'étant pas dans la boucle, il
  // retombe sur un gris système qu'on ne contrôle pas.
  it('pose la couleur explicite du texte indicatif', async () => {
    await render(
      <SearchField
        onQueryChange={jest.fn()}
        placeholder="Rechercher une réunion"
        testID="search"
        value=""
      />,
    );
    expect(screen.getByTestId('search-input')).toHaveProp(
      'placeholderTextColor',
      tokens.color.textSectionLabel,
    );
  });

  it('affiche la valeur qu’on lui donne', async () => {
    await render(
      <SearchField
        onQueryChange={jest.fn()}
        placeholder="Rechercher une réunion"
        testID="search"
        value="produit"
      />,
    );
    expect(screen.getByTestId('search-input')).toHaveProp('value', 'produit');
  });

  // `onQueryChange`, pas `onChangeText` : une prop qui reprend le nom d'un
  // événement hôte est trouvée par `fireEvent` sur la fibre du composant
  // lui-même, et le test passerait que la prop soit câblée ou non.
  it('remonte chaque frappe via onQueryChange', async () => {
    const onQueryChange = jest.fn();
    await render(
      <SearchField
        onQueryChange={onQueryChange}
        placeholder="Rechercher une réunion"
        testID="search"
        value=""
      />,
    );
    await fireEvent.changeText(screen.getByTestId('search-input'), 'produit');
    expect(onQueryChange).toHaveBeenCalledWith('produit');
  });
});
