# Refonte UX/UI — Lot 4 : l'écran d'appel — conception

Quatrième et dernier lot du chantier. Il **re-peint** l'écran d'appel avec le
système visuel du Lot 1. Il n'ajoute qu'une seule chose : l'en-tête.

## Pourquoi ce lot est possible maintenant, et ne l'était pas **[V]**

Le découpage du chantier reposait sur un fait mesuré le 2026-08-02 au matin :
`src/screens/room/` était modifié par **quatorze** branches en vol, et y toucher
aurait produit autant de conflits.

Mesuré à nouveau le même jour, après le travail des autres sessions : **les
quatorze ont atterri dans `main`.** Il ne reste que `exp/applink`, qui ne touche
que `app.json`, `src/constants.ts` et une route d'authentification.

Vérifié fichier par fichier, en comparant chaque branche à sa **base de fusion**
avec `main` — et non à `main`, ce qui compterait les branches en retard :
`call.tsx`, `stage.tsx`, `controlBar.ts` et `moreMenu.tsx` sont **libres**.

## Ce que le lot NE fait pas

**Aucune fonctionnalité.** Le bandeau d'admission, le chat, les participants, la
main levée, les réactions, l'enregistrement, les réglages de l'hôte et le menu
⋯ existent tous et fonctionnent — les quatorze branches les ont livrés. Ce lot
change leurs couleurs, leur typographie et leurs formes.

**Aucun effet d'arrière-plan.** Voir
`2026-08-02-background-effects-feasibility.md` : la couture native existe, le
travail reste à faire, et ce n'est pas ce lot.

## La seule addition : l'en-tête **[M]**

`call.tsx` n'affiche aujourd'hui **ni nom de salle, ni minuteur, ni compteur de
participants**. Le mockup en pose un :

- nom de la réunion, tronqué à une ligne ;
- pastille verte + minuteur + « Chiffré » ;
- à droite, une pastille pressable portant le nombre de participants, qui ouvre
  le panneau.

## Le découpage en quatre sous-lots

Ils sont conçus pour **posséder des fichiers strictement disjoints**, ce qui les
rend exécutables en parallèle. `call.tsx` n'appartient à aucun : c'est la racine
de composition, et son intégration est faite en dernier, une fois les quatre
fusionnés.

| Sous-lot | Fichiers possédés |
| --- | --- |
| **A1 — Barre de commande** | `callControlBar.tsx`, `controlBar.ts`, `handControl.tsx`, `recordingControl.tsx` |
| **A2 — Scène** | `stage.tsx` |
| **A3 — Panneaux et feuilles** | `bottomSheet.tsx`, `callPanels.tsx`, `chatPanel.tsx`, `participantsPanel.tsx`, `moreMenu.tsx`, `cameraMenu.tsx`, `audioOutputControl.tsx`, `sheetRow.tsx`, `sheetCheck.tsx` |
| **A4 — Bandeaux et en-tête** | `waitingBanner.tsx`, `handBanner.tsx`, `raisedHandsBanner.tsx`, `recordingIndicator.tsx`, `reactionOverlay.tsx`, **`callHeader.tsx` (neuf)** |
| **Intégration** | `call.tsx` seulement |

**A4 crée `callHeader.tsx` mais ne le monte pas.** Le monter demanderait de
toucher `call.tsx`, que l'intégration se réserve — sans quoi le parallélisme
tombe.

## La contrainte qui gouverne tout : l'écran est sombre

`call.tsx` force `backgroundDark` et le fait depuis toujours. Le Lot 1 n'a pas
changé cela — il a rendu `makeTheme` **toujours clair**, ce qui rend le piège
d'`AGENTS.md` **certain** au lieu de fréquent :

> Tout composant posé sur cet écran doit poser une couleur explicite issue de
> `src/ui/tokens`. Sans elle, Paper retombe sur `theme.colors.onSurface`, un
> quasi-noir, sur un fond quasi noir.

Les jetons de la coque (`textPrimary`, `cardSurface`…) sont **clairs** et n'ont
rien à faire ici. Ce lot emploie les jetons `*Dark`, plus le vert de marque.

**`brand` (#1FA45C) est utilisable ici**, contrairement à la coque : sur
`backgroundDark` (#0B0B0C) le contraste est bien plus favorable que sur le
`#F5F7F6` clair où il tombait à 2,99. À mesurer par sous-lot avant emploi, pas à
supposer.

## Hors périmètre

- `prejoin.tsx` — Lot 3, qui reste à faire.
- `lobby.tsx` — inchangé.
- `create.tsx` — déjà restylé au Lot 2.
- Toute logique : ce lot ne déplace aucun appel réseau, aucun état, aucun
  branchement. Un test existant qui rougit est un signal, pas une permission.

## Ce que ça vaut

C'est l'écran où l'on passe le plus de temps, et le dernier à porter la mise en
page d'origine. Mais c'est un **restylage** : personne n'y gagnera une
fonctionnalité, et le risque est proportionnel à la densité du code touché —
`call.tsx` fait 1115 lignes, `stage.tsx` 577.

D'où le découpage et l'exigence, dans chaque sous-lot, que **les tests existants
restent verts sans être modifiés**. Un test qui doit changer signale qu'on a
touché au comportement, ce que ce lot s'interdit.
