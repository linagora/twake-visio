import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { tokens } from 'src/ui/tokens';
import { HandQueue } from './handQueue';

// `t: (key) => key` ne peut pas distinguer `t('call.handQueueEntry', { position,
// name })` de la même clé appelée avec n'importe quoi d'autre : la numérotation
// et le nom passeraient inaperçus. `mockT` interpole réellement, comme
// `cameraMenu.spec.tsx` pour la même raison.
const mockT = jest.fn((key: string, options?: { position?: number; name?: string }) =>
  options !== undefined ? `${key}:${options.position}:${options.name}` : key,
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

const ADA: RaisedHand = {
  identity: 'u-ada',
  name: 'Ada',
  raisedAt: Date.parse('2026-07-30T10:00:00Z'),
  isLocal: false,
};

const BOB: RaisedHand = {
  identity: 'u-bob',
  name: 'Bob',
  raisedAt: Date.parse('2026-07-30T10:00:02Z'),
  isLocal: false,
};

describe('HandQueue', () => {
  it('ne rend RIEN quand personne ne lève la main', async () => {
    // « Rendu ou pas rendu » plutôt qu'une prop : une prop consommée par un
    // composant n'atteint jamais l'élément hôte, et l'assertion serait verte
    // dans les deux états. Un titre de section seul, au-dessus du vide, se
    // lirait comme une file en panne.
    await render(withPaper(<HandQueue hands={[]} />));

    expect(screen.queryByTestId('hand-queue')).toBe(null);
  });

  it('rend la file dès qu’une main est levée', async () => {
    // L'autre borne : sans elle, un composant qui ne rendrait JAMAIS rien
    // passerait le test ci-dessus.
    await render(withPaper(<HandQueue hands={[ADA]} />));

    expect(screen.getByTestId('hand-queue')).toBeTruthy();
    expect(screen.getByTestId('hand-queue-title')).toHaveTextContent('call.handQueue');
  });

  it('numérote chaque entrée par son rang, pas par un compteur figé', async () => {
    // Deux entrées, et c'est la SECONDE qu'on vise : avec une seule, « rend le
    // rang » et « rend toujours 1 » seraient indiscernables.
    await render(withPaper(<HandQueue hands={[ADA, BOB]} />));

    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      'call.handQueueEntry:1:Ada',
    );
    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveTextContent(
      'call.handQueueEntry:2:Bob',
    );
  });

  it('remplace un nom vide par une mention traduite', async () => {
    // Un participant sans nom laisserait une ligne « 1. » suivie de rien —
    // impossible à distinguer d'une file cassée.
    await render(withPaper(<HandQueue hands={[{ ...ADA, name: '   ' }]} />));

    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      'call.handQueueEntry:1:call.unnamedParticipant',
    );
  });

  it('force une couleur explicite sur le titre et sur chaque ligne', async () => {
    // Le fond de la séance est sombre dans les deux schémas, mais Paper fait
    // retomber la couleur de son texte sur `theme.colors.onSurface`, que le
    // thème clair fixe à un quasi-noir. Sans `PaperProvider` ancêtre un `Text`
    // dépouillé retomberait sur `rgba(28, 27, 31, 1)` ; l'égalité étant
    // stricte, n'importe quel repli fait échouer l'assertion.
    await render(withPaper(<HandQueue hands={[ADA]} />));

    expect(screen.getByTestId('hand-queue-title')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});
