// L'empaquetage d'une grille de tuiles, séparé de la sélection parce qu'il ne
// connaît ni participant, ni piste, ni SDK : seulement des nombres. Aucune
// horloge, aucun composant — donc entièrement éprouvable.

export type Box = { readonly width: number; readonly height: number };

export type Packing = {
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
};

// Un pouce de hauteur réelle : le dp vaut 1/160 de pouce par définition, donc
// ce plancher est physique et non un compte de pixels. Il est néanmoins
// CHOISI, pas mesuré — rien ici ne prouve qu'un pouce suffise à reconnaître un
// visage. C'est ce nombre, et lui seul, qui fixe toutes les capacités.
export const MIN_TILE_HEIGHT = 160;

// Un gabarit choisi, pas un rapport constaté : `TrackPublication.dimensions`
// permettrait de lire le rapport réel des sources, et ce lot ne le lit pas
// délibérément — une grille qui se recompose parce qu'un autre participant a
// tourné son téléphone est pire que 20 % de marge.
export const TILE_ASPECT = 16 / 9;

// L'écart entre deux cellules. La grille pose LA MÊME valeur sur ses quatre
// bords — « le vide appartient à la marge de la page, jamais à l'intérieur
// d'une tuile » — mais cette marge-là est retirée par l'appelant : ce module
// ne connaît que des cellules et les écarts qui les séparent.
//
// Repris en clair plutôt qu'importé de `src/ui/tokens` : `src/call` est de
// l'arithmétique et des règles, sans dépendance à la couche de style. C'est
// `grid.spec.ts` qui garde l'égalité avec `tokens.spacing.xs`.
export const GRID_GAP = 4;

// Tous les arrangements envisageables pour `count` tuiles, de la colonne
// unique à la rangée unique. Le rapport `TILE_ASPECT` est INSCRIT dans chaque
// cellule : la tuile prend la plus grande taille qui y tienne, et ce qui reste
// devient de la marge — jamais du noir à l'intérieur de la tuile.
function arrangements(count: number, box: Box, gap: number): readonly Packing[] {
  const out: Packing[] = [];
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (box.width - (columns - 1) * gap) / columns;
    const cellHeight = (box.height - (rows - 1) * gap) / rows;
    const tileWidth = Math.min(cellWidth, cellHeight * TILE_ASPECT);
    out.push({ columns, rows, tileWidth, tileHeight: tileWidth / TILE_ASPECT });
  }
  return out;
}

// Fonction TOTALE : elle rend toujours un arrangement, jamais `null`. Quand
// aucun ne passe le plancher, elle rend le meilleur quand même — pour un
// `count` de 1, c'est exactement le `1 × 1`, et c'est le seul cas où
// `tileHeight` peut descendre sous `MIN_TILE_HEIGHT`. Une tuile trop petite
// reste préférable à un écran vide.
//
// Le critère est l'AIRE de la tuile, jamais « le plus carré possible » : sur
// une boîte étroite et haute, l'aire garde une seule colonne de tuiles larges
// là où un critère de forme fabriquerait des vignettes illisibles.
//
// **Aucun filtre sur le plancher ici, et ce n'est pas un oubli.** Une tuile qui
// passe le plancher a une aire d'au moins `MIN_TILE_HEIGHT² · TILE_ASPECT`
// (45 511 dp²) ; une tuile qui échoue en a strictement moins. L'arrangement
// d'aire maximale est donc DÉJÀ celui d'aire maximale parmi ceux qui passent,
// dès qu'il en passe un — filtrer d'abord ne peut pas changer la réponse.
// Vérifié par balayage exhaustif (12 comptes × 170 largeurs × 170 hauteurs :
// zéro contre-exemple) et, avant cela, constaté par mutation : le filtre était
// écrit ici, et le retirer ne faisait rougir AUCUN test. Du code mort qui avait
// l'air d'une garde. Le plancher n'appartient qu'à `gridCapacity`, qui décide
// COMBIEN de tuiles, jamais comment les ranger.
//
// À égalité d'aire, le moins de colonnes l'emporte — obtenu par la comparaison
// STRICTE ci-dessous appliquée à des arrangements engendrés par nombre de
// colonnes croissant : le premier trouvé reste en place. Pas de second critère
// à écrire, donc pas de branche que rien n'atteindrait.
export function packGrid(count: number, box: Box, gap: number): Packing {
  const every = arrangements(Math.max(1, count), box, gap);

  let best = every[0] as Packing;
  for (const packing of every) {
    if (packing.tileWidth * packing.tileHeight > best.tileWidth * best.tileHeight) best = packing;
  }
  return best;
}

// Le plus grand `count` dont un arrangement respecte le plancher, jamais moins
// de 1. La boucle s'arrête au premier compte qui échoue : au-delà, les
// cellules ne peuvent que rétrécir.
//
// Bornée, jamais un `for (;;)`. Le plafond n'est pas un nombre choisi : une
// tuile au plancher occupe au moins `MIN_TILE_HEIGHT² · TILE_ASPECT` dp²
// (45 511), et des tuiles qui ne se recouvrent pas tiennent dans la boîte —
// donc la capacité ne dépasse jamais l'aire de la boîte divisée par celle-là.
// 8 en portrait, 15 sur le pliable, pour des capacités réelles de 5 et 10 :
// la borne ne mord jamais. Elle existe parce que la condition d'arrêt dépend
// de l'arithmétique du dessus, et qu'une modification de celle-ci ne doit pas
// pouvoir faire tourner cette fonction indéfiniment — mesuré : retirer le
// `Math.min` d'`arrangements` fait exactement cela.
export function gridCapacity(box: Box, gap: number): number {
  const ceiling = Math.max(
    1,
    Math.floor((box.width * box.height) / (MIN_TILE_HEIGHT * MIN_TILE_HEIGHT * TILE_ASPECT)),
  );

  let capacity = 1;
  for (let count = 2; count <= ceiling; count++) {
    const fits = arrangements(count, box, gap).some(
      (packing) => packing.tileHeight >= MIN_TILE_HEIGHT,
    );
    if (!fits) return capacity;
    capacity = count;
  }
  return capacity;
}
