import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { WaitingBanner } from './waitingBanner';

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

  // C1 : le bandeau est sombre dans les deux schémas (`surfaceDark`, un
  // littéral), mais ni le nom ni le compteur ne posaient de couleur de texte
  // avant ce correctif — ils retombaient sur `theme.colors.onSurface`, qui
  // suit le schéma système. En clair, #1A1A1A sur #121212 : 1,08:1, largement
  // sous les 4,5:1 exigés par WCAG AA. RNTL ne rend pas les couleurs ; ce test
  // ne peut donc garder que le style est bien posé, pas qu'il rend lisible.
  it('pose la couleur claire du texte sur le fond sombre du bandeau', async () => {
    await render(<WaitingBanner participant={ADA} remaining={1} onAnswer={jest.fn()} />);

    expect(screen.getByText('waiting.knocking:Ada')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('waiting-others')).toHaveStyle({ color: tokens.color.textDark });
  });

  // Le bouton Refuser est `mode="outlined"`, pas `mode="contained"` comme
  // Admettre : sans fond propre, son texte retombe par défaut sur
  // `theme.colors.primary`, qui suit lui aussi le schéma système —
  // #0057B8 sur #121212 : 2,7:1, même défaut de fond que C1.
  it('pose la couleur claire du texte du bouton Refuser', async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-refuse-text')).toHaveStyle({
      color: tokens.color.primaryDark,
    });
  });
});
