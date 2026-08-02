# Refonte UX/UI — Lot 3 : le pré-join — conception

Troisième lot du chantier. Il refond l'écran qui précède l'entrée en séance.

## Le périmètre, réduit par une mesure

Le mockup y met **deux panneaux d'effets** — deux niveaux de flou et huit
arrière-plans. Ils ne sont pas livrés, et ce n'est pas un report de confort :
voir `2026-08-02-background-effects-feasibility.md`. Il n'existe aucun chemin
JavaScript entre une image de caméra et une piste WebRTC en React Native ; la
couture native existe, le travail reste entier.

> **Un sélecteur d'arrière-plans qui n'applique aucun arrière-plan promet une
> fonctionnalité inexistante.** Même règle que la liste agenda du Lot 2.

Reste donc : l'écran sombre, l'aperçu caméra, les deux bascules, l'identité, et
l'entrée en séance.

## L'addition qui compte : l'aperçu caméra **[V]**

`prejoin.tsx` n'affiche aujourd'hui **aucune image**. On y bascule micro et
caméra à l'aveugle, puis on entre en séance sans avoir vu ce que les autres
verront.

**`VideoTrack` de `@livekit/react-native` ne convient pas ici** : il attend une
`TrackReference` d'une `Room` connectée, et le pré-join précède la connexion.
C'est `stage.tsx:250` qui l'emploie, après.

La voie est donc brute, et elle est disponible **[V]** :

| Besoin | Ce qui le couvre |
| --- | --- |
| Acquérir la caméra | `mediaDevices.getUserMedia({ video: true })` |
| Rendre l'image | `RTCView` — props `streamURL`, `mirror`, `objectFit` |
| L'URL du flux | `MediaStream.toURL()` (`MediaStream.d.ts:49`) |

**`mirror` est requis, pas décoratif.** La caméra frontale rend une image
inversée ; sans miroir, on se voit comme les autres nous voient, ce qui est
déroutant au moment de vérifier son cadrage.

## Le cycle de vie, qui est le vrai risque

Une caméra acquise et jamais relâchée reste allumée — témoin lumineux compris —
après avoir quitté l'écran. C'est le défaut le plus visible qu'un aperçu puisse
avoir.

D'où un module dédié, `src/call/cameraPreview.ts`, qui possède ce cycle :

- acquiert quand la caméra est demandée ;
- **relâche** quand elle est coupée, et au démontage ;
- relâche aussi si l'acquisition aboutit **après** le démontage — le cas qui
  fuit en pratique, `getUserMedia` étant asynchrone.

Le module vit hors du composant pour être éprouvé sans rendu.

## L'écran est SOMBRE **[M]**

`#0E1412` de fond, comme l'appel — pas clair comme la coque. Conséquence directe
et non négociable : `makeTheme` rendant toujours le thème **clair**, tout `Text`
posé ici doit porter une couleur explicite issue de `src/ui/tokens`, faute de
quoi Paper le rend en quasi-noir sur du quasi-noir.

Éléments relevés : bouton de retour 40 px arrondi à 12 sur `rgba(255,255,255,.08)` ;
nom de la réunion blanc 16 px extra-gras, avec l'adresse en `#8F9A94` en dessous ;
zone d'aperçu à rayon 22 occupant la hauteur libre ; les deux pastilles de
commande en bas de cette zone ; une carte « Votre nom » ; puis « Rejoindre la
réunion », 56 px, rayon 16.

## Ce qui ne change pas

Le chargement, les cinq raisons de refus qu'`main` a ajoutées (`15a3ca6`), la
redirection vers la salle d'attente, les préférences du Lot 1 qui gouvernent
l'état initial des deux bascules, et l'écriture au journal de l'Historique.

**Les tests existants restent verts sans être modifiés**, sauf ceux qui
assertaient une mise en page disparue.

## Hors périmètre

- Les deux panneaux d'effets — voir l'étude de faisabilité.
- Le choix du périphérique audio et de la caméra : les composants appartiennent
  au Lot 4, sous-lot A3. Les chevrons du mockup sont donc **rendus mais inertes**
  au terme de ce lot… ou plutôt **pas rendus du tout**, la règle du dépôt étant
  de masquer une commande indisponible plutôt que de la griser.
- `lobby.tsx`, inchangé.
