import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RaisedHand } from 'src/call/hands';
import { tokens } from 'src/ui/tokens';
import { HandControl } from './handControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

const ADA: RaisedHand = {
  identity: 'u-ada',
  name: 'Ada',
  raisedAt: Date.parse('2026-07-30T10:00:01Z'),
  isLocal: false,
};

const BOB: RaisedHand = {
  identity: 'u-bob',
  name: 'Bob',
  raisedAt: Date.parse('2026-07-30T10:00:02Z'),
  isLocal: true,
};

describe('HandControl', () => {
  it('propose de lever quand la main est baissée', async () => {
    const onToggle = jest.fn();
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={onToggle} />);

    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.raiseHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('propose de baisser quand la main est levée', async () => {
    const onToggle = jest.fn();
    await render(<HandControl raised busy={false} hands={[]} onToggle={onToggle} />);

    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.lowerHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('porte une couleur explicite sur le libellé de la commande', async () => {
    // `Menu.Item` calcule `titleColor` depuis le thème et le pose avant
    // `titleStyle` dans le tableau qu'il passe à son `Text` interne (`testID`
    // suffixé `-title`). Sans couleur explicite, le libellé retombe sur
    // `onSurface`, quasi-noir en schéma clair, sur une surface forcée sombre.
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={jest.fn()} />);

    expect(screen.getByTestId('hand-toggle-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('disparaît pendant un appel en vol plutôt que de se griser', async () => {
    // Paper teste `disabled` avant toute couleur explicite et rend un
    // quasi-noir qu'aucune couleur ne rattrape. On masque, on ne grise pas.
    await render(<HandControl raised={false} busy hands={[ADA]} onToggle={jest.fn()} />);

    expect(screen.queryByTestId('hand-toggle')).toBe(null);
    // Mais la file, elle, reste : elle ne dépend pas de la requête en vol.
    expect(screen.getByTestId('hand-queue')).toBeTruthy();
  });

  it('ne rend aucune file quand personne ne lève la main', async () => {
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={jest.fn()} />);

    expect(screen.queryByTestId('hand-queue')).toBe(null);
    expect(screen.queryByTestId('hand-queue-title')).toBe(null);
  });

  it('numérote la file dans son ordre, et vise la seconde entrée', async () => {
    // Deux mains, et l'assertion porte sur la SECONDE : avec une seule, une
    // position codée en dur à 1 passerait sans qu'on le voie.
    await render(<HandControl raised busy={false} hands={[ADA, BOB]} onToggle={jest.fn()} />);

    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveTextContent(
      'call.handQueueEntry|{"position":2,"name":"Bob"}',
    );
    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      'call.handQueueEntry|{"position":1,"name":"Ada"}',
    );
  });

  it('affiche le nom de chaque main, jamais son identité', async () => {
    await render(<HandControl raised={false} busy={false} hands={[BOB]} onToggle={jest.fn()} />);

    // `toHaveTextContent` compare la chaîne ENTIÈRE quand on lui passe une
    // chaîne : seule une expression régulière cherche un fragment.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveTextContent(/"name":"Bob"/);
    expect(screen.queryByText(/u-bob/)).toBe(null);
  });

  it('replie sur le libellé d’anonyme un nom vide', async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se liraient comme
    // un défaut d'affichage plutôt que comme une personne sans nom. Même repli
    // que `waitingBanner` et `participantsPanel`.
    await render(
      <HandControl
        raised={false}
        busy={false}
        hands={[{ ...ADA, name: '   ' }]}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      /"name":"call\.unnamedParticipant"/,
    );
  });

  it('porte une couleur explicite sur le titre et sur chaque ligne de file', async () => {
    await render(
      <HandControl raised={false} busy={false} hands={[ADA, BOB]} onToggle={jest.fn()} />,
    );

    expect(screen.getByTestId('hand-queue-title')).toHaveStyle({ color: tokens.color.textDark });
    // La seconde ligne aussi : une couleur posée sur le titre seul laisserait
    // les lignes retomber sur le thème.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});
