import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { Reaction } from 'src/call/reactions';
import { tokens } from 'src/ui/tokens';
import { CALL_SURFACE_HAIRLINE } from './callHeader';
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
    await render(<ReactionOverlay reactions={[]} chatOpen={false} />);

    expect(screen.queryByTestId('reaction-overlay')).toBe(null);
  });

  it('affiche une bulle par réaction, la seconde comprise', async () => {
    await render(
      <ReactionOverlay
        chatOpen={false}
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
      <ReactionOverlay
        chatOpen={false}
        reactions={[reaction({ id: 'r-1', name: 'Ada', isLocal: true })]}
      />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent('call.you');
  });

  it("replie sur le libellé d'anonyme un nom vide, à distance", async () => {
    await render(
      <ReactionOverlay
        chatOpen={false}
        reactions={[reaction({ id: 'r-1', name: '   ', isLocal: false })]}
      />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent(
      'call.unnamedParticipant',
    );
  });

  it('porte une couleur explicite sur le nom, et un fond explicite sur la bulle', async () => {
    await render(<ReactionOverlay chatOpen={false} reactions={[reaction({ id: 'r-1' })]} />);

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('reaction-bubble-r-1')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
      // Le même filet que les puces et la carte du bandeau d'admission : la
      // bulle se pose sur de la VIDÉO, dont on ne connaît ni la couleur ni la
      // luminance, et c'est le seul endroit de cet écran où un fond opaque
      // reste obligatoire. Le filet lui donne son bord quand la vidéo derrière
      // est sombre.
      borderColor: CALL_SURFACE_HAIRLINE,
    });
  });

  // Les bulles sont ancrées EN BAS À DROITE, et c'est exactement le coin qu'une
  // commande occupe : `leave-btn` termine la barre, `chat-send` termine la zone
  // de saisie. RNTL ne dispose rien, donc AUCUN test ne peut voir un
  // recouvrement — ce qu'il peut voir, c'est le nombre, et le nombre est
  // maintenant CALCULÉ. Les deux tests qui suivent le gardent aux deux valeurs
  // qu'il peut prendre ; l'arithmétique et sa provenance sont dans
  // `reactionOverlay.tsx`, à côté des constantes.
  it('dégage la hauteur réelle de la barre de contrôle sous la plus basse bulle', async () => {
    await render(<ReactionOverlay chatOpen={false} reactions={[reaction()]} />);

    // 52 (le côté d'un bouton de barre) + 2 × 4 (le rembourrage de la rangée)
    // + 8 (un pas d'écart, pour que la bulle ne colle pas à la barre) = 64.
    // La valeur d'avant était `tokens.spacing.xl`, soit 32 : la plus basse des
    // bulles se posait 28 dp À L'INTÉRIEUR de la barre, donc sur « raccrocher ».
    expect(screen.getByTestId('reaction-overlay')).toHaveStyle({ paddingBottom: 64 });
  });

  it('dégage aussi la zone de saisie quand le panneau de discussion est ouvert', async () => {
    await render(<ReactionOverlay chatOpen reactions={[reaction()]} />);

    // Les 64 ci-dessus, plus le bas du panneau de discussion : 56 (la rangée de
    // saisie) + 16 (le rembourrage bas de sa racine) = 136. Sans cette
    // seconde valeur, les bulles se posaient sur `chat-send` dès la deuxième.
    expect(screen.getByTestId('reaction-overlay')).toHaveStyle({ paddingBottom: 136 });
  });
});
