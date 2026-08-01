# Grille de participants et épinglage — conception

**Date** : 2026-08-01
**État** : conception, non implémentée
**Branche** : `design/grid`
**Dépend de** : `2026-07-31-screen-share-reception-design.md` et son plan, **en cours
d'implémentation**. Les types qu'il livre — `VideoTrackRef`, `ParticipantView.screen`,
`.screenSince`, `TileSource`, `Tile.source`, `Tile.track`, clés `` `${identity}:${source}` ``
— sont supposés **acquis**. Ce document ne les redéfinit pas.

## Pourquoi

Sur un Pixel 10 Pro Fold en portrait — 1080 × 2364 px à densité 390, soit **443,08 dp**
de large et **969,85 dp** de haut —, une caméra 16:9 posée dans la scène de
`stage.tsx` est encadrée de bandes noires sur plus de la moitié de la hauteur. Le
cadrage n'offre pas d'échappatoire : en `cover`, la même source est agrandie à 4203 px
de large puis rognée à 1080, soit **26 % de l'image visible**. Le code porte déjà ce
contre-argument (`src/screens/room/stage.tsx:107-109`), et le lot de partage d'écran le
réaffirme en chiffres dans sa tâche 5.

Aucune des deux valeurs d'`objectFit` n'est bonne parce que **le problème n'est pas le
cadrage**. Une scène portrait de 443 × ~800 dp (rapport 0,55) qui montre une source de
rapport 1,78 gaspille ou coupe, toujours. C'est une question de **mise en page** : la
surface offerte n'a pas la forme du contenu.

La réponse tient en une phrase, et tout le reste du document la décline :

> **Le vide appartient à la marge de la page, jamais à l'intérieur d'une tuile.**

Une tuile dimensionnée au rapport de son contenu est pleine ; ce qui reste devient du
fond, centré, et se lit comme une mise en page voulue plutôt que comme une vidéo
cassée. Une grille est simplement le moyen de découper la boîte disponible en plusieurs
tuiles de ce rapport-là.

L'épinglage est l'autre moitié : une sélection automatique, aussi juste soit-elle, doit
pouvoir être suspendue. Garder à l'écran une personne précise, ou un écran partagé
précis, quoi qu'il arrive par ailleurs.

## Ce que le code dit aujourd'hui

Neuf faits relevés, chacun contraignant une décision plus bas.

**1. La sélection est une fonction pure, et c'est le bien le plus précieux du socle.**
`selectLayout` (`src/call/layout.ts:132`) ne lit ni horloge, ni `Room`, ni `Platform` :
mêmes entrées, mêmes vignettes. Les 22 tests de `src/call/layout.spec.ts`
(`npx jest src/call/layout.spec.ts`) s'exécutent sans WebRTC. **Toute cette conception
passe par des arguments supplémentaires à cette fonction, jamais par une lecture qu'elle
ferait elle-même.**

**2. La bande est ordonnée par l'arrivée, jamais par la parole, et le motif est écrit.**
`src/call/layout.ts:66-73` : « une bande triée par le locuteur se réorganise sous le
pouce, et l'on appuie sur la vignette de quelqu'un d'autre que celle qu'on visait. »
Cette contrainte survit intégralement à la grille.

**3. La scène va à la personne, pas à la piste.** `pickStage`
(`src/call/layout.ts:108-114`) rend un `ParticipantView` ; un locuteur caméra coupée
garde la scène. Et jamais à soi tant qu'un distant existe (`layout.ts:99-102` :
« on tient le téléphone, on n'a pas besoin de se voir en grand »).

**4. La bande fait 96 dp d'épaisseur, la vignette 128 dp de large.**
`stage.tsx:18` (`tokens.spacing.xl * 3`) et `stage.tsx:36` (`tokens.spacing.xl * 4`).
Le lot en cours reprend 96 dp pour la colonne du paysage (tâche 6). Ce sont les seuls
nombres du dépôt qui disent « une tuile vidéo dans laquelle on reconnaît encore
quelqu'un ».

**5. La barre est pleine.** `src/screens/room/controlBar.ts:12` :
`7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp` sur un écran qui en fait 360 ; `call.tsx:731-733`
ajoute qu'« une huitième cible en demanderait 409 ». Elle occupe
`4 + 44 + 4 = 52 dp` de hauteur (`call.tsx:126-134` + `controlBar.ts:17`).

**6. Trois bandeaux peuvent s'empiler au-dessus de la scène, à tout instant.**
`call.tsx:646-663` monte `WaitingBanner`, `RecordingIndicator` et `HandBanner`
inconditionnellement ; chacun ne rend rien au repos. La hauteur réellement offerte à la
scène **n'est donc pas** une fonction des dimensions de la fenêtre.

**7. `adaptiveStream` et `dynacast` sont désactivés.** `src/call/connection.ts:75`
construit `new Room()` sans options ; `livekit-client` 2.18.0 pose
`adaptiveStream: false, dynacast: false` par défaut
(`node_modules/livekit-client/dist/livekit-client.esm.mjs:17261-17262`). Conséquence
mesurable dans le code du composant : `VideoTrack.tsx:174-176` et `:198-202`
(`@livekit/react-native` 2.12.0) ne branchent `observeElementInfo` **que** si
`videoTrack.isAdaptiveStream`, et `ViewPortDetector` est monté `disabled`
(`VideoTrack.tsx:246`). Aujourd'hui, **aucune tuile ne fait baisser sa qualité ni ne se
met en pause hors écran**, quelle que soit sa taille.

**8. Le rapport d'image de la source est lisible, et personne ne le lit.**
`TrackPublication.dimensions?: Track.Dimensions`
(`node_modules/livekit-client/dist/src/room/track/TrackPublication.d.ts:21`), avec
`TrackEvent.VideoDimensionsChanged` pour l'invalider
(`node_modules/livekit-client/dist/src/room/events.d.ts:561`). `src/call/participants.ts`
ne le lit pas.

**9. On lit l'état présent, on n'attend pas un événement.** `recordingStore.ts:65-69` :
le SDK n'émet pas `RoomMetadataChanged` à la jonction. `participants.ts:32-38` : au
niveau `Room`, `ParticipantAttributesChanged` n'arrive pas non plus à la création d'un
participant distant. Deux fois payé.

## Décisions

| Question | Décision |
|---|---|
| Combien de tuiles ? | Le maximum que la **boîte mesurée** accepte au-dessus d'un plancher de **160 dp de hauteur de tuile** — jamais un nombre écrit en dur, jamais l'orientation. |
| Qui décide de la disposition ? | `selectLayout`, fonction pure, sur trois entrées : la vue, la boîte, l'épinglage. |
| Grille ou scène + bande ? | **Les deux**, et le **contenu** tranche : un épinglage ou un écran partagé ⇒ mode `focus` ; sinon ⇒ mode `grid`. |
| Un écran garde-t-il la scène ? | **Oui, règle conservée** — et renforcée d'un second motif. Elle cède au seul épinglage. |
| Combien d'épinglages ? | **Un.** |
| Sur quoi porte-t-il ? | Une **clé de tuile** (`${identity}:${source}`), pas une personne. |
| Où vit-il ? | Dans `call.tsx`, en `useState`. **Local à l'appareil**, non partagé, non persisté. |
| Survit-il au départ ? | Il n'est jamais « effacé » : il est **résolu contre la vue présente** à chaque rendu, et ignoré s'il ne résout pas. Une reconnexion le conserve donc. |
| Quel geste ? | **Appui long** sur n'importe quelle tuile, plus un marqueur pressable pour en sortir. |

> ## Décision du 2026-08-01, prise sur appareil : l'épinglage cède la place au PLEIN ÉCRAN
>
> Constaté en séance réelle, écran partagé depuis un navigateur de bureau, sur l'écran de
> couverture d'un Pixel 10 Pro Fold en paysage : la scène fonctionne, mais elle ne reçoit que
> **695 × 391 dp** d'image utile, parce que la bande en colonne lui prend 96 dp de large et la
> barre de contrôle 52 dp de haut. La boîte vaut 969,8 × 443 dp, et une source 16:9 en
> `contain` y est limitée par la hauteur.
>
> **Masquer les deux porte l'image à 787,6 × 443 dp — +13 % en linéaire, +28 % en surface.**
> Sur du texte partagé, 13 % de hauteur de glyphe sépare « lisible » de « confortable ».
>
> **Ce que cela change, et c'est une simplification :**
>
> - **L'épinglage disparaît en tant que notion distincte.** Les quatre lignes ci-dessus ne
>   s'appliquent plus. `selectLayout` ne prend plus de troisième entrée : la scène est
>   décidée par le contenu seul (un écran partagé la prend, sinon la parole).
> - **L'appui long ouvre le PLEIN ÉCRAN** sur la tuile visée : ni bande, ni barre de contrôle,
>   ni marqueur. Un appui n'importe où ramène les commandes pour quelques secondes, à la
>   manière d'un lecteur vidéo — c'est la convention la plus répandue, et elle évite d'avoir à
>   viser une petite cible pour sortir.
> - **L'appui simple fait apparaître une icône d'agrandissement** sur la tuile, quelques
>   secondes. C'est la voie qui se **découvre** ; l'appui long est le raccourci de celui qui
>   sait. Les deux mènent au même état.
>
> **Ce qu'on perd, et c'est assumé :** « garder cette personne sur la scène tout en voyant les
> autres ». Le plein écran est exclusif par construction. Arbitré explicitement.
>
> **Ce qu'aucun test ne prouvera, et qui s'ajoute à la liste :** qu'un appui long se découvre
> — le problème est seulement déplacé, pas résolu, et c'est précisément pourquoi l'appui
> simple garde une affordance visible. Et que les commandes rappelées se retirent au bon
> moment : trop tôt on les rate, trop tard elles gênent.
| Le paysage ? | La grille **remplace** la bascule `width > height` du lot en cours par un unique comparatif continu, `W / H` contre `TILE_ASPECT`. |

### 1. Le nombre de tuiles vient de la boîte mesurée, pas de l'orientation

**La question posée est mal posée si elle oppose « nombre de participants », « orientation »
et « taille de fenêtre » : les trois entrent, et par la même formule.**

`selectLayout` reçoit une **boîte** `{ width, height }` en dp et un nombre de tuiles
candidates. Pour chaque nombre de colonnes envisageable, elle calcule la cellule qui en
résulte, y **inscrit** le rapport `TILE_ASPECT = 16/9`, et retient l'arrangement dont
l'aire de tuile est la plus grande — à égalité, le moins de colonnes.

```
pour c de 1 à n :
  r      = ceil(n / c)
  cellW  = (W - (c-1)·gap) / c
  cellH  = (H - (r-1)·gap) / r
  tuileW = min(cellW, cellH · A)      # on inscrit A dans la cellule
  tuileH = tuileW / A
  score  = tuileW · tuileH
```

Un arrangement n'est retenu que si `tuileH ≥ MIN_TILE_HEIGHT`. La **capacité** de la
boîte est le plus grand `n` admettant un arrangement retenu. Elle vaut au minimum 1 :
si aucun arrangement ne passe le plancher, on rend l'arrangement `1×1` quand même —
une tuile trop petite reste préférable à un écran vide.

**`MIN_TILE_HEIGHT = 160 dp`, et ce nombre a une signification physique** : le dp est
défini comme 1/160 de pouce, donc 160 dp valent **exactement un pouce de hauteur réelle**,
quelle que soit la densité. C'est un plancher pour un visage, pas un compte de pixels.
Il est néanmoins **choisi, pas mesuré** — voir « Ce qu'aucun test ne prouvera ».

Ce que cela donne, sur la boîte de contenu de l'écran de couverture en portrait —
443,08 − 8 de marge = **435,0 dp** de large ; 969,85 − 52 (barre) = 917,85, moins les
encoches et les bandeaux, disons **892 dp** en illustration ; `gap = tokens.spacing.xs = 4` :

| n | arrangement | tuile (dp) | aire (dp²) |
|---|---|---|---|
| 1 | 1 × 1 | 435,0 × 244,7 | 106 439 |
| 2 | 1 × 2 | 435,0 × 244,7 | 106 439 |
| 3 | 1 × 3 | 435,0 × 244,7 | 106 439 |
| 4 | 1 × 4 | 391,1 × 220,0 | 86 044 |
| 5 | 1 × 5 | 311,5 × 175,2 | 54 569 |
| 6 | — aucun arrangement ne passe 160 dp | | |

**Capacité : 5.** Et le résultat le plus instructif : sur un téléphone en portrait, la
formule reste sur **une seule colonne** jusqu'au plancher. Elle n'a pas été écrite pour
cela — c'est l'arithmétique d'une boîte étroite et haute qui la produit. La « grille »
d'un téléphone en portrait est une **colonne de tuiles larges**.

La même boîte tournée — 961,85 × 383,08 dp de contenu :

| n | arrangement | tuile (dp) | aire (dp²) |
|---|---|---|---|
| 1 | 1 × 1 | 681,0 × 383,1 | 260 889 |
| 2 | 2 × 1 | 478,9 × 269,4 | 129 020 |
| 3–4 | 2 × 2 | 337,0 × 189,5 | 63 867 |
| 5–6 | 3 × 2 | 317,9 × 178,8 | 56 864 |
| 7 | — plancher | | |

**Capacité : 6.** L'orientation n'apparaît nulle part dans la formule ; elle est
entièrement contenue dans `W` et `H`.

Et sur l'écran interne du pliable — 2076 × 2152 px. **La densité de cet écran n'est pas
mesurée** ; en la supposant égale à celle de la couverture (390), la boîte de contenu
fait ≈ 843,7 × 822,9 dp. La formule retient alors `2 × 5` pour n = 9 ou 10, tuiles de
**286,9 × 161,4 dp** — **capacité 10**. Si la densité réelle diffère, seuls les nombres
changent, pas la règle.

Comparé au téléphone : le pliable montre **deux fois plus de monde**, chaque tuile
faisant 46 300 dp² contre 54 569 sur le téléphone à sa capacité de 5. Aucune ligne de
code ne mentionne les pliables.

**La boîte est mesurée par `onLayout`, pas par `useWindowDimensions()`.** Trois motifs,
et le premier suffit : la fenêtre ignore les 52 dp de la barre (fait 5), les encoches
de `SafeAreaView` (`app/_layout.tsx:61`, valeurs non mesurées) et les **trois bandeaux**
qui peuvent apparaître à tout instant (fait 6). Une capacité calculée sur la fenêtre
placerait une rangée derrière la barre de contrôle dès qu'une main se lève. `onLayout`
coûte une trame et supprime la classe entière.

### 2. Grille ou scène + bande : le contenu tranche, pas la géométrie

Deux modes, et **un seul ordre de priorité** :

1. **L'épinglage résout** vers une tuile présente ⇒ mode `focus`, cette tuile en grand.
2. **Sinon, un partage d'écran existe** ⇒ mode `focus`, l'écran de `screenSince` le plus
   grand. C'est la règle du lot en cours, **inchangée**.
3. **Sinon** ⇒ mode `grid`.

**La règle « un écran prend la scène tant qu'il dure » est conservée, et je lui ajoute un
motif que le lot en cours n'avait pas** : sous cette conception, une tuile n'est **jamais**
letterboxée à l'intérieur — c'est le principe de la première section. Or un écran partagé
ne peut pas être rogné : « un texte coupé est un texte perdu ». Un écran est donc le seul
contenu qui exige un `contain`, donc le seul qui exige une boîte à lui, donc le seul qui ne
peut pas entrer dans une cellule de grille. **La règle ne découle plus seulement du produit
— elle découle de la géométrie.**

Ce que le mode `grid` supprime, et il faut le dire franchement : **la sélection du
locuteur actif comme « grande scène » disparaît quand personne ne partage et rien n'est
épinglé.** C'est délibéré : la grande scène est précisément la géométrie qui produit les
bandes noires mesurées. `compareForStage` (`layout.ts:91-97`) **survit intégralement**,
mais change d'office : il ne choisit plus *la* scène, il **classe** — et ce classement ne
sert qu'à décider qui obtient une cellule quand il y a plus de monde que de cellules.
`pickStage(view)` est exactement `rankBySpeech(view)[0]` ; la fonction disparaît, sa règle
non.

**L'ordre d'affichage des cellules reste l'ordre stable** (arrivée, puis identité —
`compareStable`, `layout.ts:74-80`), jamais le classement par la parole. Le motif du
fait 2 vaut au moins autant pour une grille que pour une bande : une cellule qui change
de place sous le pouce est pire qu'une cellule absente.

Conséquence : **tant que `n ≤ capacité`, la grille ne bouge jamais.** C'est le cas
courant. Au-delà, l'appartenance change avec la parole, et c'est le seul endroit où la
grille remue — l'épinglage est la réponse offerte à qui n'en veut pas.

**Sa propre tuile occupe toujours une cellule, en première position, hors classement** —
même motif que `layout.ts:135-137` : « la chercher parmi des vignettes qui bougent, c'est
ne jamais savoir si l'on est cadré ». **Sauf à capacité 1**, où la cellule va au premier
distant : c'est mot pour mot la règle de `layout.ts:99-102`, généralisée au lieu d'être
contredite.

**Le débordement est un compte, pas un défilement.** Au-delà de la capacité, les tuiles
restantes ne sont pas rendues et un `+N` les représente. Motifs : un défilement vertical
dans la grille entrerait en conflit avec l'appui long qui est le geste d'épinglage ; il
n'a aucune position de repos naturelle ; et `ParticipantsPanel` (`participantsPanel.tsx`)
est déjà, dans ce dépôt, la surface qui répond à « qui est là » — distincte de « ce que je
regarde ». La bande du mode `focus`, elle, garde son défilement : elle en a un depuis
`stage.tsx:115`, l'axe est unique, et une vignette de 128 dp n'est pas une cible d'appui
long qu'on vise longuement.

Effet secondaire mesurable et favorable : la grille rend **au plus `capacité` tuiles**
là où la bande actuelle en rend autant qu'il y a de participants (`stage.tsx:122-126`).
Avec `adaptiveStream` désactivé (fait 7), c'est autant de décodages en moins. **La
grille ne dégrade pas le budget de décodage ; elle le borne pour la première fois.**

### 3. L'épinglage : un seul, sur une tuile, local à l'appareil

**Un seul élément épinglable.** Sur 443 dp il n'y a qu'une grande surface ; deux
épinglages en réclameraient deux, ce qui est une grille — mais une grille que
l'utilisateur devrait entretenir à la main, et sans règle d'ordre évidente entre les
deux.

**L'épinglage porte une clé de tuile, `${identity}:${source}`, pas une identité.** Depuis
le lot en cours, un présentateur produit deux tuiles ; « épingler Alice » est ambigu dès
qu'elle partage. La clé existe déjà et est unique.

**L'état vit dans `call.tsx`, en `useState<string | null>`, local à l'appareil.** Trois
motifs :

- *Produit.* Épingler est une préférence de **regard**. Un épinglage partagé donnerait à
  quiconque le pouvoir d'imposer ce que les autres regardent — un pouvoir de modération
  que le backend ne modélise pas : `src/api/participants.ts:61,71,81` offre couper le
  micro, expulser, changer de rôle — et rien sur la vue.
- *Technique, et c'est le motif décisif.* Un épinglage partagé passerait par les
  métadonnées de salon ou par les attributs de participant — **exactement les deux canaux
  dont ce dépôt a payé le silence à la jonction, deux fois** (fait 9). On importerait toute
  cette classe de bogue pour une fonctionnalité qui ne gagne rien à être partagée.
- *Durée de vie.* Rien à persister : un épinglage ne survit pas à la fin de la séance.

**Il vit dans `call.tsx` et non dans `CallStage`** parce que `CallStage` est démontée dès
qu'on ouvre le panneau des participants (`call.tsx:669-681`) : un épinglage posé dans la
coquille disparaîtrait à chaque coup d'œil sur la liste.

**Il n'est jamais « effacé » — il est résolu.** `selectLayout` cherche la clé dans les
tuiles qu'elle vient de construire ; si elle ne la trouve pas, il n'y a pas de focus, et
le mode retombe sur les règles 2 et 3. La coquille n'écoute donc **aucun** événement de
départ, et le socle n'acquiert aucune logique d'expiration. C'est l'analogue local du
fait 9 : **on lit ce qui est présent, on n'attend pas qu'on nous dise ce qui est parti.**

Conséquences, assumées et nommées :

- **Une reconnexion conserve l'épinglage.** Les identités viennent du jeton et ne changent
  pas ; la vue est relue après `RoomEvent.Reconnected` (`participants.ts:31`) et la clé
  résout de nouveau. C'est le comportement voulu : un épinglage qui saute pendant une
  coupure de trois secondes est un défaut.
- **Un vrai départ suivi d'un retour dans la même séance le restaure aussi.** C'est le
  prix du choix précédent. Au pire une surprise, réversible d'un appui, et la personne est
  de nouveau à l'écran — ce que l'épinglage demandait.

**L'épinglage prime sur le partage d'écran.** Un épinglage qu'un partage pourrait
renverser n'épingle pas. Symétriquement, un écran qui démarre pendant un épinglage
n'obtient rien : il va dans la bande, avec sa vignette en `contain`. Et l'on peut épingler
un écran (`alice:screen`), ce qui immunise le choix contre un second partage plus récent —
le cas concret : deux personnes présentent, on veut rester sur la première.

**Épingler force le mode `focus`, et cela seulement.** Un épinglage n'a pas de second sens
« garantir une cellule dans la grille » : deux sens, c'est deux choses à expliquer.

### 4. Le geste : appui long, et une sortie toujours visible

**Pas dans la barre.** Elle est pleine à 357 dp sur 360 (fait 5).

Écartés, chacun pour un motif :

- **Un bouton sur chaque tuile.** Sur la plus petite cellule qu'un téléphone produise —
  311,5 dp de large, à capacité 5 —, une cible de 44 dp mange 14 % de la largeur, en
  permanence, sur les cinq tuiles. Et l'`iconColor` d'un `IconButton` à icône-chaîne n'est
  **jamais** joignable par un test (`AGENTS.md`, `IconButton.tsx:211` ne transmet pas de
  `testID`) : on en poserait cinq d'un coup, tous hors de portée de la doctrine de
  contraste.
- **Une entrée dans `MoreMenu`.** Le menu est global, l'épinglage est par tuile. Il
  faudrait un sous-menu listant les participants — c'est-à-dire `ParticipantsPanel`,
  reconstruit en moins bien.
- **Une entrée dans `ParticipantsPanel`.** Tentant : l'emplacement existe
  (`participantsPanel.tsx:50-87`), la doctrine de contraste y est déjà appliquée, et
  `Button` est joignable par `` `${testID}-text` `` (`AGENTS.md`). Mais le panneau liste
  des `ParticipantView`, une ligne par personne : il ne peut pas désigner `alice:screen`.
  Il n'exprimerait donc que la moitié du modèle. **Hors périmètre**, et pour cette
  raison-là.

**Retenu : l'appui long sur n'importe quelle tuile**, cellule de grille comme vignette de
bande. Zéro pixel, zéro cible, zéro budget de barre ; le même geste partout ; et le dépôt
n'a **aucun** `Pressable` ni `onLongPress` aujourd'hui —
`grep -rnE "onLongPress|Pressable" src app` ne rend rien, code de sortie 1 — donc aucune
convention à réconcilier. Le seuil est celui de React Native,
`DEFAULT_LONG_PRESS_DELAY_MS = 500`
(`node_modules/react-native/Libraries/Pressability/Pressability.js:257`).

Sémantique : **bascule**. `onTogglePin(key)` ⇒ `pin === key ? null : key`. Épingler une
autre tuile déplace l'épinglage ; il n'y a pas d'état intermédiaire.

**Le défaut de l'appui long est sa découvrabilité, et on le traite par la sortie, pas par
l'entrée.** La tuile épinglée porte un marqueur permanent — un glyphe
`MaterialCommunityIcons` (`pin`) rendu **directement, avec son propre `testID`**, comme
`menuCheck.tsx:18-19` : c'est un `Text` comme un autre, donc sa couleur explicite est
**joignable par un test**, contrairement à l'`iconColor` d'un `IconButton`. Il est
pressable et dépingle. Une seule cible, sur une seule tuile, et seulement dans un état où
l'utilisateur est entré exprès.

**Accessibilité.** Un appui long est invisible pour un lecteur d'écran. La tuile porte donc
`accessibilityActions` (`node_modules/react-native/Libraries/Components/View/ViewAccessibility.d.ts:27`)
avec une action nommée et son `onAccessibilityAction`. **Je n'ai pas vérifié le
comportement réel d'une action personnalisée sous TalkBack ni VoiceOver dans RN 0.86** :
la présence de la prop est garantie par un test, son effet ne l'est pas.

**Jamais `disabled`.** Il n'y a d'ailleurs aucun état où l'épinglage serait indisponible :
toute tuile rendue est épinglable. Rien à masquer non plus.

### 5. Le paysage : la grille remplace la bascule, elle ne s'y accorde pas

Le lot en cours introduit `const landscape = width > height` dans `stage.tsx` (tâche 6)
et fait basculer la bande d'une rangée à une colonne. **Cette bascule est remplacée**, pour
trois motifs, dont le premier est décisif.

**Elle est instable là où le produit doit être le plus soigné.** L'écran interne du
Pixel 10 Pro Fold fait **2076 × 2152** : `width > height` est **faux**, et le rapport vaut
**0,965** — 3,5 % du carré. L'appareil tourné donne 1,037. Le prédicat bascule donc, et
avec lui la disposition entière, sur une variation de 3,5 % de la géométrie. Un seuil
binaire posé à 1,000 sur une valeur qui vit à 0,97 est un seuil placé exactement là où il
ne faut pas.

**Elle n'est pas la bonne question.** Ce qui décide n'est pas « est-ce plus large que
haut », c'est « la boîte est-elle plus large que le contenu ne le demande ». Le comparatif
juste est donc `W / H` contre `TILE_ASPECT` :

- `W / H < TILE_ASPECT` ⇒ la tuile de focus est limitée par la largeur, le mou est
  vertical ⇒ **la bande passe dessous**.
- `W / H > TILE_ASPECT` ⇒ le mou est horizontal ⇒ **la bande passe sur le côté**.

Vérification : téléphone portrait 435/892 = 0,49 ⇒ dessous ; téléphone paysage
961,85/383,08 = 2,51 ⇒ sur le côté — c'est exactement ce que le lot en cours voulait, et
on l'obtient sans nommer l'orientation. Pliable ouvert, 843,7/822,9 = 1,025 dans un sens et
0,975 dans l'autre : **dessous dans les deux cas**, aucune bascule. Le seuil est à 1,778,
loin de la zone où l'appareil vit.

**Et en mode `grid`, la question ne se pose pas du tout** : il n'y a pas de bande. La
formule de la section 1 produit une colonne en portrait et deux ou trois en paysage sans
qu'aucun code ne connaisse le mot.

Le lot en cours peut donc livrer sa tâche 6 telle quelle — elle est correcte pour ce
qu'elle couvre — en sachant que ce lot-ci en retire le prédicat et le `useWindowDimensions`
qui l'alimente.

**La barre de contrôle ne bouge pas en paysage.** Comme le lot en cours, et pour la même
raison : c'est un sujet à part, et les 52 dp qu'elle occupe sont déjà intégrés à la boîte
mesurée.

## Architecture

### Un module nouveau pour l'arithmétique

`src/call/grid.ts` — l'empaquetage, séparé de la sélection parce qu'il ne connaît ni
participant ni piste, seulement des nombres.

```ts
export type Box = { readonly width: number; readonly height: number };

export type Packing = {
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
};

// Un pouce de hauteur réelle : le dp vaut 1/160 de pouce par définition.
export const MIN_TILE_HEIGHT = 160;
export const TILE_ASPECT = 16 / 9;

// Fonction totale : elle rend toujours un arrangement. Quand aucun ne passe le
// plancher, elle rend le `1×1` — seul cas où `tileHeight` peut être sous
// MIN_TILE_HEIGHT. Une tuile trop petite reste préférable à un écran vide.
export function packGrid(count: number, box: Box, gap: number): Packing;

// Le plus grand `count` dont `packGrid` respecte le plancher, jamais moins de 1.
export function gridCapacity(box: Box, gap: number): number;
```

Entièrement pure, entièrement arithmétique, entièrement éprouvable : aucun composant,
aucun SDK, aucune horloge.

### `CallLayout` devient une union discriminée

```ts
export type CallLayout =
  | {
      readonly mode: 'grid';
      readonly columns: number;
      readonly tileWidth: number;
      readonly tileHeight: number;
      readonly tiles: readonly Tile[];
      // Combien de participants la boîte n'a pas pu montrer. 0 le plus souvent.
      readonly overflow: number;
    }
  | {
      readonly mode: 'focus';
      readonly focus: Tile;
      // Vrai quand c'est l'épinglage qui a produit ce focus, faux quand c'est
      // un partage d'écran. La coquille en tire le marqueur, pas une règle.
      readonly pinned: boolean;
      readonly stripAxis: 'row' | 'column';
      readonly filmstrip: readonly Tile[];
    };
```

Une union plutôt qu'un objet à champs optionnels : `tsc` trouve alors tout consommateur
qui aurait oublié un mode, et `twake-typescript-conventions` préfère les unions de chaînes.
La forme actuelle `{ stage, filmstrip }` disparaît ; `mode: 'focus'` en est le successeur
direct, ce qui limite la réécriture de `stage.tsx` à un aiguillage.

### La signature de la sélection

```ts
export function selectLayout(
  view: RoomView,
  facing: FacingMode,
  box: Box,
  // Une clé de tuile, `${identity}:${source}`. `null` = rien d'épinglé.
  pin: string | null,
): CallLayout;
```

Toujours pure. `box` et `pin` entrent par la porte ; rien n'est lu à l'intérieur.
`selectLayout` **ne rend jamais `null`** : une boîte est toujours une boîte, et la capacité
plancher de 1 garantit une tuile.

### Le chemin de la mesure

`useCallLayout` (`src/call/useCallLayout.ts:15`) gagne `box` et `pin` et rend
`CallLayout | null` — `null` **tant que la mesure n'est pas arrivée**, ce qui dure une
trame et se voit à côté des secondes de négociation WebRTC qui précèdent.

```
call.tsx                                   CallStage
────────────────────────────────────────   ──────────────────────────────────
useState<Box | null>       ◀───────────────  onLayout sur la View racine
useState<string | null> pin ───────────────▶  rend le marqueur sur le focus
useCallLayout(room, facing, box, pin) ─────▶  layout: CallLayout | null
setPin(toggle)             ◀───────────────  onTogglePin(key), appui long
```

**La coquille reste bête** — c'est la doctrine de `stage.tsx:96-98`. Elle mesure, elle
remonte, elle rend ce qu'on lui donne, elle relaie un appui long. Elle ne décide rien :
ni le nombre de colonnes, ni la taille des tuiles, ni le mode, ni l'axe de la bande.

L'épinglage vit dans `call.tsx` parce que `CallStage` est démontée par le panneau des
participants (`call.tsx:669-681`). La boîte, elle, vit aussi dans `call.tsx` : elle sera
re-mesurée en une trame au remontage.

### Le cadrage, complété

Une seule règle, et elle découle du principe d'ouverture :

| surface | `objectFit` | motif |
|---|---|---|
| cellule de grille | `cover` | La cellule **est** au rapport du gabarit ; jamais de vide à l'intérieur d'une tuile. |
| focus portant une caméra | `cover` | Idem : la tuile est inscrite au gabarit et centrée, le mou devient marge. |
| focus portant un écran | `contain` | La tuile prend **toute** la boîte, sans gabarit. Un texte coupé est un texte perdu. |
| vignette de bande, caméra | `cover` | Inchangé (`stage.tsx:125`). |
| vignette de bande, écran | `contain` | Inchangé (lot en cours, tâche 5). |

Un écran n'entre jamais dans une cellule de grille : il force le mode `focus`.

**Conséquence à dire tout haut : le mode `focus` reproduit exactement la géométrie qui a
produit le défaut mesuré.** Une caméra épinglée sur un téléphone en portrait donne une
boîte de 435 × 792 dp pour une image de 435 × 244,7 — le même vide qu'aujourd'hui, à ceci
près qu'il est en marge et non dans la tuile. **C'est assumé** : le mode `focus` est ce que
l'utilisateur demande explicitement en épinglant, ou ce qu'un écran partagé exige. La
grille est l'échappatoire, et c'est le mode par défaut.

### Ce que la grille fait au cas courant, chiffré

Deux participants, écran de couverture en portrait :

La scène occupe aujourd'hui toute la largeur (443,08 dp, `stage.tsx:11` `flex: 1`, sans
marge horizontale) moins la bordure de 2 dp (`stage.tsx:29-34`), et toute la hauteur moins
les 96 dp de bande — soit **439,1 × 792 dp**. La grille pose 4 dp de marge de page de
chaque côté, d'où 435,0.

| | aujourd'hui (après le lot en cours) | avec la grille |
|---|---|---|
| image du distant | 439,1 × 247,0 dp | **435,0 × 244,7 dp** |
| noir **dans** sa tuile | 2 × 272,5 dp | **0** |
| sa propre image | vignette de 128 dp de large | 435,0 × 244,7 dp |
| fond en marge | 0 | 2 × 199,3 dp |

**L'image du distant rétrécit de 0,9 %** — l'écart tient entièrement aux 8 dp de marge de
page, et la largeur est contraignante dans les deux cas. Ce qui change, c'est où va le
vide.

On pourrait objecter que l'on se voit désormais aussi grand que l'autre, contre la
doctrine de `layout.ts:99-102`. Celle-ci dit qu'on ne prend pas la **grande** surface à
quelqu'un ; en grille il n'y a pas de grande surface, et la place occupée par sa propre
cellule était du noir. **Personne n'est déplacé.**

À trois participants, la comparaison est plus nette encore : les deux visages qui étaient
des vignettes de 128 dp deviennent des tuiles de 435 dp, sans que le troisième perde quoi
que ce soit.

### Internationalisation

Quatre clés, les sept locales remplies avant fusion (`src/i18n/index.spec.ts:17` échoue
sur toute clé manquante) :

- `call.pin` — libellé de l'action d'accessibilité.
- `call.unpin` — idem, quand la tuile est déjà épinglée.
- `call.pinned` — `accessibilityLabel` du marqueur.
- `call.moreParticipants` — le débordement, avec `{{count}}`, sur le précédent exact de
  `waiting.others` (`{{count}} more waiting`).

### Style

Aucun style en ligne, tout par `StyleSheet.create` — sauf les **dimensions calculées** des
tuiles, qui viennent de `Packing` et ne peuvent pas être statiques. Elles passent par un
tableau `[styles.tile, { width, height }]`, ce qui est un objet de style dynamique et non
un littéral figé : c'est la seule forme possible et il faut la nommer, parce qu'un
relecteur pressé y verra une infraction. Les couleurs, rayons, écarts restent tous des
`tokens`.

Le marqueur d'épinglage et le compteur de débordement portent chacun une couleur
explicite `tokens.color.textDark` : ils sont posés sur le fond que `call.tsx:123` force
sombre dans les deux schémas, et sans cela Paper les fait retomber sur `onSurface`,
quasi-noir en schéma clair (`AGENTS.md` ; deux composants livrés à 1,08:1).

## Hors périmètre, explicitement

- **Émettre un partage d'écran** depuis le mobile. Autre fonction, autres permissions.
- **Activer `adaptiveStream`** (`connection.ts:75`, une ligne). C'est la suite la plus
  rentable de ce lot — elle mettrait en pause les pistes hors écran et ferait baisser la
  qualité des petites tuiles — mais elle est **orthogonale** : la grille ne décode pas plus
  qu'aujourd'hui, elle décode moins (elle borne à `capacité`). L'activer change le
  comportement réseau de toute l'application et ne se vérifie que sur appareil. Coût
  connexe à peser : `ViewPortDetector` scrute alors toutes les 1000 ms
  (`ViewPortDetector.tsx:12`).
- **Adapter le rapport des tuiles aux dimensions réelles des sources.** Lisible via
  `TrackPublication.dimensions` (fait 8), délibérément non lu : une grille qui se recompose
  parce qu'un autre participant a tourné son téléphone est pire que 20 % de marge.
- **Un épinglage partagé entre participants** — motivé en section 3.
- **Une entrée d'épinglage dans `ParticipantsPanel`** — motivée en section 4 : le panneau
  ne peut désigner qu'une personne, pas une tuile.
- **Un basculement manuel grille / locuteur.** La barre est pleine, et un mode que
  l'utilisateur doit choisir est un mode qu'il doit entretenir. L'épinglage donne le même
  pouvoir avec un sens plus clair.
- **Le défilement de la grille.** Motivé en section 2.
- **Déplacer la barre de contrôle en paysage.**
- **Persister un épinglage** entre deux séances.

## Ce que les tests garderont

`*.spec.ts(x)` colocalisés, aucun instantané, `npm test` / `npm run typecheck` /
`npm run lint` verts. Référence à la racine de cette branche : **625 tests, 51 suites**
(`npm test`, 2026-08-01).

**`src/call/grid.spec.ts` — l'arithmétique, et c'est là que se trouve la valeur.**

1. Sur une boîte de 435 × 892, la capacité vaut **5** ; sur 961,85 × 383,08, elle vaut
   **6**. Deux boîtes, deux nombres différents, aucune mention d'orientation.
2. Pour n = 2 sur 435 × 892, l'arrangement retenu est **1 colonne**, pas 2. C'est le test
   qui mord si quelqu'un remplace le critère d'aire par « le plus carré possible ».
3. Pour n = 2 sur 961,85 × 383,08, l'arrangement retenu est **2 colonnes**. Le même n, la
   même fonction, l'autre réponse : une implémentation qui renverrait une constante
   passerait le test 2 seul.
4. Pour tout `count ≤ gridCapacity(box)`, `tileHeight ≥ 160`. Et sur une boîte assez
   petite pour qu'aucun arrangement ne passe, `packGrid(1, …)` rend quand même le `1×1` —
   la fonction est totale, elle ne rend jamais `null`.
5. `tileWidth / tileHeight` vaut `TILE_ASPECT` pour tout arrangement rendu
   (`toBeCloseTo`, pas une égalité stricte : c'est un flottant).

**`src/call/layout.spec.ts` — la sélection.**

6. **Précédence.** Trois tests, chacun isolant un cran : un épinglage l'emporte sur un
   partage d'écran en cours ; un partage l'emporte sur la grille quand rien n'est épinglé ;
   ni l'un ni l'autre ⇒ `mode: 'grid'`. Le premier doit faire **parler quelqu'un d'autre**
   que la personne épinglée, sinon une implémentation qui laisserait la parole décider
   passerait par coïncidence.
7. **Un épinglage qui ne résout pas est ignoré** : `pin` pointe une clé absente de la vue,
   le mode retombe sur la règle suivante. C'est le test qui garde le fait 9 sous sa forme
   locale — il mord si quelqu'un ajoute une logique d'expiration au lieu de résoudre.
8. **Un épinglage sur `alice:screen` tient malgré un `screenSince` plus récent chez
   quelqu'un d'autre.** Deux partages, ordre d'insertion inverse de l'attendu.
9. **L'ordre des cellules est l'ordre stable, jamais la parole.** Trois participants dont
   le dernier arrivé parle : l'ordre rendu reste celui de l'arrivée. Copie fidèle du test
   existant « ne se réordonne pas quand la parole change de camp ».
10. **La coupe au-delà de la capacité suit le classement par la parole**, et `overflow`
    compte ce qui manque. Le test place le locuteur en **dernière** position d'arrivée pour
    qu'un tri qui garderait simplement les premiers arrivés échoue.
11. **Sa propre tuile est toujours présente et en première place** dès que la capacité
    dépasse 1 ; **à capacité 1, la cellule va au premier distant.**
12. **`stripAxis`** vaut `'row'` sur 435 × 892 et `'column'` sur 961,85 × 383,08 ; et
    `'row'` sur 843,7 × 822,9 **comme** sur 822,9 × 843,7 — les deux postures du pliable,
    même réponse. Ce dernier test est celui qui mord si le comparatif redevient
    `width > height`.
13. **Un écran n'apparaît jamais dans `mode: 'grid'`** — l'union le rend structurellement
    impossible, mais le test le fixe contre une régression de la règle de précédence.

**`src/screens/room/stage.spec.tsx` — le câblage, et rien d'autre.**

14. **Aucune tuile n'est rendue avant la mesure** (`layout` à `null`), et la `View` racine
    porte bien un `onLayout`.
15. `fireEvent(racine, 'layout', …)` avec deux boîtes différentes produit deux nombres de
    `VideoTrack` rendus différents. C'est une assertion sur la **structure**, jamais sur
    l'apparence.
16. **L'appui long relaie la clé de la tuile pressée**, et pas une autre :
    `fireEvent(tuile, 'longPress')` sur la deuxième tuile de la grille.
17. **`objectFit` par surface**, sur la valeur de la prop et jamais sur l'aspect — le
    tableau de la section « Le cadrage » a un cas par ligne, avec des `trackSid` distincts
    pour qu'une implémentation rendant la même valeur partout échoue.
18. **Le marqueur d'épinglage porte sa couleur explicite** :
    `expect(screen.getByTestId('pin-marker')).toHaveStyle({ color: tokens.color.textDark })`.
    C'est possible parce que c'est un glyphe rendu directement avec son `testID`, comme
    `menuCheck.tsx` — le précédent est `cameraMenu.spec.tsx`. **Idem pour le compteur de
    débordement.** Sans `PaperProvider` ancêtre, tout repli fait échouer l'égalité stricte ;
    c'est la cause qu'on garde, pas le symptôme.
19. **Le marqueur n'existe que quand `pinned` est vrai**, et son appui relaie la même clé
    que l'appui long.
20. **La tuile porte `accessibilityActions`** — la présence de la prop, pas son effet.

**`src/screens/room/call.spec.tsx`.**

21. **L'épinglage survit à l'ouverture et à la fermeture du panneau des participants.**
    C'est le test qui garde le choix d'emplacement de l'état ; il mord si quelqu'un
    redescend le `useState` dans `CallStage`.

**`src/i18n/index.spec.ts`** échoue déjà si l'une des quatre clés manque dans l'une des
sept locales. Rien à ajouter.

Chaque propriété ci-dessus doit être **éprouvée mordante par mutation** avant d'être
considérée acquise. Les mutations qui comptent : le critère d'aire remplacé par le nombre
de colonnes ; le plancher supprimé ; l'ordre des cellules passé au classement par la
parole ; la précédence `pin`/`screen` inversée ; `stripAxis` recalculé sur `width > height` ;
la couleur explicite du marqueur retirée.

## Ce qu'aucun test ne prouvera

**Qu'un pouce de hauteur suffit à reconnaître un visage.** `MIN_TILE_HEIGHT = 160` a un
sens physique — le dp vaut 1/160 de pouce — mais **rien ne mesure qu'un pouce soit assez**.
C'est la décision la plus fragile de ce document, et c'est celle qui fixe toutes les
capacités : 5 en portrait, 6 en paysage, 10 sur le pliable. Elle se falsifie sur appareil,
avec du vrai monde, et pas autrement. Le seul ancrage interne disponible est faible et il
faut le dire : les 96 dp de la bande actuelle (`stage.tsx:18`) sont le seul nombre du
dépôt pour « une vignette où l'on reconnaît encore quelqu'un », et 160 en fait 1,67 fois
plus.

**Que l'arrangement d'aire maximale soit celui qu'on a envie de regarder.** À trois
participants en paysage, la formule retient un `2 × 2` de tuiles de 337,0 × 189,5 —
**avec une cellule vide** — plutôt qu'une rangée propre de trois tuiles de 317,9 × 178,8 :
63 867 dp² contre 56 864, soit 12 % de plus par visage contre un trou visible en bas à
droite. L'aire lui donne raison ; l'œil pourrait ne pas être d'accord. Un test peut fixer
*quel* arrangement sort ; aucun ne peut dire qu'il est agréable.

**Qu'un appui long se découvre.** Le marqueur rend la sortie évidente ; rien ne rend
l'entrée évidente. Mesurable seulement en observant quelqu'un qui ne connaît pas
l'application.

**Que le contraste du marqueur et du compteur soit lisible.** RNTL ne rastérise rien
(`AGENTS.md`). Le test garde que la couleur explicite n'a pas été retirée, ce qui est une
propriété du code, pas de l'image.

**Que l'appui sur une tuile donne un retour visible.** Le marqueur est un `Pressable` de
React Native, pas un composant Paper : il n'y a donc pas de `rippleColor` à poser, et le
retour se joue sur `android_ripple` ou sur un style `pressed`. Aucun des deux ne se prouve
sous Jest — pour la même raison que celle écrite dans `AGENTS.md` à propos de Paper : le
préréglage fixe `Platform.OS` à `'ios'` et l'état pressé est transitoire. Ne pas fabriquer
un test pour cela ; le vérifier sur appareil, avec le reste.

**Qu'une action d'accessibilité personnalisée soit réellement offerte par TalkBack ou
VoiceOver** sous RN 0.86. Le test garde la prop ; le lecteur d'écran, lui, n'a pas été
consulté.

**Que la grille tienne le budget de décodage.** Elle borne le nombre de tuiles là où rien
ne le bornait, donc elle ne peut pas dégrader — mais « ne peut pas dégrader » n'est pas
« tient ». Avec `adaptiveStream: false` (fait 7), cinq tuiles restent cinq flux pleine
résolution. À vérifier sur appareil, thermique comprise.

## Ce que je n'ai pas pu établir

- **La densité de l'écran interne du Pixel 10 Pro Fold.** Les 2076 × 2152 px sont donnés ;
  la densité ne l'est pas. Les 843,7 × 822,9 dp de ce document la supposent égale à celle
  de la couverture (390) et sont marqués comme tels. Le **rapport** 0,965, lui, ne dépend
  d'aucune densité, et c'est lui qui porte l'argument contre `width > height`.
- **Les encoches réelles** rendues par `SafeAreaView` (`app/_layout.tsx:61`) sur l'un ou
  l'autre écran. Les 892 dp de hauteur de contenu sont une illustration explicitement
  arrondie ; l'implémentation n'en dépend pas, puisque la boîte est mesurée.
- **Le rapport d'image que publient réellement les participants** — navigateur de bureau
  et mobile confondus. `TILE_ASPECT = 16/9` est un gabarit choisi, pas un rapport constaté.
  `TrackPublication.dimensions` (fait 8) permettrait de le constater ; ce lot ne le lit pas,
  et si la mesure sur appareil montrait une majorité de sources portrait, **c'est cette
  constante qu'il faudrait revoir en premier**, pas la formule.
- **Le nombre de participants au-delà duquel un appareil réel décroche.** Aucun banc, aucune
  mesure.
