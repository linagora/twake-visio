import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { TabBarIcon } from 'src/ui/tabBarIcon';
import { tokens } from 'src/ui/tokens';

describe('TabBarIcon', () => {
  // La pastille est la signature visuelle du mockup, et elle ne se rend que
  // sous l'onglet actif : les deux états de la conditionnelle, chacun avec sa
  // fixture, et l'assertion observe le STYLE composé plutôt qu'une prop
  // `focused` que le composant consomme lui-même.
  it('pose le lavis derrière l’icône de l’onglet actif', async () => {
    await render(<TabBarIcon focused name="video-outline" testID="tab-icon" />);
    expect(screen.getByTestId('tab-icon')).toHaveStyle({
      backgroundColor: tokens.color.brandWash,
    });
  });

  it('ne pose aucun lavis derrière un onglet inactif', async () => {
    await render(<TabBarIcon focused={false} name="video-outline" testID="tab-icon" />);
    expect(screen.getByTestId('tab-icon')).not.toHaveStyle({
      backgroundColor: tokens.color.brandWash,
    });
  });

  // `color` et `name` sont des props que `MaterialCommunityIcons` CONSOMME : il
  // les déstructure, donc `props.color` sur le nœud rendu vaut `undefined` et
  // une assertion dessus serait verte dans les deux états. Mesuré ici même —
  // c'est la borne décrite dans `AGENTS.md`.
  //
  // Ce que le nœud expose réellement : un `Text` dont le STYLE porte la couleur
  // et dont les ENFANTS portent le point de code du glyphe. Ce sont donc ces
  // deux conséquences observables qu'on assertit.
  //
  // `brandStrong` et non `brand` : #1FA45C sur blanc ne donne que 3,22:1, ce qui
  // suffit à l'aplat de la pastille mais pas au glyphe, qu'on veut aussi net que
  // le libellé posé dessous.
  it('teinte le glyphe actif en brandStrong', async () => {
    await render(<TabBarIcon focused name="video-outline" testID="tab-icon" />);
    expect(screen.getByTestId('tab-icon-glyph')).toHaveStyle({
      color: tokens.color.brandStrong,
    });
  });

  it('teinte le glyphe inactif en textTabInactive', async () => {
    await render(<TabBarIcon focused={false} name="video-outline" testID="tab-icon" />);
    expect(screen.getByTestId('tab-icon-glyph')).toHaveStyle({
      color: tokens.color.textTabInactive,
    });
  });

  // Le nom doit atteindre l'icône, sinon les trois onglets porteraient le même
  // dessin. On compare les points de code entre eux plutôt qu'à des littéraux :
  // un `\u{F0BDC}` écrit en dur serait illisible et se périmerait à la première
  // montée de version de la police.
  it('rend un dessin DIFFÉRENT pour chacun des trois onglets', async () => {
    // Les trois rendus dans le MÊME arbre : `unmount` est asynchrone sous
    // RNTL 14 comme le reste, et l'enchaîner dans une boucle produit des appels
    // à `act()` imbriqués que React refuse.
    await render(
      <>
        <TabBarIcon focused={false} name="video-outline" testID="tab-home" />
        <TabBarIcon focused={false} name="clock-outline" testID="tab-history" />
        <TabBarIcon focused={false} name="cog-outline" testID="tab-settings" />
      </>,
    );
    const glyphs = new Set(
      ['tab-home', 'tab-history', 'tab-settings'].map((id) =>
        String(screen.getByTestId(`${id}-glyph`).props.children),
      ),
    );

    expect(glyphs.size).toBe(3);
  });
});
