import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RaisedHand } from 'src/call/hands';
import { HAND_SIGNAL_BORDER, HAND_SIGNAL_SURFACE, HAND_SIGNAL_TEXT } from './handBanner';
import { RaisedHandsBanner } from './raisedHandsBanner';

// Interpolation rendue visible, comme dans `handBanner.spec.tsx` : sans elle,
// `t` rend la seule clé et un nom codé en dur — ou l'identité au lieu du nom —
// serait indiscernable de la bonne implémentation.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

function hand(identity: string, name: string, raisedAt: number): RaisedHand {
  return { identity, name, raisedAt, isLocal: false };
}

const ADA = hand('u-ada', 'Ada', 1);
const BOB = hand('u-bob', 'Bob', 2);
const CARL = hand('u-carl', 'Carl', 3);

describe('RaisedHandsBanner', () => {
  it('ne rend rien quand personne d’autre ne lève la main', async () => {
    await render(<RaisedHandsBanner hands={[]} />);

    expect(screen.queryByTestId('raised-hands-banner')).toBe(null);
  });

  it('nomme la première main de la file, pas une position codée en dur', async () => {
    // Deux mains, puis les deux mêmes dans l'autre sens : avec une seule
    // fixture, `hands[1]` — ou un nom en dur — passerait aussi bien.
    const view = await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );

    await view.rerender(<RaisedHandsBanner hands={[BOB, ADA]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Bob"}',
    );
  });

  it('compte les autres sans compter celui qu’il nomme', async () => {
    // Deux comptes distincts : avec un seul, `hands.length` passerait pour
    // `hands.length - 1` sur la moitié des fixtures possibles.
    const view = await render(<RaisedHandsBanner hands={[ADA, BOB, CARL]} />);

    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":2}',
    );

    await view.rerender(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":1}',
    );
  });

  it('tait le compte quand une seule main est levée, sans taire le bandeau', async () => {
    await render(<RaisedHandsBanner hands={[ADA]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toBeTruthy();
    expect(screen.queryByTestId('raised-hands-banner-others')).toBe(null);
  });

  it('affiche un repli traduit quand le nom est vide', async () => {
    // Un nom d'espaces, pas une chaîne vide : c'est `trim()` qui décide, et un
    // test sur `''` seul laisserait passer une implémentation sans `trim()`.
    await render(<RaisedHandsBanner hands={[hand('u-x', '   ', 1)]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"call.unnamedParticipant"}',
    );
  });

  it('porte une couleur explicite sur ses deux textes', async () => {
    // `call.tsx` force un fond sombre alors que `makeTheme` rend désormais le
    // thème TOUJOURS clair : sans couleur explicite, 1,17:1. RNTL ne rastérise
    // rien — ce test garde que la CAUSE n'a pas été retirée, jamais que le
    // texte est lisible. 10,33:1 sur le lavis ambre composé.
    await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveStyle({
      color: HAND_SIGNAL_TEXT,
    });
    expect(screen.getByTestId('raised-hands-banner-others')).toHaveStyle({
      color: HAND_SIGNAL_TEXT,
    });
  });

  // Le MÊME lavis que `handBanner`, importé de lui et non recopié : l'ambre est
  // la couleur d'état « une main est levée », et les deux bandeaux disent la
  // même chose de deux personnes différentes. Les laisser diverger ferait lire
  // deux signaux là où il n'y en a qu'un.
  it('pose le lavis ambre du signal, celui-là même que porte sa propre main', async () => {
    await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner')).toHaveStyle({
      backgroundColor: HAND_SIGNAL_SURFACE,
      borderColor: HAND_SIGNAL_BORDER,
      borderRadius: 13,
    });
  });

  it('tronque la phrase plutôt que de pousser le compte hors de l’écran', async () => {
    // `flexShrink` vaut 0 par défaut sous Yoga, à l'inverse du web : sans ces
    // deux-là, un nom allemand long pousse le compte hors de l'écran — le
    // défaut mesuré à 39 px dans `participantsPanel.tsx`. `numberOfLines`
    // atteint bien l'élément hôte : `Text` de Paper ne déstructure que
    // `style`, `variant` et `theme` avant d'étaler le reste.
    await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    const name = screen.getByTestId('raised-hands-banner-name');
    expect(name).toHaveProp('numberOfLines', 1);
    expect(name).toHaveStyle({ flexShrink: 1 });
  });
});
