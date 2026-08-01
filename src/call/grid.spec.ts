import {
  GRID_GAP,
  MIN_TILE_HEIGHT,
  TILE_ASPECT,
  gridCapacity,
  packGrid,
  type Box,
} from 'src/call/grid';
import { tokens } from 'src/ui/tokens';

// Les quatre boîtes de la conception, en dp de CONTENU : la marge de page a
// déjà été retirée par l'appelant, ce module n'en connaît aucune. Origine
// (`2026-08-01-grid-and-pinning-design.md`, § 1 et § 5) : Pixel 10 Pro Fold,
// écran de couverture 1080 × 2364 px à densité 390 ; écran interne
// 2076 × 2152 px à densité SUPPOSÉE égale, seule inconnue assumée du document.
const PORTRAIT: Box = { width: 435, height: 892 };
const LANDSCAPE: Box = { width: 961.85, height: 383.08 };
const FOLD_OPEN: Box = { width: 843.7, height: 822.9 };
const FOLD_TURNED: Box = { width: 822.9, height: 843.7 };

describe('les constantes du gabarit', () => {
  it('vaut un pouce de hauteur réelle, le dp étant 1/160 de pouce par définition', () => {
    expect(MIN_TILE_HEIGHT).toBe(160);
  });

  it('inscrit le 16:9 des sources, pas un rapport arrondi', () => {
    expect(TILE_ASPECT).toBe(16 / 9);
  });

  it('reprend l’écart de la couche de style, sans importer celle-ci', () => {
    // `src/call` ne dépend d'aucun jeton — c'est de l'arithmétique pure. Cette
    // égalité est la seule chose qui empêche les deux nombres de diverger : la
    // grille pose la MÊME valeur entre deux cellules et sur ses quatre bords.
    expect(GRID_GAP).toBe(tokens.spacing.xs);
  });
});

describe('gridCapacity', () => {
  it('tient cinq tuiles sur la boîte de couverture en portrait', () => {
    expect(gridCapacity(PORTRAIT, GRID_GAP)).toBe(5);
  });

  it('en tient six sur la même boîte tournée', () => {
    // Deux boîtes, deux nombres différents, aucune mention d'orientation : la
    // formule ne connaît que `W` et `H`.
    expect(gridCapacity(LANDSCAPE, GRID_GAP)).toBe(6);
  });

  it('en tient dix sur l’écran interne du pliable, dans les deux postures', () => {
    // 0,965 dans un sens, 1,037 dans l'autre : un prédicat `width > height`
    // basculerait ici, la capacité ne bouge pas.
    expect(gridCapacity(FOLD_OPEN, GRID_GAP)).toBe(10);
    expect(gridCapacity(FOLD_TURNED, GRID_GAP)).toBe(10);
  });

  it('ne descend jamais sous une tuile, même quand aucun arrangement ne passe le plancher', () => {
    // 200 × 100 : le `1 × 1` lui-même ne fait que 100 dp de haut. Une tuile
    // trop petite reste préférable à un écran vide.
    expect(gridCapacity({ width: 200, height: 100 }, GRID_GAP)).toBe(1);
  });

  it('respecte le plancher pour tout compte qu’elle annonce', () => {
    // La propriété qui donne son sens à la capacité, éprouvée sur les deux
    // boîtes du téléphone plutôt qu'à un seul point.
    for (const box of [PORTRAIT, LANDSCAPE]) {
      for (let count = 1; count <= gridCapacity(box, GRID_GAP); count++) {
        expect(packGrid(count, box, GRID_GAP).tileHeight).toBeGreaterThanOrEqual(MIN_TILE_HEIGHT);
      }
    }
  });
});

describe('packGrid', () => {
  it('reste sur une seule colonne en portrait, là où deux tiendraient en largeur', () => {
    // Le test qui mord si quelqu'un remplace le critère d'aire par « le plus
    // carré possible » : 2 × 1 tiendrait, mais donnerait des tuiles de 121 dp.
    expect(packGrid(2, PORTRAIT, GRID_GAP).columns).toBe(1);
  });

  it('passe à deux colonnes en paysage, pour le même nombre de tuiles', () => {
    // Même `count`, même fonction, l'autre réponse : une implémentation qui
    // rendrait une constante passerait le test précédent tout seul.
    expect(packGrid(2, LANDSCAPE, GRID_GAP).columns).toBe(2);
  });

  it('prend le moins de colonnes quand deux arrangements ont exactement la même aire', () => {
    // 580 × 328 avec deux tuiles : `1 × 2` et `2 × 1` donnent tous deux
    // 288 × 162 dp, à la virgule près — égalité EXACTE, pas approchée
    // (46 656 dp² des deux côtés), et les deux passent le plancher de 160.
    // C'est le seul endroit où la règle « à égalité, le moins de colonnes »
    // est observable.
    const packing = packGrid(2, { width: 580, height: 328 }, GRID_GAP);

    expect(packing.columns).toBe(1);
    expect(packing.tileWidth).toBeCloseTo(288, 6);
    expect(packing.tileHeight).toBeCloseTo(162, 6);
  });

  it('compte les rangées comme le plafond du quotient, jamais autrement', () => {
    expect(packGrid(5, PORTRAIT, GRID_GAP).rows).toBe(5);
    expect(packGrid(3, LANDSCAPE, GRID_GAP).rows).toBe(2);
  });

  it('inscrit toujours le gabarit, quel que soit l’arrangement', () => {
    // `toBeCloseTo`, jamais une égalité stricte : c'est un flottant.
    for (const box of [PORTRAIT, LANDSCAPE, FOLD_OPEN]) {
      for (let count = 1; count <= gridCapacity(box, GRID_GAP); count++) {
        const { tileWidth, tileHeight } = packGrid(count, box, GRID_GAP);
        expect(tileWidth / tileHeight).toBeCloseTo(TILE_ASPECT, 10);
      }
    }
  });

  it('laisse la largeur commander quand la boîte est étroite', () => {
    // Une seule tuile en portrait : la cellule fait toute la boîte, et c'est
    // la LARGEUR qui borne — la tuile vaut exactement la largeur offerte.
    expect(packGrid(1, PORTRAIT, GRID_GAP).tileWidth).toBeCloseTo(435, 6);
  });

  it('laisse la hauteur commander quand la boîte est large', () => {
    // L'autre branche du `min` : la même cellule pleine boîte, mais c'est la
    // HAUTEUR qui borne, donc la tuile est plus étroite que la boîte.
    // 383,08 × 16/9 = 681,03.
    const { tileWidth } = packGrid(1, LANDSCAPE, GRID_GAP);

    expect(tileWidth).toBeCloseTo(681.0311, 3);
    expect(tileWidth).toBeLessThan(LANDSCAPE.width);
  });

  it('retire l’écart de la place disponible, au lieu de le poser par-dessus', () => {
    // Deux colonnes en paysage : l'écart mange 4 dp de largeur utile, donc
    // 2 dp par tuile. Sans cette soustraction, les cellules déborderaient de
    // la boîte de la somme des écarts.
    expect(packGrid(2, LANDSCAPE, GRID_GAP).tileWidth).toBeCloseTo(478.925, 3);
    expect(packGrid(2, LANDSCAPE, 0).tileWidth).toBeCloseTo(480.925, 3);
  });

  it('rend quand même un arrangement quand aucun ne passe le plancher', () => {
    // Fonction TOTALE : elle ne rend jamais `null`. Seul cas où `tileHeight`
    // peut passer sous le plancher, et il est nommé.
    const packing = packGrid(1, { width: 200, height: 100 }, GRID_GAP);

    expect(packing).toEqual({
      columns: 1,
      rows: 1,
      tileWidth: expect.closeTo(177.777, 2),
      tileHeight: 100,
    });
  });

  it('rend un arrangement même pour un compte nul, plutôt que de jeter', () => {
    // `selectLayout` ne l'appelle jamais ainsi — il y a toujours au moins soi.
    // Mais une fonction exportée qui jette sur une entrée légale est un piège
    // posé pour le prochain appelant.
    expect(packGrid(0, PORTRAIT, GRID_GAP).columns).toBe(1);
  });
});
