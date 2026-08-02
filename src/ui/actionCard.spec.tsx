import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ActionCard } from 'src/ui/actionCard';
import { tokens } from 'src/ui/tokens';

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ActionCard>> = {},
): Promise<unknown> {
  return render(
    <ActionCard
      filled
      glyph="video-outline"
      onCardPress={jest.fn()}
      subtitle="Démarrer maintenant et partager le lien"
      testID="card"
      title="Nouvelle réunion"
      {...overrides}
    />,
  );
}

describe('ActionCard', () => {
  describe('les deux variantes', () => {
    // Chaque variante avec sa fixture : sans la seconde, une carte toujours
    // pleine passerait les deux tests.
    it('écrit en blanc sur la carte pleine', async () => {
      await renderCard({ filled: true });
      expect(screen.getByTestId('card-title')).toHaveStyle({ color: tokens.color.onBrand });
    });

    it('écrit en texte principal sur la carte à filet', async () => {
      await renderCard({ filled: false });
      expect(screen.getByTestId('card-title')).toHaveStyle({ color: tokens.color.textPrimary });
    });

    it('adoucit le sous-titre différemment selon la variante', async () => {
      await renderCard({ filled: false });
      expect(screen.getByTestId('card-subtitle')).toHaveStyle({ color: tokens.color.textMeta });
    });

    // Le glyphe suit la variante : blanc sur le dégradé, vert de marque sur la
    // carte claire.
    it('teinte le glyphe en blanc sur la carte pleine', async () => {
      await renderCard({ filled: true });
      expect(screen.getByTestId('card-glyph')).toHaveStyle({ color: tokens.color.onBrand });
    });

    it('teinte le glyphe en brandStrong sur la carte à filet', async () => {
      await renderCard({ filled: false });
      expect(screen.getByTestId('card-glyph')).toHaveStyle({ color: tokens.color.brandStrong });
    });
  });

  it('affiche son titre et son sous-titre', async () => {
    await renderCard();
    expect(screen.getByTestId('card-title')).toHaveTextContent('Nouvelle réunion');
    expect(screen.getByTestId('card-subtitle')).toHaveTextContent(
      'Démarrer maintenant et partager le lien',
    );
  });

  // `onCardPress`, jamais `onPress` : `fireEvent.press` remonte jusqu'au premier
  // ancêtre HÔTE, donc une prop qui reprend le nom d'un événement hôte serait
  // trouvée sur notre propre fibre et le test passerait sans câblage.
  it('appelle onCardPress', async () => {
    const onCardPress = jest.fn();
    await renderCard({ onCardPress });
    await fireEvent.press(screen.getByTestId('card'));
    expect(onCardPress).toHaveBeenCalledTimes(1);
  });

  // Le glyphe doit être transmis, sinon les deux cartes de l'accueil porteraient
  // le même dessin. On compare les points de code entre eux plutôt qu'à des
  // littéraux illisibles.
  it('rend un dessin différent selon le glyphe demandé', async () => {
    await render(
      <>
        <ActionCard
          filled
          glyph="video-outline"
          onCardPress={jest.fn()}
          subtitle="s"
          testID="a"
          title="t"
        />
        <ActionCard
          filled={false}
          glyph="login-variant"
          onCardPress={jest.fn()}
          subtitle="s"
          testID="b"
          title="t"
        />
      </>,
    );
    const first = String(screen.getByTestId('a-glyph').props.children);
    const second = String(screen.getByTestId('b-glyph').props.children);

    expect(first).not.toBe(second);
  });
});
