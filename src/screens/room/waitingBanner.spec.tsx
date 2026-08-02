import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { CALL_META_TEXT, CALL_SURFACE_HAIRLINE } from './callHeader';
import {
  WAITING_REFUSE_OUTLINE,
  WAITING_REFUSE_TEXT,
  WAITING_SURFACE,
  WaitingBanner,
} from './waitingBanner';

// Interpole vraiment `name`, contrairement au mock habituel du dépôt qui
// rend la clé telle quelle : c'est la seule façon de distinguer, dans un
// test, quel champ du participant finit à l'écran. Sans elle,
// `t('waiting.knocking', { name: participant.id })` rendrait la même chose
// que la bonne implémentation, et rien ne dirait que le modérateur lit
// l'UUID brute plutôt que le nom.
const mockT = jest.fn((key: string, options?: { name?: string }) =>
  options?.name !== undefined ? `${key}:${options.name}` : key,
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

const ADA = { id: 'p-1', username: 'Ada' };

describe('WaitingBanner', () => {
  it("ne s'affiche pas quand personne n'attend", async () => {
    await render(<WaitingBanner participant={null} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-banner')).toBe(null);
  });

  it('admet la personne affichée', async () => {
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-admit'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', true);
  });

  it('refuse la personne affichée', async () => {
    // Admettre et refuser partent vers le même endpoint : inverser le booléen
    // laisserait entrer qui on voulait écarter.
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-refuse'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', false);
  });

  it('annonce les personnes restantes', async () => {
    await render(<WaitingBanner participant={ADA} remaining={2} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-others')).toBeTruthy();
  });

  it("n'annonce rien quand personne d'autre n'attend", async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-others')).toBe(null);
  });

  // M1 : `t('waiting.knocking', { name: participant.id })` passait les cinq
  // tests ci-dessus aussi bien que la bonne implémentation — rien n'assurait
  // quel champ finissait à l'écran. Le mock interpolant ci-dessus distingue
  // les deux : `Ada` ici, `p-1` avec la régression.
  it('affiche le nom de la personne, pas un autre champ', async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.getByText('waiting.knocking:Ada')).toBeTruthy();
  });

  it('affiche un repli traduit quand le nom est vide', async () => {
    // Même convention que stage.tsx et participantsPanel.tsx : jamais
    // d'identifiant brut ni de vide à l'écran. Le bandeau était le seul des
    // trois composants affichant un nom à ne pas l'avoir.
    await render(
      <WaitingBanner
        participant={{ id: 'p-9', username: '' }}
        remaining={0}
        onAnswer={jest.fn()}
      />,
    );

    expect(screen.getByText('waiting.knocking:call.unnamedParticipant')).toBeTruthy();
  });

  // C1 : le bandeau est sombre dans les deux schémas (une carte `#1D2622`, un
  // littéral), mais ni le nom ni le compteur ne posaient de couleur de texte
  // avant ce correctif — ils retombaient sur `theme.colors.onSurface`, que
  // `makeTheme` fixe désormais TOUJOURS au quasi-noir du thème clair. 1,15:1,
  // largement sous les 4,5:1 exigés par WCAG AA. RNTL ne rend pas les
  // couleurs ; ce test ne peut donc garder que le style est bien posé, pas
  // qu'il rend lisible.
  it('pose la couleur claire du nom et la couleur de méta du compteur', async () => {
    await render(<WaitingBanner participant={ADA} remaining={1} onAnswer={jest.fn()} />);

    // 13,14:1 sur #1D2622.
    expect(screen.getByText('waiting.knocking:Ada')).toHaveStyle({ color: tokens.color.textDark });
    // 5,34:1 sur #1D2622 — la hiérarchie du mockup, pas un texte affaibli au
    // hasard. `tokens.color.muted` (#6B7280) n'y tenait que 3,21:1.
    expect(screen.getByTestId('waiting-others')).toHaveStyle({ color: CALL_META_TEXT });
  });

  // On force la SURFACE et le TEXTE, ou ni l'un ni l'autre : une surface forcée
  // sous un texte laissé au thème est le pire des trois cas.
  it('pose son propre fond de carte et son filet', async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-banner')).toHaveStyle({
      backgroundColor: WAITING_SURFACE,
      borderColor: CALL_SURFACE_HAIRLINE,
      borderRadius: 16,
    });
  });

  it('coiffe la personne qui frappe de ses initiales', async () => {
    // Les initiales viennent du LIBELLÉ affiché, donc du repli quand le nom est
    // vide : un disque vide à côté d'un nom se lit comme une panne d'affichage.
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-avatar-text')).toHaveTextContent('A');
  });

  it('tronque le nom plutôt que de pousser les deux actions hors de l’écran', async () => {
    // `flexShrink` vaut 0 par défaut sous Yoga, à l'inverse du web : sans lui,
    // une phrase allemande longue pousse « Refuser » et « Admettre » hors de
    // l'écran — le défaut mesuré à 39 px dans `participantsPanel.tsx`.
    await render(<WaitingBanner participant={ADA} remaining={1} onAnswer={jest.fn()} />);

    // Les DEUX lignes, pas seulement la première : `waiting.others` interpole un
    // compte dans une phrase, et l'allemand la fait déborder tout autant.
    expect(screen.getByText('waiting.knocking:Ada')).toHaveProp('numberOfLines', 1);
    expect(screen.getByTestId('waiting-others')).toHaveProp('numberOfLines', 1);
    expect(screen.getByTestId('waiting-identity')).toHaveStyle({ flexShrink: 1 });
  });

  // Le bouton Refuser est `mode="outlined"`, pas `mode="contained"` comme
  // Admettre : sans fond propre, son texte retombe par défaut sur
  // `theme.colors.primary`, qui est désormais toujours celui du thème clair —
  // #177E44 sur #1D2622 : 3,03:1, même défaut de fond que C1.
  it('pose la couleur du texte et du contour du bouton Refuser', async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    // 8,61:1 sur #1D2622.
    expect(screen.getByTestId('waiting-refuse-text')).toHaveStyle({ color: WAITING_REFUSE_TEXT });
    // Le contour EST l'affordance de ce bouton-là : c'est la seule chose qui le
    // délimite face au bouton plein d'à côté. Soumis aux 3:1 de WCAG 1.4.11,
    // et c'est la raison pour laquelle la valeur du mockup a dû monter.
    expect(screen.getByTestId('waiting-refuse-container')).toHaveStyle({
      borderColor: WAITING_REFUSE_OUTLINE,
    });
  });

  it('pose le vert porteur de texte et le blanc du bouton Admettre', async () => {
    // `brandStrong` et non `brand` : du blanc sur #1FA45C ne donne que 3,22:1,
    // sous le seuil AA. Sur #177E44 il donne 5,12:1, et l'aplat lui-même tient
    // 3,03:1 contre la carte du bandeau.
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-admit-text')).toHaveStyle({ color: tokens.color.onBrand });
    expect(screen.getByTestId('waiting-admit-container')).toHaveStyle({
      backgroundColor: tokens.color.brandStrong,
    });
  });
});
