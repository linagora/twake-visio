import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { ParticipantView } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';
import { ParticipantsPanel } from './participantsPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const view = (identity: string, name: string, isLocal = false): ParticipantView =>
  ({
    identity,
    name,
    isLocal,
    isSpeaking: false,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
  }) as ParticipantView;

// `getAllByTestId` rend un tableau ; `noUncheckedIndexedAccess` refuse d'y
// indexer sans preuve que l'élément existe. Ce garde-fou vaut mieux qu'une
// assertion `!` : un index hors-limite le dit au lieu de mentir sur le type.
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${index}`);
  return item;
}

describe('ParticipantsPanel', () => {
  it('liste les personnes connectées', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getAllByTestId('participant-row')).toHaveLength(2);
  });

  it("n'offre aucune action sans droit de modérer", async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    // Le serveur refuserait de toute façon : proposer un geste voué à échouer
    // se lit comme une panne de l'application.
    expect(screen.queryByTestId('participant-mute')).toBe(null);
    expect(screen.queryByTestId('participant-remove')).toBe(null);
    expect(screen.queryByTestId('participant-promote')).toBe(null);
  });

  it("coupe le micro par l'identité LiveKit", async () => {
    const onMute = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={onMute}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('participant-mute'));

    expect(onMute).toHaveBeenCalledWith('PA_1');
  });

  it('expulse par la même identité', async () => {
    const onRemove = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={jest.fn()}
        onRemove={onRemove}
        onRole={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('participant-remove'));

    expect(onRemove).toHaveBeenCalledWith('PA_1');
  });

  it('promeut administrateur par la même identité', async () => {
    const onRole = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={onRole}
      />,
    );
    await fireEvent.press(screen.getByTestId('participant-promote'));

    expect(onRole).toHaveBeenCalledWith('PA_1', 'administrator');
  });

  it('ne propose pas de se modérer soi-même', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada', true)]}
        canModerate
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    // S'expulser (ou se changer de rôle) d'un pouce mal placé n'est pas
    // rattrapable : les trois actions disparaissent ensemble pour soi-même,
    // pas seulement l'expulsion.
    expect(screen.queryByTestId('participant-mute')).toBe(null);
    expect(screen.queryByTestId('participant-remove')).toBe(null);
    expect(screen.queryByTestId('participant-promote')).toBe(null);
  });

  it("câble chaque action sur l'identité de sa propre ligne, pas sur la première", async () => {
    // Avec une seule personne dans la liste, une identité recopiée en dur
    // passerait inaperçue : il en faut deux, et on agit sur la seconde.
    const onMute = jest.fn();
    const onRemove = jest.fn();
    const onRole = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
        canModerate
        onMute={onMute}
        onRemove={onRemove}
        onRole={onRole}
      />,
    );
    await fireEvent.press(nth(screen.getAllByTestId('participant-mute'), 1));
    await fireEvent.press(nth(screen.getAllByTestId('participant-remove'), 1));
    await fireEvent.press(nth(screen.getAllByTestId('participant-promote'), 1));

    expect(onMute).toHaveBeenCalledWith('PA_2');
    expect(onRemove).toHaveBeenCalledWith('PA_2');
    expect(onRole).toHaveBeenCalledWith('PA_2', 'administrator');
  });

  it('affiche un repli traduit quand le nom est vide', async () => {
    // Même convention que VideoTile dans stage.tsx : jamais d'identité brute
    // ni de vide à l'écran, les deux se liraient comme un défaut d'affichage.
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', '')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getByTestId('participant-row')).toHaveTextContent('call.unnamedParticipant');
  });

  it('tronque les noms trop longs à deux lignes plutôt que de pousser les actions hors écran', async () => {
    // Toujours la convention de stage.tsx (numberOfLines={2}) : sans elle, un
    // nom d'une ligne se contenterait du défaut de List.Item, qui est 1.
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getByText('Ada').props.numberOfLines).toBe(2);
  });

  // C1 : le panneau remplace la scène dans la même `View` sombre que
  // `call.tsx` pose (`backgroundDark`, dans les deux schémas), mais ni le
  // titre ni le nom de chaque ligne ne posaient de couleur de texte avant ce
  // correctif — ils retombaient sur `theme.colors.onSurface`, qui suit le
  // schéma système. En clair, #1A1A1A sur #0B0B0C : 1,13:1, largement sous
  // les 4,5:1 exigés par WCAG AA. RNTL ne rend pas les couleurs ; ces tests
  // ne peuvent garder que le style est bien posé, pas qu'il rend lisible.
  it('pose la couleur claire du titre du panneau', async () => {
    await render(
      <ParticipantsPanel
        participants={[]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getByText('participants.title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('pose la couleur claire du nom de chaque ligne', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getByText('Ada')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('pose la couleur claire du texte des trois boutons de modération', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getByTestId('participant-mute-text')).toHaveStyle({
      color: tokens.color.primaryDark,
    });
    expect(screen.getByTestId('participant-remove-text')).toHaveStyle({
      color: tokens.color.primaryDark,
    });
    expect(screen.getByTestId('participant-promote-text')).toHaveStyle({
      color: tokens.color.primaryDark,
    });
  });
});
