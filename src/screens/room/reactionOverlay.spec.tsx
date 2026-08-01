import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { Reaction } from 'src/call/reactions';
import { tokens } from 'src/ui/tokens';
import { ReactionOverlay } from './reactionOverlay';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function reaction(overrides: Partial<Reaction> = {}): Reaction {
  return {
    id: 'r-1',
    key: 'thumbs-up',
    identity: 'u-ada',
    name: 'Ada',
    isLocal: false,
    at: 0,
    ...overrides,
  };
}

describe('ReactionOverlay', () => {
  it('ne rend rien sans réaction', async () => {
    await render(<ReactionOverlay reactions={[]} />);

    expect(screen.queryByTestId('reaction-overlay')).toBe(null);
  });

  it('affiche une bulle par réaction, la seconde comprise', async () => {
    await render(
      <ReactionOverlay
        reactions={[
          reaction({ id: 'r-1', key: 'thumbs-up', name: 'Ada', isLocal: false }),
          reaction({ id: 'r-2', key: 'party-popper', name: 'Bob', isLocal: false }),
        ]}
      />,
    );

    expect(screen.getByTestId('reaction-bubble-r-1')).toBeTruthy();
    expect(screen.getByTestId('reaction-bubble-name-r-2')).toHaveTextContent('Bob');
  });

  it('étiquette sa propre bulle « You », jamais son nom', async () => {
    await render(
      <ReactionOverlay reactions={[reaction({ id: 'r-1', name: 'Ada', isLocal: true })]} />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent('call.you');
  });

  it("replie sur le libellé d'anonyme un nom vide, à distance", async () => {
    await render(
      <ReactionOverlay reactions={[reaction({ id: 'r-1', name: '   ', isLocal: false })]} />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent(
      'call.unnamedParticipant',
    );
  });

  it('porte une couleur explicite sur le nom, et un fond explicite sur la bulle', async () => {
    await render(<ReactionOverlay reactions={[reaction({ id: 'r-1' })]} />);

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('reaction-bubble-r-1')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });
});
