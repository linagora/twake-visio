import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { CALL_META_TEXT, CALL_SURFACE_TINT, CallHeader, formatElapsed } from './callHeader';

// Interpolation rendue visible, comme `handBanner.spec.tsx` et
// `raisedHandsBanner.spec.tsx` : sans elle, un compte codé en dur — ou le
// mauvais champ passé à `t` — serait indiscernable de la bonne implémentation.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

function header(
  overrides: Partial<React.ComponentProps<typeof CallHeader>> = {},
): React.ReactElement {
  return (
    <CallHeader
      elapsedSeconds={0}
      onCopyLink={jest.fn()}
      onParticipantsPress={jest.fn()}
      onShareLink={jest.fn()}
      participantCount={1}
      title="Revue produit"
      {...overrides}
    />
  );
}

describe('formatElapsed', () => {
  it('remplit les deux chiffres des minutes comme ceux des secondes', async () => {
    // `mm:ss`, pas `m:s` : sans le remplissage, le minuteur change de largeur
    // à chaque dizaine, et l'en-tête entier se décale une fois par seconde.
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(9)).toBe('00:09');
    expect(formatElapsed(65)).toBe('01:05');
  });

  it('laisse les minutes dépasser soixante plutôt que de repartir à zéro', async () => {
    // Une réunion d'une heure et cinq secondes affiche `60:05`, jamais `00:05` :
    // un modulo sur les minutes ferait mentir le minuteur sur les réunions
    // longues, qui sont précisément celles où on le regarde.
    expect(formatElapsed(3605)).toBe('60:05');
  });

  it('replie un temps négatif sur zéro', async () => {
    // Atteignable : l'horloge de l'appareil peut être en avance sur l'instant de
    // jonction que le serveur renvoie. `-1` donnerait `-1:-1` sans cette borne.
    expect(formatElapsed(-42)).toBe('00:00');
  });

  it('replie une valeur non finie sur zéro', async () => {
    // Atteignable aussi : `(Date.now() - Date.parse(joinedAt)) / 1000` rend
    // `NaN` dès que l'horodatage de jonction est absent ou illisible, et
    // `NaN:NaN` s'afficherait tel quel.
    expect(formatElapsed(Number.NaN)).toBe('00:00');
  });

  it('tronque les fractions de seconde au lieu de les afficher', async () => {
    expect(formatElapsed(59.9)).toBe('00:59');
  });
});

describe('CallHeader', () => {
  it('affiche le nom de la réunion qu’on lui donne, tronqué à une ligne', async () => {
    // Deux titres distincts : avec un seul, une constante passerait.
    const view = await render(header({ title: 'Revue produit' }));

    expect(screen.getByTestId('call-header-title')).toHaveTextContent('Revue produit');
    expect(screen.getByTestId('call-header-title')).toHaveProp('numberOfLines', 1);

    await view.rerender(header({ title: 'Comité de pilotage' }));

    expect(screen.getByTestId('call-header-title')).toHaveTextContent('Comité de pilotage');
  });

  it('affiche le temps écoulé qu’on lui donne, pas une horloge à lui', async () => {
    // Deux durées distinctes : le composant ne lit pas `Date.now()`, donc le
    // test n'a aucune horloge à faire avancer — c'est la raison d'être de la
    // prop.
    const view = await render(header({ elapsedSeconds: 65 }));

    expect(screen.getByTestId('call-header-timer')).toHaveTextContent('01:05');

    await view.rerender(header({ elapsedSeconds: 601 }));

    expect(screen.getByTestId('call-header-timer')).toHaveTextContent('10:01');
  });

  // La mention « Chiffré » a été RETIRÉE, et ce test garde son absence.
  // Elle était inconditionnelle — `t('call.encrypted')`, sans rien qui la
  // mesure — et rien ne permettait de la mesurer : `new Room()` est construit
  // sans options E2EE (`connection.ts:76`), et la configuration d'instance
  // n'expose aucun champ de chiffrement. Le transport est bien chiffré
  // (DTLS-SRTP, toujours), mais un SFU déchiffre et rechiffre : le mot seul
  // promettait du bout en bout que l'application ne fait pas.
  it('ne revendique aucun chiffrement', async () => {
    await render(header());

    expect(screen.queryByTestId('call-header-encrypted')).toBe(null);
  });

  it('affiche le nombre de participants reçu, pas une constante', async () => {
    const view = await render(header({ participantCount: 3 }));

    expect(screen.getByTestId('call-header-participants-count')).toHaveTextContent(
      'call.participantCount|{"count":3}',
    );

    await view.rerender(header({ participantCount: 12 }));

    expect(screen.getByTestId('call-header-participants-count')).toHaveTextContent(
      'call.participantCount|{"count":12}',
    );
  });

  it('ouvre le panneau des participants au premier appui sur la pastille', async () => {
    // La prop est PRÉFIXÉE (`onParticipantsPress`) : `fireEvent.press` remonte
    // la fibre jusqu'au premier ancêtre HÔTE, et `Pressable` n'en est pas un.
    // Une prop nommée `onPress` serait trouvée sur notre propre fibre et le
    // test passerait sans que le `Pressable` soit câblé — mesuré sur ce dépôt.
    const onParticipantsPress = jest.fn();

    await render(header({ onParticipantsPress }));
    await fireEvent.press(screen.getByTestId('call-header-participants'));

    expect(onParticipantsPress).toHaveBeenCalledTimes(1);
  });

  // Le fond de la séance est sombre dans les deux schémas alors que `makeTheme`
  // rend toujours le thème CLAIR : sans couleur explicite, un texte retombe sur
  // `onSurface` — quasi-noir sur quasi-noir. RNTL ne rastérise rien, donc ces
  // tests gardent la CAUSE (le style posé), jamais la lisibilité.
  it('pose la couleur claire sur le nom de la réunion', async () => {
    await render(header());

    expect(screen.getByTestId('call-header-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('pose la couleur de méta sur le minuteur', async () => {
    await render(header());

    expect(screen.getByTestId('call-header-timer')).toHaveStyle({ color: CALL_META_TEXT });
  });

  it('remplit la pastille de présence avec le vert de marque', async () => {
    // 6,11:1 sur `backgroundDark` — un aplat, seuil 3:1. Un jeton, pas un
    // littéral : le vert du mockup (#28C46E) n'existe pas dans `src/ui/tokens`.
    await render(header());

    expect(screen.getByTestId('call-header-live')).toHaveStyle({
      backgroundColor: tokens.color.brand,
    });
  });

  it('pose le lavis et la couleur claire sur la pastille des participants', async () => {
    // La surface ET le texte, jamais l'un sans l'autre : une surface forcée
    // sous un texte laissé au thème est le pire des trois cas.
    await render(header());

    expect(screen.getByTestId('call-header-participants')).toHaveStyle({
      backgroundColor: CALL_SURFACE_TINT,
    });
    expect(screen.getByTestId('call-header-participants-count')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('teinte le glyphe des participants', async () => {
    // `color` est une prop que `MaterialCommunityIcons` CONSOMME — voir
    // `tabBarIcon.spec.tsx`. Ce qu'il expose est un `Text` dont le STYLE porte
    // la couleur ; c'est cette conséquence-là qu'on observe.
    await render(header());

    expect(screen.getByTestId('call-header-participants-glyph')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
  // Copier et partager ont quitté le menu « Plus » pour l'en-tête, à la demande
  // du propriétaire : le lien de la réunion, c'est ce titre, et la commande se
  // lit mieux à côté de son objet. Une prop par icône, et une ligne par prop —
  // deux boutons voisins qui appellent le même rappel est exactement l'erreur
  // qu'un seul test ne verrait pas.
  it('copie le lien sans partager', async () => {
    const onCopyLink = jest.fn();
    const onShareLink = jest.fn();

    await render(header({ onCopyLink, onShareLink }));
    await fireEvent.press(screen.getByTestId('call-header-copy'));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(onShareLink).not.toHaveBeenCalled();
  });

  it('partage le lien sans copier', async () => {
    const onCopyLink = jest.fn();
    const onShareLink = jest.fn();

    await render(header({ onCopyLink, onShareLink }));
    await fireEvent.press(screen.getByTestId('call-header-share'));

    expect(onShareLink).toHaveBeenCalledTimes(1);
    expect(onCopyLink).not.toHaveBeenCalled();
  });

  it('dessine un vrai glyphe pour chacune, jamais une cible vide', async () => {
    // Une cible pressable sans glyphe serait invisible et parfaitement
    // fonctionnelle : aucun test de comportement ne l'attraperait. Le glyphe
    // porte ici son propre testID — contrairement à l'icône d'un `IconButton`
    // de Paper, que rien n'atteint —, donc sa couleur est joignable.
    await render(header());

    expect(screen.getByTestId('call-header-copy-glyph')).toBeTruthy();
    expect(screen.getByTestId('call-header-share-glyph')).toBeTruthy();
  });
});
