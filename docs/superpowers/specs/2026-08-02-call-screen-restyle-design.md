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
- pastille verte + minuteur + « Chiffré » — cette dernière mention a été
  RETIRÉE après livraison, voir plus bas : rien ne la mesurait, et rien dans
  l'application ne permettait de la mesurer ;
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

- `prejoin.tsx` — Lot 3. _(Livré et fusionné depuis.)_
- `lobby.tsx` — inchangé. _(Ne l'est plus : il n'offrait aucune sortie dans
  aucun de ses cinq états, dont trois terminaux. Corrigé hors de ce lot, voir la
  spec du Lot 1.)_
- `create.tsx` — déjà restylé au Lot 2. _(Lui non plus n'offrait aucune sortie,
  même cause, même correction.)_
- Toute logique : ce lot ne déplace aucun appel réseau, aucun état, aucun
  branchement. Un test existant qui rougit est un signal, pas une permission.

## Corrigé après livraison, contre le code livré

**Le découpage a tenu.** Les quatre sous-lots ont fusionné sans un seul conflit,
et l'ensemble était vert à la première exécution : 1286 tests, 85 suites. Les
fichiers disjoints, la racine de composition réservée, et l'en-tête créé sans
être monté — les trois règles ont fait ce qu'on attendait d'elles.

**Sauf sur un point, et c'est ma faute.** `src/i18n/locales/*.json` est une
surface d'**ajout partagée** : j'en avais interdit l'accès aux quatre agents pour
cette raison exacte, puis j'y ai ajouté des clés depuis **deux branches sœurs**
— `ux-call` pour l'en-tête, `ux-prejoin` pour le Lot 3. Sept conflits, résolus
par union. Un découpage futur doit compter ces fichiers explicitement : soit une
seule branche les possède, soit chaque lot pose ses clés dans un fichier à lui.

### Trois refus des sous-lots, tous justes

Vérifiés un par un plutôt que pris au mot :

| Refus | Raison | Vérification |
| --- | --- | --- |
| A1 n'applique pas les 52 dp du mockup | la rangée demanderait 373 dp sur un écran de 360 | arithmétique recalculée, juste |
| A3 n'affiche pas d'état « micro actif » | `micTrackSid` reste renseigné pour une piste publiée **puis coupée** (`participants.ts:120-124`) — l'afficher serait un mensonge | lu dans les sources, exact |
| A2 ne pose pas le glyphe de micro coupé | la donnée n'existe nulle part : il faudrait `publication.isMuted` dans `readParticipant`, donc deux fichiers hors périmètre | cohérent avec le refus d'A3 |

**Le mockup ne tient pas dans sa propre largeur** : sa rangée de six commandes
demande 368 dp. C'est un fait sur le mockup, pas sur le code, et il n'était écrit
nulle part avant qu'A1 le mesure.

### La dépendance croisée, tranchée par le propriétaire

Le bouton des participants était **en double** : dans la barre, où A1 l'avait
gardé faute de pouvoir toucher l'en-tête, et dans l'en-tête qu'A4 a créé. Le
mockup ne le met qu'à un seul endroit — **l'en-tête l'emporte**.

La rangée passe donc de sept cibles à six, et les 52 dp du mockup deviennent
atteignables :

```
avant   7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp
après   6 × 52 + 1 + 4 × 8 + 2 × 4 = 353 dp
```

**Moins de largeur qu'avant, pour une cible plus grande.** Et
`justifyContent: 'space-evenly'` plutôt que `center` : 353 dp est un MINIMUM, un
téléphone en fait rarement 360 tout juste — 402 sur un iPhone 17 Pro. Groupée au
centre, la rangée laissait 49 dp inutilisés aux deux bouts pendant que les
commandes se touchaient. Le `gap` reste le plancher : `justifyContent` ne
distribue que l'espace libre, il ne peut pas en retirer.

`BAR_HEIGHT` suit à 60, donc la garde de `reactionOverlay` passe à 68 et 140.
**Deux sites citaient ces nombres**, pas un — `reactionOverlay.spec.tsx` et
`call.spec.tsx`. Le second a été manqué à la première passe et rattrapé par la
suite : exactement la dette qu'`AGENTS.md` décrit.

### « Chiffré » a été retiré, et c'est une décision de sécurité

Le mockup pose la mention, A4 l'a rendue, et elle était **inconditionnelle** —
`t('call.encrypted')`, sans rien qui la mesure.

Mesuré avant de trancher : `connection.ts:76` construit `new Room()` **sans
options E2EE**, `connection.ts:188` appelle `room.connect(url, token)` sans
options, aucune occurrence de `e2ee` / `keyProvider` / `frameCryptor` dans
`src/`, et `/api/v1.0/config/` n'expose que `recording`, `subtitle`, `telephony`
et `calendar` (`discovery.ts:120-127`).

Le transport EST chiffré — DTLS-SRTP, toujours, c'est WebRTC. Mais un SFU
déchiffre et rechiffre : l'exploitant du serveur voit le média. Le mot seul,
posé à côté d'une pastille de séance en cours, promet du bout en bout que
l'application ne fait pas.

**Un conditionnel n'aurait pas aidé** : sans E2EE, la seule chose mesurable est
toujours vraie. Le propriétaire a choisi de retirer la mention plutôt que de la
reformuler. `callHeader.spec.tsx` garde son ABSENCE.

Activer l'E2EE de LiveKit reste possible, et son prix est connu : il **casse
l'enregistrement et la transcription côté serveur**, que cette instance annonce
tous les deux. Et la sécurité réelle se jouerait dans la circulation de la clé,
pas dans le libellé.

## Ce que ça vaut

C'est l'écran où l'on passe le plus de temps, et le dernier à porter la mise en
page d'origine. Mais c'est un **restylage** : personne n'y gagnera une
fonctionnalité, et le risque est proportionnel à la densité du code touché —
`call.tsx` fait 1115 lignes, `stage.tsx` 577.

D'où le découpage et l'exigence, dans chaque sous-lot, que **les tests existants
restent verts sans être modifiés**. Un test qui doit changer signale qu'on a
touché au comportement, ce que ce lot s'interdit.
