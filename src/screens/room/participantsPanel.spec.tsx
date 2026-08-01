import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { ParticipantView } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';
import { ParticipantsPanel } from './participantsPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Les actions vivent désormais dans une feuille inférieure, donc dans un
// `Portal` : il faut un `PaperProvider` ancêtre. Même préambule que
// `moreMenu.spec.tsx`, `cameraMenu.spec.tsx` et `audioOutputControl.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro les deux animations d'opacité de
// `Modal` (`Modal.tsx:117-144`), qui prendraient sinon 220 ms chacune.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Ouvre la feuille de la n-ième ligne et attend qu'elle soit montée. `Modal` ne
// monte rien à l'état fermé (`Modal.tsx:182`) : tant qu'on n'a pas appuyé, les
// trois actions n'existent pas dans l'arbre — c'est précisément ce que garde
// le test « ne pose jamais les trois actions sur la ligne » plus bas.
async function openActions(index = 0): Promise<void> {
  const buttons = screen.getAllByTestId('participant-actions');
  await fireEvent.press(nth(buttons, index));
  await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());
}

const view = (identity: string, name: string, isLocal = false): ParticipantView => ({
  identity,
  name,
  isLocal,
  isSpeaking: false,
  lastSpokeAt: null,
  joinedAt: null,
  camera: null,
  screen: null,
  screenSince: null,
  handRaisedAt: null,
});

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
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.getAllByTestId('participant-row')).toHaveLength(2);
  });

  it("n'offre aucune action sans droit de modérer", async () => {
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
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
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={onMute}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );
    await openActions();
    await fireEvent.press(screen.getByTestId('participant-mute'));

    expect(onMute).toHaveBeenCalledWith('PA_1');
  });

  it('expulse par la même identité', async () => {
    const onRemove = jest.fn();

    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={jest.fn()}
          onRemove={onRemove}
          onRole={jest.fn()}
        />,
      ),
    );
    await openActions();
    await fireEvent.press(screen.getByTestId('participant-remove'));

    expect(onRemove).toHaveBeenCalledWith('PA_1');
  });

  it('promeut administrateur par la même identité', async () => {
    const onRole = jest.fn();

    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={onRole}
        />,
      ),
    );
    await openActions();
    await fireEvent.press(screen.getByTestId('participant-promote'));

    expect(onRole).toHaveBeenCalledWith('PA_1', 'administrator');
  });

  it('ne propose pas de se modérer soi-même', async () => {
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada', true)]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
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
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
          canModerate
          onMute={onMute}
          onRemove={onRemove}
          onRole={onRole}
        />,
      ),
    );
    // La feuille se referme à chaque action : on la rouvre entre les trois.
    // Toujours celle de la SECONDE ligne — c'est tout l'objet du test.
    await openActions(1);
    await fireEvent.press(screen.getByTestId('participant-mute'));
    await openActions(1);
    await fireEvent.press(screen.getByTestId('participant-remove'));
    await openActions(1);
    await fireEvent.press(screen.getByTestId('participant-promote'));

    expect(onMute).toHaveBeenCalledWith('PA_2');
    expect(onRemove).toHaveBeenCalledWith('PA_2');
    expect(onRole).toHaveBeenCalledWith('PA_2', 'administrator');
  });

  it('ne pose jamais les trois actions sur la ligne elle-même', async () => {
    // LE test de non-régression du défaut mesuré sur appareil : `List.Item`
    // pose son `right` sur la MÊME ligne que le titre et ne le fait jamais
    // retomber. Les trois boutons prenaient 963 px des 1002 d'un écran de
    // 1080, et il restait 39 px au nom — la personne distante était dans la
    // liste, invisible.
    //
    // RNTL ne fait aucune mise en page, donc aucun test ne peut mesurer ces
    // 39 px. Mais il peut garder la CAUSE : les actions ne sont pas sur la
    // ligne. Une seule cible y vit, et les trois n'existent qu'une fois la
    // feuille ouverte.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('participant-actions')).toBeTruthy();
    expect(screen.queryByTestId('participant-mute')).toBe(null);
    expect(screen.queryByTestId('participant-remove')).toBe(null);
    expect(screen.queryByTestId('participant-promote')).toBe(null);
  });

  it('nomme la feuille par la personne visée, jamais par le panneau', async () => {
    // Ce que trois boutons posés sur une ligne écrasée ne disaient pas : SUR
    // QUI ils agissent. Deux personnes dans la liste, et on ouvre la seconde —
    // avec une seule, un titre recopié de la première passerait inaperçu.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );
    await openActions(1);

    expect(screen.getByTestId('participant-sheet-title')).toHaveTextContent('Bob');
  });

  it.each([['participant-mute'], ['participant-remove'], ['participant-promote']])(
    'referme la feuille après %s, en plus de déclencher l’action',
    async (testID) => {
      // Le corps de chaque rappel a DEUX instructions. Les tests ci-dessus
      // n'observent que la seconde ; celui-ci n'observe que la première. Sans
      // lui, `setSheetVisible(false)` peut disparaître des trois sans qu'aucun
      // test ne rougisse — le trou exact que le lot des panneaux a livré.
      await render(
        withPaper(
          <ParticipantsPanel
            participants={[view('PA_1', 'Ada')]}
            canModerate
            onMute={jest.fn()}
            onRemove={jest.fn()}
            onRole={jest.fn()}
          />,
        ),
      );
      await openActions();

      await fireEvent.press(screen.getByTestId(testID));

      await waitFor(() => expect(screen.queryByTestId('participant-mute')).toBe(null));
    },
  );

  it("n'offre pas la cible d'actions sans droit de modérer", async () => {
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.queryByTestId('participant-actions')).toBe(null);
  });

  it("n'offre pas la cible d'actions sur soi-même", async () => {
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada', true)]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.queryByTestId('participant-actions')).toBe(null);
  });

  it('affiche un repli traduit quand le nom est vide', async () => {
    // Même convention que VideoTile dans stage.tsx : jamais d'identité brute
    // ni de vide à l'écran, les deux se liraient comme un défaut d'affichage.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', '')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('participant-row')).toHaveTextContent('call.unnamedParticipant');
  });

  it('tronque les noms trop longs à deux lignes plutôt que de pousser les actions hors écran', async () => {
    // Toujours la convention de stage.tsx (numberOfLines={2}) : sans elle, un
    // nom d'une ligne se contenterait du défaut de List.Item, qui est 1.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
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
      withPaper(
        <ParticipantsPanel
          participants={[]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.getByText('participants.title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('pose la couleur claire du nom de chaque ligne', async () => {
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate={false}
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );

    expect(screen.getByText('Ada')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('pose la couleur claire du texte des trois actions', async () => {
    // `SheetRow` nomme son `Text` `` `${testID}-title` ``, pas `-text` : c'est
    // `Button` de Paper qui usait de ce dernier. La feuille est posée sur
    // `surfaceDark`, pas sur `backgroundDark` — deux fonds, deux ratios.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );
    await openActions();

    expect(screen.getByTestId('participant-mute-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('participant-promote-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // Expulser est la seule qu'on ne rattrape pas : elle porte le ton d'alerte,
    // et ce test échoue si quelqu'un l'aligne sur les deux autres.
    expect(screen.getByTestId('participant-remove-title')).toHaveStyle({
      color: tokens.color.dangerDark,
    });
  });

  it('pose la couleur sombre de la surface de la feuille', async () => {
    // `Modal` expose sa `Surface` sous `` `${testID}-surface` ``
    // (`Modal.tsx:220`), et son fond est TRANSPARENT par défaut
    // (`Modal.tsx:243-246`). On force la surface ET le texte, ou ni l'un ni
    // l'autre — précédents : `bottomSheet.spec.tsx`, `moreMenu.spec.tsx`.
    await render(
      withPaper(
        <ParticipantsPanel
          participants={[view('PA_1', 'Ada')]}
          canModerate
          onMute={jest.fn()}
          onRemove={jest.fn()}
          onRole={jest.fn()}
        />,
      ),
    );
    await openActions();

    expect(screen.getByTestId('participant-sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });
});
