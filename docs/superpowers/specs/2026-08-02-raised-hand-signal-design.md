# Signaler une main levée — conception

**Date** : 2026-08-02
**État** : recommandations, **non validées par le partenaire**, non implémentées
**Périmètre** : rendre visible, sans ouvrir quoi que ce soit, qu'une **autre** personne
demande la parole.

Chaque décision de ce document est marquée **[À CONFIRMER]**. Aucune n'est acquise.

## Pourquoi

Relevé sur appareil aujourd'hui. Une personne lève la main depuis le client web ;
l'application **reçoit correctement l'événement** — elle l'affiche sous
`Plus → Mains levées → « 1. depuis le Mac »`. Mais elle ne l'affiche **que là**. Aucun
signal sur l'écran principal : pas de pastille sur `more-btn`, pas de bandeau, rien.

Mot du partenaire : « j'ai levé la main côté Mac et j'ai aucune notification, je ne le vois
pas dans l'application ».

`HandBanner` ne comble pas ce trou et n'a jamais prétendu le faire : il montre **votre
propre** main, et sa raison d'être écrite est de rendre visible une main levée **oubliée**
pour celui qui l'a levée (`handBanner.tsx:34-38`, §4.3 du périmètre C).

La fonction est donc livrée et inutilisable en pratique : celui qui lève la main demande la
parole, et celui qui préside ne voit rien tant qu'il n'ouvre pas une feuille qu'il n'a
aucune raison d'ouvrir. **Il ne manque pas un mécanisme, il manque un affichage.**

## Ce que le code dit aujourd'hui

Six faits relevés, qui cadrent tout ce qui suit.

**L'état est déjà là, complet et trié.** `raisedHands(roomView)` (`hands.ts:35-52`) rend la
file entière, **local inclus** (`[view.local, ...view.remotes]`), triée par `raisedAt` puis
par `identity` à égalité. Chaque entrée porte `isLocal`. `call.tsx:454` la calcule déjà, et
la passe déjà à `CallControlBar` puis à `MoreMenu`. **Aucune plomberie n'est à ajouter** :
il n'y a rien à souscrire, rien à interroger, rien à mémoriser.

**Une main levée est un ÉTAT, pas un événement.** Elle vit dans l'attribut participant
`handRaisedAt`, relu à chaque invalidation du store de vue. Un arrivant tardif la voit
immédiatement (§7.4 du périmètre C). Rien ne peut être « manqué » : il n'y a pas de passage
à rattraper, seulement une valeur présente ou absente.

**La pastille de non-lus existe et son emplacement est déjà arbitré.** `moreMenu.tsx:92-105`
la rend **conditionnellement**, jamais posée à `visible` faux — `Badge` retire `visible` de
ses props avant de les étaler (`Badge.tsx:59-60`), donc l'état ne serait joignable par
aucune assertion, et une pastille masquée par la seule opacité laisserait quand même son
« 0 » dans l'arbre d'accessibilité. Elle ne porte aucune couleur : Paper appaire lui-même
`error` et `onError`, et les deux schémas passent AA (`controlBar.ts:52-56`).

**Le périmètre C a déjà nommé le coût de cette pastille**, et il ne s'améliore pas en la
partageant : « Il ne dit pas « messages » mais « quelque chose dans le panneau ». Comme le
chat est le seul producteur de badge, la convention s'apprend en une réunion — mais c'est
une indirection » (§4.4).

**La bande de bandeaux existe, empile ses lignes, et porte déjà trois locataires.**
`WaitingBanner`, `RecordingIndicator`, `HandBanner`, dans cet ordre (`call.tsx:938-957`).
Aucun ne rend quoi que ce soit au repos.

**Le plein écran masque les trois, et c'est écrit et assumé.** « En plein écran : une tuile,
et rien d'autre » (`call.tsx:921-937`) — avec, dans le même commentaire, la conséquence
énoncée : « une demande d'admission devient INVISIBLE tant qu'on reste en plein écran ».
Deux locataires y échappent délibérément, le message de reconnexion et la `Snackbar`, sur un
critère écrit : ils **n'offrent aucune commande**, ils décrivent l'état du monde, et les
masquer rendrait l'écran incompréhensible plutôt que plus léger (`call.tsx:984-992`).

## Décisions recommandées

| # | Question | Recommandation | |
|---|---|---|---|
| 1 | Où vit le signal ? | **Un bandeau**, dans la bande existante, sous `HandBanner`. Pas une pastille. | **[À CONFIRMER]** |
| 2 | À quoi ressemble-t-il ? | Une ligne : **le nom du premier de la file**, et le nombre des autres à côté. La forme de `WaitingBanner`, le style de `HandBanner`. Aucun bouton. | **[À CONFIRMER]** |
| 3 | Que compte-t-il ? | Les mains levées **des autres**. Il apparaît quand la première se lève, disparaît quand la dernière se baisse. | **[À CONFIRMER]** |
| 4 | Votre propre main y compte-t-elle ? | **Non.** `HandBanner` la porte déjà, sur la ligne juste au-dessus. | **[À CONFIRMER]** |
| 5 | Une notion de « vu » ? | **Aucune.** Voir « Rien à marquer comme vu ». | **[À CONFIRMER]** |
| 6 | Son, vibration ? | **Ni l'un ni l'autre.** | **[À CONFIRMER]** |
| 7 | Plusieurs mains, l'ordre compte-t-il ? | **Oui.** Le bandeau nomme le **premier** ; la file ordonnée complète reste dans la feuille. | **[À CONFIRMER]** |
| 8 | En plein écran ? | **Masqué, comme les trois autres.** Le repli, si le partenaire refuse, est décrit et ne rouvre pas l'arbitrage. | **[À CONFIRMER]** |

## Ce qui transfère du chat, et ce qui ne transfère pas

Le chat a livré aujourd'hui exactement ce qui manque ici — un signal visible sans rien
ouvrir. C'est le précédent évident, et il faut dire où il s'arrête.

**Ce qui transfère, et qui est la vraie leçon** : *un signal doit exister hors de la feuille
qui le détaille*. Et la discipline de rendu qui va avec : **rendu conditionnellement, jamais
basculé par une prop que le composant consomme** (`Badge` mange `visible` ; un
`RaisedHandsBanner` qui prendrait `visible` referait la même erreur d'un cran plus haut).

**Ce qui ne transfère pas, en trois points.**

**a. Un non-lu est un compte de choses qu'on n'a pas lues ; une main levée est un état.**
Le chat a besoin de `readKeys` (`chatStore.ts:47`) parce qu'un message est un **événement**
qui laisse une trace : rien ne le porte après son passage, il faut donc mémoriser ce qui a
été vu. Une main levée est portée par l'attribut aussi longtemps qu'elle est levée. Il n'y a
rien à mémoriser, et **le nombre de mains levées est déjà la bonne valeur** — pas besoin de
lui soustraire quoi que ce soit.

**b. Un non-lu n'a pas de destinataire ; une main levée en a un.** « Trois messages » est du
contenu dans un tiroir. « Untel demande la parole » est une personne qui s'adresse à celui
qui préside, et dont la réponse attendue est *lui donner la parole maintenant*. Le dépôt a
déjà tranché cette forme d'événement — quelqu'un qui frappe à la porte — et il ne l'a pas
tranchée par une pastille : `WaitingBanner`, un nom, et le compte des autres à côté.

**c. Une pastille ne peut pas porter un nom, et c'est justement l'information utile.**
« 1. depuis le Mac » est ce dont le président a besoin pour donner la parole ; « 1 » ne
l'est pas. Et à la lecture d'écran, `Badge` rend un `Animated.Text` nu, **sans
`accessibilityLabel` ni rôle** (`Badge.tsx:103-124`, lu en source) : un lecteur d'écran
énonce un chiffre isolé à côté d'un bouton nommé « Plus ». Un bandeau est une phrase.

**Et la géométrie condamne la version paresseuse.** Deux producteurs sur la même ancre de
44 dp, pour deux pastilles de 20 dp de côté (`Badge.tsx:15`, `defaultSize = 20`) : elles se
touchent. Les fusionner en un seul nombre est pire — additionner des messages non lus et des
mains levées produit un « 3 » qui ne veut rien dire, et aggrave l'indirection que le
périmètre C avait déjà nommée comme un coût.

> **Le mécanisme du chat transfère. Sa forme, non.** C'est la conclusion, et c'est le seul
> endroit de ce document où il aurait été facile de se tromper en copiant.

## Le bandeau

Un composant neuf, `src/screens/room/raisedHandsBanner.tsx`, exportant
`RaisedHandsBanner` — le nom suit `raisedHands()`, le sélecteur qui l'alimente.

**Une prop, une seule** :

```
readonly hands: readonly RaisedHand[];   // les mains des AUTRES, déjà triées
```

Il rend `null` sur un tableau vide, comme les trois autres locataires de la bande. Il prend
`hands[0]` pour le nom et `hands.length - 1` pour le reste. Ce découpage est de la
présentation, pas de la sélection : l'ordre est déjà décidé par `raisedHands()`, il n'y a
pas de seconde règle à nommer. C'est la différence avec `WaitingBanner`, dont le
premier-arrivé est calculé par une fonction pure dédiée (`firstWaiting`) parce que l'ordre
de la salle d'attente, lui, est une règle de domaine.

**Le repli de nom est obligatoire et déjà conventionnel** : `hand.name.trim()` vide →
`t('call.unnamedParticipant')`. C'est ce que font `handControl.tsx:66`,
`waitingBanner.tsx:45-46`, `participantsPanel.tsx` et `stage.tsx` — jamais une identité
brute, jamais un vide, les deux se lisant comme une panne d'affichage.

**Le style vient de `HandBanner`, pas de `WaitingBanner`, et la nuance est celle des
contrastes.** `WaitingBanner` pose son propre fond (`surfaceDark`, `waitingBanner.tsx:13`) ;
`HandBanner` et `RecordingIndicator` n'en posent aucun et héritent du `backgroundDark` que
`call.tsx` force sur `styles.root` dans les deux schémas. Le nouveau bandeau suit ces deux
derniers : **il est une ligne de la bande, pas une carte**.

D'où l'obligation habituelle, et elle n'est pas une précaution :

- chaque `Text` porte `color: tokens.color.textDark`. Sur `backgroundDark`, **16,65:1** — le
  chiffre que portent déjà `handBanner.tsx:25` et `recordingIndicator.tsx:18`, pour
  exactement cette paire. Sans cette couleur, Paper retombe sur `theme.colors.onSurface`,
  que `theme.ts:17` fixe à `textLight` en schéma **clair** — le défaut de la plupart des
  appareils : **1,08:1**, du noir sur du noir ;
- **aucun `Button`, aucun `IconButton`, donc aucune question de `rippleColor` ni de
  `disabled`.** C'est délibéré, et pas seulement par économie : voir « Le plein écran ».

**Une seule rangée, jamais deux.** `flexDirection: 'row'` et `gap: tokens.spacing.sm`, comme
`HandBanner`. Le compte des autres se pose **à côté** du nom, pas en dessous : la hauteur du
bandeau devient indépendante du nombre de mains levées.

L'arithmétique de la bande, et **la limite de ce qu'elle permet de calculer** :

| Ligne | Hauteur |
|---|---|
| `RecordingIndicator` | 16 dp de rembourrage **+ une ligne de texte** |
| `HandBanner` (son bouton domine) | 16 + 40 = **56 dp**, exactement |
| `RaisedHandsBanner` (sans bouton, une rangée) | 16 dp de rembourrage **+ une ligne de texte** |

Le 16 est `paddingVertical: tokens.spacing.sm` de part et d'autre, posé par les trois. Le 40
de `HandBanner` est dérivable et vérifié en source : `md3Label` porte `marginVertical: 10`
et `labelLarge` une `lineHeight` de 20 (`v3/tokens.tsx:173-177`), et Paper ne pose aucune
`minHeight` sur un `Button` en MD3.

**La hauteur d'une ligne de texte, elle, n'est PAS dérivable de la feuille de style**, et
c'est à dire plutôt qu'à arrondir : ces bandeaux rendent un `Text` **sans `variant`**, qui
retombe sur `theme.fonts.default` — lequel n'est qu'un `regularType`, **sans `fontSize` ni
`lineHeight`** (`v3/tokens.tsx:216-218`). La hauteur est donc celle que la plateforme
compose pour la taille par défaut de React Native, et elle suit le `fontScale` de l'appareil.
Vingt dp est un ordre de grandeur raisonnable à échelle 1, pas une mesure.

À cette ligne nominale de 20 dp, le pire cas réaliste — enregistrement en cours, votre main
levée, celle d'un autre aussi — vaut **≈ 128 dp** : 13 % de l'écran de couverture mesuré du
Pixel 10 Pro Fold (443 × 969,8 dp, relevé au §« Correction mesurée » de la conception de la
grille), 20 % d'un téléphone de 360 × 640 dp. C'est le coût, il est nommé — et il grossit
avec le `fontScale`, ce qu'aucun de ces chiffres ne capture.

**Placement : après `HandBanner`, en dernier.** Pas avant, et la raison est mécanique : le
bandeau apparaît et disparaît sous le pouce, et placé au-dessus il **déplacerait
`hand-lower`** — le bouton que le périmètre C a explicitement conçu pour être atteignable en
un seul appui au moment où le modérateur vous donne la parole. Placé en dessous, il ne
bouge rien.

**Le seul changement possible dans `src/call/hands.ts`**, si l'on veut garder la coquille
bête :

```
export function otherRaisedHands(hands: readonly RaisedHand[]): readonly RaisedHand[]
```

Une ligne, pure, éprouvable sans rendu. `isLocal` est déjà sur `RaisedHand`, il n'y a rien
d'autre à ajouter. **[À CONFIRMER]** — un `filter` dans le `useMemo` de `call.tsx:454`
ferait aussi l'affaire ; l'export nommé suit l'habitude du dépôt (sélection dans un module
pur, coquille aussi bête que possible) et rien d'autre.

Total, côté `call.tsx` : **une ligne**, dans la branche `fullscreenTile === null` déjà
existante.

## Rien à marquer comme « vu ». Et surtout, ne pas l'inventer.

C'est le piège de ce lot, parce que le précédent du chat en contient un exemplaire complet
et fonctionnel.

Le bandeau est vrai tant qu'une main est levée, faux dès qu'elles sont toutes baissées.
**Pas de `markSeen`, pas d'ensemble de mains « acquittées », pas de bouton « fermer ».** Un
tel mécanisme n'ajouterait aucune information — il permettrait seulement de faire
**disparaître un état encore vrai**, c'est-à-dire de masquer une demande de parole toujours
en attente. C'est l'inverse de ce que le lot cherche à corriger.

Le corollaire est vrai aussi et doit être dit : **une main levée puis baissée pendant que
vous regardiez ailleurs ne laisse aucune trace.** Ce n'est pas un défaut de ce dessin, c'est
une propriété de la signalisation par état — et aucun dessin fondé sur `handRaisedAt` ne
peut faire autrement, puisque le contrat backend ne conserve pas d'historique
(`hands.ts:18-20` : chaîne vide = baissée, absence de clé = jamais levée ; les deux se
lisent `null`, indiscernables).

## Le plein écran

**Recommandation : masqué, exactement comme les trois autres.** Le bandeau vit dans la
branche `fullscreenTile === null` déjà écrite, et rien d'autre n'est à décider.
**[À CONFIRMER]**

Quatre raisons, dans l'ordre de force :

1. **Le dépôt a déjà accepté le cas strictement plus grave.** `WaitingBanner` — quelqu'un
   est enfermé **dehors**, hors de la réunion — est invisible en plein écran, et c'est écrit
   noir sur blanc comme une « conséquence énoncée et acceptée » (`call.tsx:933-937`). Une
   demande de parole demande moins que ça. Faire une exception pour la main tout en laissant
   la porte masquée serait incohérent.
2. **On sort du plein écran par un appui n'importe où sur la tuile**, immédiatement
   (`stage.tsx:494`, `onTilePress={onExitFullscreen}`). Ce n'est pas un état où l'on reste
   coincé ; c'est un état d'où l'on tombe au premier contact.
3. **Le plein écran n'a de gain mesuré qu'en paysage** : +28 % d'aire en paysage, **0 % en
   portrait** (conception de la grille, 2026-08-01). C'est un geste ponctuel de paysage, pas
   une position de repos.
4. **Rien n'est perdu.** L'état est relu à chaque rendu depuis `roomView` ; le bandeau est là
   au premier appui qui sort du plein écran, sans rattrapage ni rejeu.

### Si le partenaire refuse : le repli, qui ne rouvre pas l'arbitrage

Il n'est pas nécessaire de toucher à la règle « une tuile et rien d'autre ». **Elle a déjà
une exception écrite, et il suffit d'y entrer.** `call.tsx:984-992` énonce le critère : ce
qui survit au plein écran est ce qui **n'offre aucune commande** et décrit l'état du monde.
Un bandeau de mains levées **sans aucun bouton** — c'est exactement ce que la section
précédente prescrit, et c'est la seconde raison de le prescrire — satisfait ce critère à la
lettre. Le déplacer hors de la garde est alors une application de l'arbitrage, pas une
dérogation.

> **Une honnêteté due avant d'en décider** : ce critère, tel qu'il est écrit, n'est **pas**
> appliqué uniformément. `RecordingIndicator` n'offre aucune commande non plus, et il est
> masqué. La lecture qui rend le code cohérent est plus étroite que la lettre : survit ce
> dont l'absence rendrait l'écran **trompeur** — une image figée sans explication se lit
> comme un plantage. Une main levée non signalée est un signal **manqué**, pas une image
> **mensongère**. C'est cette distinction, et pas le critère littéral, qui fait pencher la
> recommandation vers « masqué ».

## Ni son ni vibration

**Recommandation : aucun des deux. [À CONFIRMER]**

- **Le périmètre C l'a déjà tranché** (§5.C7), et son motif tient toujours : le son du client
  web est conditionné à `room.numParticipants < config.max_participants_for_sound`, un champ
  de configuration que `src/instance/types.ts` ne lit pas. Émettre un son sans lire ce champ,
  c'est diverger du web sur une décision que le web a prise exprès.
- **Le dépôt n'a aucun mécanisme de notification, et pas seulement pas celui-là** : relevé
  dans `package.json`, ni `expo-haptics`, ni `expo-av`/`expo-audio`, ni `expo-notifications`.
  Ce n'est pas une ligne à ajouter, c'est un sous-système — un actif sonore, son chargement,
  et une décision de cycle de vie.
- **Il n'y a aucun écran de réglages où le couper.** Une réunion est précisément le lieu où
  un son inattendu est malvenu, et un son qu'on ne peut pas éteindre est pire que pas de son.

**Le candidat le moins mauvais, si le bandeau se révèle insuffisant sur une vraie réunion**,
est la **vibration** — silencieuse, `expo-haptics` est une dépendance d'une ligne, et
`Haptics.notificationAsync` existe. Elle reste refusée ici pour la troisième raison
ci-dessus : rien ne permettrait de la couper. À rouvrir avec un écran de réglages, jamais
avant.

## Plusieurs mains, et l'ordre

**L'ordre compte, et il est déjà juste.** `raisedHands()` trie par `raisedAt` — l'horodatage
est posé par le serveur *précisément pour que cet ordre existe* (§3.2 du périmètre C) — puis
par `identity` à égalité, ce qui rend le départage déterministe.

Le bandeau nomme **le premier**, parce que c'est celui à qui donner la parole. Le compte des
autres dit qu'il y en a d'autres. **La file ordonnée complète reste où elle est**, dans la
feuille `Plus` (`handControl.tsx:57-69`), avec ses positions numérotées — §5.C16 l'a
décidé, et rien ici ne le change.

Une pile de bandeaux, un par main levée, est refusée pour la raison déjà écrite dans
`waitingBanner.tsx:29-32` : elle mangerait la vidéo, qui est la raison d'être de l'écran.

## Hors périmètre, explicitement

- **Un marqueur de main levée sur la tuile vidéo de la personne.** C'est le dessin qui
  répondrait le mieux à « qui ? », et le seul qui survivrait au plein écran (pour la personne
  affichée). `stage.tsx` a déjà le précédent d'un marqueur posé sur une tuile
  (`pinBadge`). Mais il faut le poser sur quatre surfaces — grille, bande, scène, plein
  écran — et il ne dit toujours rien d'une main levée hors capacité d'affichage. **La suite
  naturelle, pas ce lot.**
- **Un marqueur dans le panneau des participants.** `ParticipantRow` reçoit déjà un
  `ParticipantView` complet, donc `handRaisedAt` est là pour rien de plus. Mais c'est encore
  un panneau à ouvrir : cela ne répond pas au problème de ce document. §5.C16 interdit par
  ailleurs d'y **réordonner** ; un marqueur sans tri ne l'enfreindrait pas, mais c'est à
  décider ailleurs.
- **Baisser la main de quelqu'un d'autre** (§5.C15, inchangé).
- **Toute notification hors premier plan.** Il faudrait du push et un backend meet qui sache
  en émettre ; aucun endpoint d'abonnement n'existe. Conclusion identique aux périmètres B et
  C.
- **Toute persistance entre deux séances.**

## Ce qu'il faudra garder

Pas de plan de tests ici — c'est le document suivant. Trois propriétés, seulement, qui
doivent être **prouvées mordantes par mutation** et dont l'absence rendrait le lot vert par
accident :

1. **Le bandeau ne compte pas votre propre main.** La fixture doit contenir une main locale
   **et** une main distante ; sans les deux, une implémentation qui ne filtre rien passe.
2. **Il nomme le premier de la file, pas le premier du tableau.** La fixture doit poser les
   `raisedAt` dans l'ordre **inverse** de l'ordre d'insertion.
3. **La couleur explicite n'a pas été retirée** :
   `expect(screen.getByTestId(…)).toHaveStyle({ color: tokens.color.textDark })`. Aucun test
   ne peut prouver qu'un texte est lisible — RNTL ne rastérise rien — mais celui-là prouve
   que la cause n'a pas été enlevée. Précédents : `handBanner.spec.tsx`,
   `waitingBanner.spec.tsx`, `recordingIndicator.spec.tsx`.

Et la garde du plein écran, dans `call.spec.tsx`, à côté de celle qui existe déjà pour
`waiting-banner` — **quel que soit le sens tranché à la décision 8**, puisque c'est
justement la ligne qui rougirait si quelqu'un déplaçait le bandeau sans le vouloir.

## Les clés, et les sept traductions

Deux clés. Le namespace `call.` porte déjà toutes les clés de main levée.

**Aucun suffixe de pluriel i18next** (`_one`, `_other`, …). `src/i18n/index.spec.ts:17-22`
exige une **égalité exacte des ensembles de clés** entre les sept locales ; le russe a quatre
catégories de pluriel là où l'anglais en a deux, donc tout suffixe casse ce test. La
convention du dépôt est une forme unique par clé, formulée pour rester correcte à 1 comme
à N — `waiting.others` en français dit déjà « {{count}} autre(s) en attente ». Les
formulations ci-dessous suivent cette contrainte, et **elles sont d'abord justes à 1**, qui
est le cas courant.

### `call.handRaisedBy` — le nom du premier

| | |
|---|---|
| en | `{{name}} raised their hand` |
| fr | `{{name}} a levé la main` |
| es | `{{name}} ha levantado la mano` |
| it | `{{name}} ha alzato la mano` |
| de | `{{name}} hat die Hand gehoben` |
| vi | `{{name}} đã giơ tay` |
| ru | `{{name}} поднял(а) руку` |

Le russe accorde le passé au genre, que rien dans `RaisedHand` ne porte : la forme
parenthétique est le même compromis que le `autre(s)` français déjà en place.

### `call.handRaisedOthers` — le compte des autres, rendu seulement si ≥ 1

| | |
|---|---|
| en | `{{count}} more waiting to speak` |
| fr | `{{count}} autre(s) en attente de parole` |
| es | `{{count}} más esperando para hablar` |
| it | `{{count}} in attesa di parlare` |
| de | `noch {{count}} möchte(n) sprechen` |
| vi | `còn {{count}} người muốn phát biểu` |
| ru | `ещё желающих выступить: {{count}}` |

L'italien et le russe évitent l'accord plutôt que de le parenthéser — « altri 1 » et « ещё 1
хотят » sont faux à 1, et la tournure par liste à deux-points est idiomatique en russe.

**[À CONFIRMER]** — la formulation « a levé la main » décrit le geste, et reste cohérente
avec `call.handQueue` (« Mains levées ») déjà à l'écran. Une formulation d'intention —
« demande la parole » — dirait mieux ce qu'il faut faire, au prix d'une divergence de
vocabulaire avec la feuille. Deux mots, une décision de produit.

## Ce qu'aucun test ne prouvera

1. **Qu'un bandeau de 36 dp au-dessus de la vidéo se remarque réellement** pendant qu'on
   regarde quelqu'un parler. C'est toute la question du lot, et elle ne se tranche que sur
   appareil, en réunion, avec quelqu'un qui lève la main sans prévenir.
2. **Que 128 dp de bande empilée reste supportable** dans le pire cas (enregistrement + votre
   main + celle d'un autre). L'arithmétique est calculée depuis la feuille de style de Paper,
   pas mesurée.
3. **Qu'un nom long ne pousse pas le compte hors de l'écran.** La rangée n'a pas de
   troncature prescrite ici — `participantsPanel.tsx` a payé exactement ce défaut, mesuré à
   39 px de nom restant, et sa leçon est dans son en-tête. À vérifier en allemand, la locale
   la plus longue du lot.
4. **Que masquer le bandeau en plein écran ne se paie pas** en pratique : quelqu'un lève la
   main pendant qu'on regarde une diapositive en plein écran, et personne ne le sait. C'est
   la conséquence acceptée de la décision 8, et c'est le premier endroit où elle se
   constatera.
