# Réception du partage d'écran — conception

**Date** : 2026-07-31
**État** : validée par le partenaire, non implémentée
**Périmètre** : recevoir et afficher un écran partagé par quelqu'un d'autre, et
donner à cet écran toute la place en paysage.

## Pourquoi

Quelqu'un présente un support depuis son navigateur ; les participants mobiles
ne voient rien. C'est aujourd'hui le manque le plus lourd du produit : une
réunion de travail se passe rarement sans que personne ne montre quoi que ce
soit.

C'est aussi le **préalable technique** de deux demandes qui suivront — la grille
optimisée pour mobile et l'épinglage. Les deux ont besoin de savoir *ce qu'est*
une piste pour décider comment la cadrer : `contain` est obligatoire pour une
diapositive, mauvais pour un visage. Cette distinction de source n'existe nulle
part dans le code actuel.

## Ce que le code dit aujourd'hui

Trois faits relevés, qui cadrent la conception.

**Le partage d'écran a été exclu délibérément, pas oublié.**
`src/call/participants.ts:40` demande explicitement `Track.Source.Camera`, avec
ce commentaire : « Un filtre sur les pistes vidéo attraperait le partage d'écran
et le poserait à la place du visage. »

**La scène suit la personne, jamais la piste.** `pickStage`
(`src/call/layout.ts:106`) rend un `ParticipantView`. Le commentaire en donne la
raison : un locuteur dont la caméra est coupée garde la scène, sans quoi l'on
changerait de scène à chaque caméra coupée pour finir par regarder quelqu'un qui
se tait.

**C'est là qu'est la tension.** Un écran partagé est l'inverse exact : une
*piste* qui doit prendre la scène indépendamment de qui parle. Présenter, c'est
demander qu'on regarde son écran pendant qu'on parle par-dessus.

Deux propriétés du socle rendent le changement sûr : `participants.ts` est la seule
frontière avec LiveKit **pour les pistes et les participants**, et `selectLayout`
est une **fonction pure**. Toute la décision reste éprouvable sans WebRTC.

> **Précisé après implémentation.** La première rédaction disait « la **seule**
> frontière avec LiveKit », sans réserve. C'est vrai de la surface que ce lot
> touche — `Track.Source` n'apparaît nulle part ailleurs hors des specs, vérifié par
> balayage — mais `recordingStore.ts`, `connection.ts`, `media.ts` et
> `useCallLayout.ts` importent aussi `livekit-client` pour d'autres surfaces. Le fait
> est antérieur à ce lot ; la conception s'appuyait dessus comme sur un absolu.

## Décisions

Prises avec le partenaire, chacune dans le sens recommandé.

| Question | Décision |
|---|---|
| Qui gagne la scène quand quelqu'un partage ? | **L'écran, tant qu'il dure.** Les visages passent tous dans la bande, y compris celui qui parle. |
| Deux partages simultanés ? | **Le plus récent prend la scène**, les autres restent dans la bande. |
| Que voit-on du présentateur ? | **Son visage ET son écran.** Une personne peut occuper deux tuiles. |
| Cadrage | **Par source** : `contain` pour un écran. La caméra reste en `contain` — voir la correction ci-dessous. |
| Paysage | **La scène prend toute la surface**, la bande passe sur le côté. |

## Architecture

### Les types

`CameraTrack` (`src/call/layout.ts:13`) devient **`VideoTrackRef`**. Garder un
type nommé « caméra » pour porter un écran serait un mensonge de nommage, du
genre que ce dépôt traque. C'est un renommage de type pur : `tsc` trouve chaque
site, il n'y a rien à décider par fichier.

`ParticipantView` gagne un second champ vidéo :

```ts
export type ParticipantView = {
  // … champs existants inchangés …
  readonly camera: VideoTrackRef | null;
  // `null` quand la personne ne partage pas, que la piste n'est pas souscrite,
  // ou qu'elle est coupée — indiscernables à l'écran, comme pour la caméra.
  readonly screen: VideoTrackRef | null;
  // Instant de première vue de CETTE piste de partage, en millisecondes.
  // `null` quand `screen` est `null`. Voir « L'ordre des partages » ci-dessous.
  readonly screenSince: number | null;
};
```

`Tile` gagne sa source, et **sa clé change** :

```ts
export type TileSource = 'camera' | 'screen';

export type Tile = {
  // `${identity}:camera` ou `${identity}:screen`, plus l'identité seule.
  //
  // Le commentaire actuel dit vrai — « deux vignettes qui partagent une clé
  // échangent leur vidéo au moindre changement de liste » — mais son hypothèse
  // ne tient plus : une personne qui partage produit DEUX tuiles.
  readonly key: string;
  readonly source: TileSource;
  // … champs existants …
};
```

`CallLayout` ne change pas de forme : `stage` reste un `Tile`, qui peut
désormais être un écran.

### La règle de scène

En deux temps, et le premier prime :

1. **S'il existe au moins un partage**, la scène est l'écran dont `screenSince`
   est le plus grand. La parole n'entre pas en jeu.
2. **Sinon**, `pickStage` s'applique **inchangé** — parole, puis dernier
   locuteur, puis ordre stable.

Un partage ne se dispute donc jamais la scène avec la parole : il la prend, et
la garde jusqu'à son arrêt.

### L'ordre des partages, et sa contrainte

**Mesuré : LiveKit n'horodate pas les publications de piste.** La seule
occurrence de `firstReceivedTime` dans `livekit-client.esm.mjs` concerne les
segments de transcription. « Le plus récent » ne peut donc pas se déduire de
l'état du SDK.

`participants.ts` tiendra une table `trackSid → instant de première vue`,
**alimentée à la lecture** et purgée des sids absents.

> **Corrigé après implémentation.** Cette phrase disait « absents de la **vue
> courante** ». C'est le contraire de ce qui est livré, et la nuance est un bogue
> évité : la vue rend `null` sur `isMuted`, donc purger depuis elle effacerait
> l'instant d'un partage simplement **mis en pause**, qui en recevrait un plus
> récent à la reprise et volerait la priorité de « plus récent » à quelqu'un qui
> partage sans interruption depuis plus longtemps. La purge se fait donc depuis les
> publications **brutes**, via un `screenSid` délibérément indifférent à `isMuted` —
> LiveKit ne réattribue pas de `trackSid` à une coupure, la publication survit.
> Voir `src/call/participants.ts:80-93`.

Bâtir cette mémoire sur un **événement** — `TrackSubscribed` — manquerait tout
partage **déjà en cours à la jonction**. C'est exactement le piège que ce dépôt a
payé deux fois : `RoomMetadataChanged` n'est pas émis à la jonction, et
`ParticipantAttributesChanged` ne l'est pas davantage à la création d'un
participant distant. La règle du projet vaut ici aussi : **on lit, on n'attend
pas**.

Un partage vu pour la première fois reçoit `Date.now()`. Deux partages découverts
dans la même lecture — le cas de la jonction — reçoivent le même instant ; le
départage retombe alors sur l'ordre stable, ce qui est arbitraire mais
déterministe, et n'a aucune conséquence perçue : personne n'a de raison d'attendre
l'un plutôt que l'autre.

> **Ajouté après implémentation.** Ce cas d'égalité n'est pas une curiosité de
> jonction : `Date.now()` a une résolution d'une milliseconde, et **1994 lectures
> sur 2000** placent deux partages découverts ensemble dans la même milliseconde —
> mesuré. Sans un départage **explicite** (`src/call/layout.ts:174`), la comparaison
> stricte `>` laisse le premier venu gagner, et un test écrit avec deux instants
> distincts n'attrape la mutation que dans 0,3 % des exécutions. La règle qui en
> sort vaut au-delà de ce lot : **une égalité que le code atteint en pratique n'est
> pas un cas dégénéré, c'est le cas nominal**, et elle veut sa ligne et son test.

**L'horloge reste à la frontière SDK.** `layout.ts` ne compare que des nombres et
demeure une fonction pure, testable sans horloge ni faux timers.

### Le cadrage

`stage.tsx:110` rend aujourd'hui la scène en `objectFit="contain"` pour tout —
d'où les bandes noires mesurées sur appareil : une caméra en 16:9 dans une scène
portrait est encadrée de noir sur la moitié de la hauteur.

La coquille dérive désormais son cadrage de `tile.source` :

- **écran → `contain`.** On ne rogne jamais une diapositive : un texte coupé est
  un texte perdu.
- **caméra → `contain`, inchangé.** La décision initiale disait `cover` ; elle
  était fausse, et le code portait déjà le contre-argument (`stage.tsx:110`) :
  « `cover` remplirait un écran de téléphone en portrait avec une image de caméra
  en paysage, donc en coupant les deux tiers du visage. » Vérifié en chiffres sur
  l'écran de couverture d'un Pixel 10 Pro Fold — 1080×2364 — : une source 16:9 en
  `cover` est agrandie à 4203 px de large puis rognée à 1080, soit **26 % de
  l'image visible**.

  Aucune des deux valeurs n'est bonne pour une caméra : l'une gaspille, l'autre
  coupe. **Les bandes noires ne sont donc pas un défaut de cadrage mais de mise
  en page** — une scène portrait qui montre une source paysage. La réponse est la
  grille, et elle est hors de ce lot. On garde `contain`, qui au moins ne ment
  pas sur ce qui est filmé.

Les vignettes de la bande restent en `cover`, sauf un écran, qui y passe aussi en
`contain` — une miniature de diapositive rognée n'est pas reconnaissable.

### Le paysage

**La rotation est déjà permise, et c'est mesuré** :
`android:screenOrientation="unspecified"` dans le manifeste généré, et
`configChanges` couvre `orientation|screenSize|screenLayout` — une rotation ne
recrée donc pas l'activité, React Native se contente de remettre en page.

Ce qui manque n'est pas l'autorisation, **c'est que la mise en page tire parti du
paysage**. Aujourd'hui la bande de vignettes est une rangée horizontale de
hauteur fixe (`stage.tsx:18`, `tokens.spacing.xl * 3`) posée sous la scène : en
paysage elle mange la hauteur, précisément ce qui devient rare.

En paysage, donc :

- la **bande passe en colonne** sur un côté, de largeur fixe ;
- la **scène prend toute la hauteur** restante ;
- la barre de contrôle reste où elle est. La déplacer aussi relève de la refonte
  de la grille, pas de ce lot.

L'orientation se lit avec `useWindowDimensions()` — `width > height` —, jamais
avec une API d'orientation : c'est la dimension réelle de la fenêtre qui compte,
et sur un pliable elle change **sans** rotation. Mesuré sur Pixel 10 Pro Fold :
écran de couverture 1080×2364 à densité 390, soit **443 dp** de large ; écran
interne 2076×2152.

## Hors périmètre, explicitement

- **Émettre** un partage depuis le mobile. Autre fonction, autres permissions.
- **L'épinglage.** Ce lot livre la distinction de source dont il aura besoin ;
  il n'est pas l'épinglage.
- **L'audio du partage** (`Track.Source.ScreenShareAudio`).
- **La refonte de la grille**, dont ce lot est le préalable.
- **Déplacer la barre de contrôle en paysage.**

## Tests

La suite reste ce qu'elle est : `*.spec.ts(x)` colocalisés, aucun instantané,
`npm test` / `npm run typecheck` / `npm run lint` verts.

Trois propriétés méritent d'être gardées, et chacune doit être **prouvée mordante
par mutation** :

1. **Un écran prend la scène même quand quelqu'un d'autre parle.** Le test doit
   faire parler un participant *différent* du présentateur — sans quoi une
   implémentation qui laisserait la parole décider passerait par coïncidence.
2. **Le plus récent des deux partages gagne**, avec deux `screenSince` distincts
   et l'ordre d'insertion **inverse** de l'ordre attendu. Un tri qui rendrait le
   premier venu passerait sinon.
3. **Le présentateur apparaît deux fois**, et les deux tuiles ont des clés
   différentes. Une clé restée à l'identité ferait échouer cette seconde
   assertion, pas la première.

Le cadrage par source se garde sur la prop `objectFit` rendue, pas sur l'aspect —
`AGENTS.md` est explicite : aucun test ne peut prouver qu'une image est bien
cadrée, seulement que la valeur n'a pas été retirée.

La mise en page paysage se garde en rendant avec des dimensions de fenêtre
forcées, les deux orientations, et en vérifiant que la bande change d'axe. C'est
une assertion sur la structure, pas sur l'apparence.

## Connu, non traité : la reconnexion complète efface l'ordre de récence

Relevé en revue de branche, **établi dans le SDK et reproduit sur les doubles**, non
corrigé — parce que le remède est une décision de conception, pas un correctif.

Une reconnexion **complète** (`restartConnection`, distincte d'une simple reprise)
détruit chaque participant distant **avant** d'émettre `Reconnecting`
(`livekit-client.esm.mjs:25982`), et émet `TrackUnsubscribed` / `TrackUnpublished` /
`ParticipantDisconnected` **en direct**, sans tampon. Ces trois événements sont dans
`ROOM_VIEW_EVENTS`, et `useSyncExternalStore` relit **synchroniquement** dans le rappel
d'abonnement. `readRoomView` lit donc une `Room` **vide**, `present` est vide, et
`forgetAbsent` purge **toute** la table.

Le partage lui-même survit parfaitement — c'est la règle « on lit, on n'attend pas » qui
le sauve, et elle le sauve vraiment. Ce qui repart à zéro, c'est sa **place dans l'ordre**.
Les `trackSid` reviennent identiques (le client ne les génère jamais), mais chaque écran
reçoit un horodatage frais dans l'ordre des re-souscriptions sur le nouveau
`PeerConnection` — un ordre que rien n'aligne sur l'ordre d'origine. Reproduit : à deux
partages, la scène passe du présentateur de droit à l'autre.

Le cas est étroit (deux partages simultanés **et** une reconnexion complète). La forme
naturelle du remède est de ne purger que lorsque la `Room` est réellement `Connected`
(`room.state`), ce qui reste dans la frontière SDK. **À arbitrer, pas à glisser** : la
question de fond — la récence doit-elle survivre à une coupure réseau, ou repartir avec
elle ? — n'est pas tranchée par ce document.

**Et une note pour le jour où l'application ÉMETTRA un partage** : `republishAllTracks`
(`:26002`) donne au participant **local** des `trackSid` **neufs** à chaque reconnexion
complète. Sans conséquence aujourd'hui, fatal alors.

## Ce qu'aucun test ne prouvera

Rien de ce qui suit n'est un défaut connu : ce sont les endroits où la suite est
**structurellement aveugle**, à constater sur appareil avant de déclarer la fonction
livrée.

1. **Qu'une diapositive est lisible sur six pouces**, en paysage, avec un vrai support
   partagé depuis un vrai navigateur. RNTL ne rastérise rien.
2. **Que la vignette d'écran de la bande sert à quelque chose.** En paysage elle fait
   88×96 dp en `contain` : une diapositive 16:9 y occupe une bande de **88×50 dp**. Le
   test garde la *valeur* `contain`, jamais qu'on y reconnaisse quoi que ce soit.
3. **Que la colonne de 96 dp est le bon compromis en paysage**, où la hauteur utile
   tombe vers 400 dp et où la barre de contrôle prend encore sa part.
4. **Que la bascule d'orientation ne fait pas sauter la vidéo.** `configChanges` évite
   bien de recréer l'activité, mais que `VideoTrack` survive à un changement de
   contrainte de taille sans redémarrer sa surface ne se lit que sur appareil.
5. **Que l'écran interne d'un pliable tombe du bon côté** : 2076÷2152 ≈ **0,965**, où un
   prédicat binaire retourne toute la disposition sur 3,5 % de géométrie.
6. **Le comportement réel à la reconnexion complète**, à deux partages — voir la section
   ci-dessus. Une coupure Wi-Fi de dix secondes tranche entre « théorique » et « à
   corriger ».
7. **Que la scène du présentateur ne clignote pas** quand il coupe puis reprend son
   partage : pendant la coupure elle retombe sur la parole, puis revient. La mémoire de
   l'instant est gardée par un test ; le **va-et-vient visuel**, non.
