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

Deux propriétés du socle rendent le changement sûr : `participants.ts` est la
**seule** frontière avec LiveKit, et `selectLayout` est une **fonction pure**.
Toute la décision reste éprouvable sans WebRTC.

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
**alimentée à la lecture** et purgée des sids absents de la vue courante.

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

## Ce qu'aucun test ne prouvera

Qu'une diapositive est **lisible** sur un écran de six pouces. Cela se vérifie
sur appareil, en paysage, avec un vrai support partagé depuis un vrai
navigateur — et cela vaut d'être fait avant de déclarer la fonction livrée.
