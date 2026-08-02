import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { EmptyState } from './emptyState';

describe('EmptyState', () => {
  it('pose la couleur explicite, jamais celle du thème', async () => {
    await render(<EmptyState message="Aucune réunion pour l'instant" testID="empty" />);
    expect(screen.getByTestId('empty')).toHaveStyle({ color: tokens.color.textSectionLabel });
  });

  it('affiche son message', async () => {
    await render(<EmptyState message="Aucune réunion pour l'instant" testID="empty" />);
    expect(screen.getByTestId('empty')).toHaveTextContent("Aucune réunion pour l'instant");
  });

  // Deux états vides différents partagent ce composant — journal vide et
  // recherche infructueuse. Il ne doit donc porter aucun message en dur.
  it('rend le message qu’on lui donne, sans en coder aucun', async () => {
    await render(<EmptyState message="Aucune réunion ne correspond" testID="empty" />);
    expect(screen.getByTestId('empty')).toHaveTextContent('Aucune réunion ne correspond');
  });
});
