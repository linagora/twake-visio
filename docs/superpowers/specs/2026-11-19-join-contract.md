# Adapter l'app au contrat `join/` de Meet

**Date : 2026-11-19.** Spécification publiée dans l'issue #20. **Texte final, corrigé le
2026-11-20 contre le code livré** sur `feat/join-contract` à `1826352`, et contre les essais
sur appareil de #27 et #28. Chaque correction est posée là où elle porte, et commence par
« Livré : ». Ce fichier remplace l'issue comme seule copie vivante.

## Problème

Constaté le 2026-11-19, sur `main` à `1b55262`. Depuis que meet.linagora.com sert le
nouveau contrat de Meet, l'application n'entre plus dans aucune réunion de production, ni
en invité ni avec un compte.

Un invité qui ouvre un salon public est envoyé en salle d'attente avant même d'avoir saisi
son nom. L'écran affiche ensuite « Connexion impossible ». Le serveur, lui, a refusé une
demande d'entrée sans nom.

Sur un salon non public, une personne en attente ne peut jamais être admise. À chaque
sondage, l'app se présente comme une nouvelle personne, puisqu'elle ne renvoie pas
l'identifiant que le serveur lui a donné. Le modérateur admet donc quelqu'un que l'app a
déjà abandonné.

En séance, lever la main et couper le son d'un participant échouent : l'app présente le
jeton de salle sous un schéma que le serveur ignore.

L'instance de développement servait encore l'ancien contrat, si bien que l'app y
fonctionnait et que rien ne signalait la panne. Elle sert le nouveau depuis sa
reconstruction en v1.39, le 2026-11-20 (#26).

## Solution

La personne ouvre un salon et arrive au pré-join. Elle y voit le nom du salon, sa caméra et
son micro, et, en invité, un champ pour son nom. Elle appuie sur « Rejoindre ». L'app
demande alors l'entrée au serveur, avec le nom saisi.

- Si le serveur la laisse entrer, elle arrive en séance avec la caméra et le micro choisis.
- Sinon, elle attend en salle d'attente. Elle garde sa place dans la file, y compris après
  un passage en arrière-plan, jusqu'à ce qu'on l'admette ou qu'on la refuse.

En séance, lever la main et couper le son fonctionnent de nouveau. Une personne connectée
suit le même parcours, et le serveur dit à l'app si elle peut modérer.

Les échecs ont chacun leur message : réunion introuvable, réunion supprimée, ou serveur trop
ancien pour l'application. Le README dit quel serveur Meet l'application exige.

## Récits utilisateur

1. En tant qu'invité, je veux saisir mon nom avant que l'app ne demande à entrer, afin que
   la salle d'attente et les autres participants voient mon vrai nom.
2. En tant qu'invité, je veux entrer directement dans un salon public dès que j'appuie sur
   « Rejoindre », afin de ne pas attendre une admission inutile.
3. En tant qu'invité, je veux que mon nom soit débarrassé des espaces de début et de fin,
   afin de ne pas apparaître sous un nom mal formé.
4. En tant qu'invité, je veux que le champ du nom s'arrête à 50 caractères, comme sur le
   web, afin que mon nom tienne sur l'écran des autres.
5. En tant qu'invité, je veux que « Rejoindre » n'apparaisse qu'une fois un nom saisi, afin
   de ne pas envoyer une demande que le serveur refuserait.
6. En tant qu'invité, je veux retrouver mon nom pré-rempli à ma prochaine réunion, afin de
   ne pas le ressaisir.
7. En tant qu'invité sur la production, je veux entrer dans un salon public sans attendre
   aucun changement côté serveur, afin d'utiliser l'app dès cette version.
8. En tant que personne connectée, je veux entrer sous le nom de mon compte sans le saisir,
   afin de ne pas me présenter sous un autre nom.
9. En tant que personne connectée sur un salon `trusted`, je veux entrer directement, afin
   que la réunion puisse commencer sans son créateur.
10. En tant que membre d'un salon `restricted`, je veux entrer directement, afin de ne pas
    attendre qu'on m'admette dans un salon où j'ai un rôle.
11. En tant que personne connectée sans rôle sur un salon `restricted`, je veux passer par
    la salle d'attente, afin qu'un membre puisse m'admettre.
12. En tant que propriétaire ou admin d'un salon, je veux que l'app reconnaisse mon droit de
    modérer dès l'entrée, afin de trouver les commandes de modération. Livré : la spec
    disait « de modération et d'enregistrement ». L'app n'offre plus de commande
    d'enregistrement depuis `884749e` (2026-08-03), antérieur à ce lot ; seul reste
    l'indicateur d'un enregistrement en cours.
13. En tant que personne admise par la salle d'attente, je veux ne pas me voir offrir de
    commandes de modération, afin de ne pas tenter des actions que le serveur refusera.
14. En tant que participant, je veux que la caméra et le micro choisis au pré-join soient
    respectés à l'entrée en séance, afin de ne pas être vu ni entendu contre mon gré.
15. En tant que personne admise après une attente, je veux que mes choix de caméra et de
    micro du pré-join soient encore respectés, afin que l'attente ne les efface pas.
16. En tant que participant arrivé en séance sans passer par le pré-join, je veux que mes
    Réglages décident de la caméra et du micro, afin qu'ils ne s'allument jamais par défaut.
17. En tant que personne qui ouvre directement l'écran de séance par un lien, je veux être
    ramenée au pré-join, afin de choisir caméra et micro et de demander l'entrée.
18. En tant que personne en salle d'attente, je veux garder ma place dans la file d'un
    sondage à l'autre, afin d'être admise plutôt que remplacée par un double.
19. En tant que personne en salle d'attente, je veux entrer environ trois secondes après la
    décision du modérateur, afin de ne pas faire attendre la réunion.
20. En tant que personne en salle d'attente qui revient de l'arrière-plan, je veux que l'app
    redemande sa place aussitôt, afin de rester dans la file sans rien faire.
21. En tant que personne en salle d'attente, je veux comprendre que ma demande a été
    refusée, et que l'app cesse alors de demander, afin de ne pas attendre en vain.
22. En tant que personne en salle d'attente dont l'identifiant de file est rejeté par le
    serveur, je veux que l'app reprenne la demande sans lui, afin de rester en file sans
    message d'erreur.
23. En tant que personne en salle d'attente, je veux pouvoir attendre plus de dix minutes,
    afin d'attendre un modérateur en retard.
24. En tant que personne en salle d'attente, je veux continuer de pouvoir partager ou copier
    le lien du salon, afin de prévenir quelqu'un qui peut m'admettre.
25. En tant que personne admise, je veux entrer en séance avec le jeton reçu à l'admission,
    sans nouvelle demande, afin de ne pas être renvoyée en salle d'attente.
26. En tant que participant, je veux lever la main et que tous la voient, web compris, afin
    de demander la parole.
27. En tant que personne admise par la salle d'attente, je veux pouvoir lever la main, afin
    d'avoir les mêmes moyens que les autres participants.
28. En tant que personne qui modère, je veux couper le micro d'un participant dans un salon
    qui l'autorise, afin de faire taire un bruit de fond.
29. En tant que personne qui modère, je veux continuer d'admettre ou de refuser depuis l'app
    les personnes en attente, afin de gérer l'accès sans passer par le web.
30. En tant que visiteur, je veux voir le nom du salon au pré-join avant de demander à
    entrer, afin de savoir où j'entre.
31. En tant que visiteur qui suit un lien vers un salon inexistant, je veux le message
    « réunion introuvable », afin de vérifier le lien.
32. En tant que visiteur d'un salon supprimé, je veux un message qui le dit, afin de ne pas
    chercher une erreur dans le lien. Livré au pré-join ; pas dans la salle d'attente, voir
    #32.
33. En tant que visiteur d'un serveur Meet qui n'offre pas `join/`, je veux un message qui
    dit que ce serveur est trop ancien pour l'application, afin de ne pas croire que la
    réunion n'existe pas.
34. En tant que visiteur sans réseau, je veux le message réseau habituel, afin de savoir
    qu'il suffit de réessayer.
35. En tant que visiteur, je veux qu'un double appui sur « Rejoindre » ne lance qu'une
    demande, afin de n'ouvrir qu'une séance.
36. En tant que visiteur, je veux les nouveaux messages dans chacune des sept langues de
    l'application, afin de les comprendre où que je sois.
37. En tant qu'exploitant d'un serveur Meet, je veux lire dans le README quel serveur
    l'application exige, afin de savoir si le mien convient avant que des personnes ne
    butent dessus.
38. En tant que développeur, je veux qu'aucun code ne lise plus l'ancien contrat, afin qu'un
    serveur ancien échoue clairement plutôt qu'à moitié.
39. En tant que développeur, je veux qu'aucun commentaire ne décrive plus l'ancien contrat,
    afin de ne pas reconstruire un comportement abrogé en le croyant en vigueur.
40. En tant que personne qui valide le lot, je veux une série d'essais sur appareil, contre
    la production en invité et contre dev avec un compte, afin que la fusion repose sur une
    mesure et pas sur une lecture.

## Décisions d'implémentation

### Contrat serveur visé

Lu dans le fork `linto-ai/meet`, tag `v1.39` (commit `18e8b2a7`, tête de la branche
`linto`). Les points mesurés sur meet.linagora.com le 2026-11-19 sont marqués comme tels.

- **Lecture d'un salon** : `GET /api/v1.0/rooms/<slug>/` rend 200 et le salon, **sans bloc
  `livekit`**, même sur un salon public (mesuré). Elle ne sert plus qu'à l'existence et au
  nom.
- **Entrée** : `POST /api/v1.0/rooms/<uuid|slug>/join/`, avec un `username` facultatif (vide
  ou nul accepté, 255 caractères au plus).
  - Rend 200 avec `livekit { url, room, token }` quand l'appelant peut contourner la salle
    d'attente : salon public ; `trusted` avec un compte ; `restricted` avec un compte qui a
    un rôle.
  - Rend 200 sans `livekit` dans les autres cas, jamais 401 ni 403.
  - `accesses` n'est présent que pour l'admin ou le propriétaire, et `is_administrable`
    n'existe plus.
  - Un salon inconnu rend 404 en JSON, un salon supprimé rend 410.
  - Chaque appel produit un nouveau jeton : un anonyme reçoit une nouvelle identité à chaque
    fois.
  - La route existe en production (un `GET` y rend 405, mesuré). Dev ne l'avait pas en
    v1.24.0 (404 HTML, mesuré). Livré : reconstruit en v1.39 le 2026-11-20 (#26), dev la
    sert, et les essais 7 à 9 y sont entrés par elle.
- **Salle d'attente** : `POST /api/v1.0/rooms/<slug>/request-entry/`, avec `username`
  obligatoire et non vide (un nom vide rend 400, mesuré) et un `participant_id` facultatif.
  - La réponse contient `status`, `username`, `id` (identifiant **signé**), `color`,
    `entered_at`, et `livekit` ou `null`.
  - Un identifiant inconnu ou expiré crée **sans erreur** une nouvelle personne en attente.
    Une signature invalide rend 400 « Invalid participant credential. ».
  - Une personne en attente est oubliée 6 s après sa dernière demande ; un refus reste
    lisible 5 s, une admission 6 h. Limite : 150 demandes par minute.
- **Modération de la file** : `waiting-participants/` rend des UUID bruts, et `enter`
  attend un UUID brut. Le contrat est inchangé, et la fonction qui admet ou refuse depuis
  l'app reste telle quelle.
- **Jeton de salle** : il se présente en `Authorization: X-LiveKit-Token <jeton>`. C'est un
  schéma de l'en-tête `Authorization`, pas un en-tête nommé `X-LiveKit-Token`. Un `Bearer`
  est ignoré. C'est le seul schéma accepté par `toggle-hand`, et le premier essayé par
  `mute-participant`. Le démarrage et l'arrêt de l'enregistrement l'acceptent aussi, après
  la session.
- **Retrait de participant** : par l'authentification par défaut, donc par le jeton OIDC là
  où le serveur l'accepte. Rien à changer, et l'essai 7 l'a confirmé.
- **Rôles** : la spec disait « rien à changer ». Livré : rien n'a changé, mais l'affirmation
  était fausse. L'app envoie `{participant_identity, role}` à `update-participant/`, qui
  rend 400 en v1.39 faute de l'un des champs qu'il attend (métadonnées, attributs,
  permission ou nom). La v1.39 change les rôles par une route dédiée,
  `update-participant-role/`, et refuse de promouvoir un invité anonyme. Constaté à
  l'essai 7, suivi hors lot dans #34.
- **Enregistrement** : l'app n'en a plus de commande depuis `884749e` (2026-08-03). Rien à
  changer.

### Couche API des salons

- **Nouvelle fonction `joinRoom(visitor, slug, name)`.** Elle passe par le branchement
  compte/invité déjà en place.
  - En invité, le corps porte le nom saisi, rogné. Avec un compte, il ne porte pas de nom :
    le serveur le tire du compte.
  - Elle rend l'une de deux issues **normales** : « admis », avec l'accès à la séance, ou
    « salle d'attente ».
  - L'accès « admis » porte le salon tiré de la réponse, l'adresse et le jeton LiveKit, et
    le droit de modérer, qui vaut **la présence de `accesses`**.
- **Passer par la salle d'attente n'est plus une erreur.** Le genre d'erreur `lobby`
  disparaît de l'union des erreurs d'API, puisque plus rien ne le produit.
- **La lecture d'un salon au montage du pré-join** ne lit plus le bloc `livekit` et
  n'envoie plus `?username=`. La fonction qui obtenait l'accès par cette lecture est
  supprimée.
- **`requestEntry(visitor, slug, username, participantId)`** envoie `participant_id` quand
  l'écran en a un. Elle rend l'identifiant signé de la réponse comme nouvel identifiant,
  avec le statut et le jeton éventuel.
- **Nouveaux genres d'erreur**, posés dans le lecteur de réponses partagé, donc valables
  pour tous les appels qui passent par lui :
  - `gone` pour un 410 ;
  - `missing-route` pour un 404 dont la réponse n'est pas du JSON : la route n'existe pas
    sur ce serveur.

  Un 404 en JSON reste `not-found`. Chaque écran qui traduit les erreurs gère les nouveaux
  genres ; seul le parcours d'entrée leur donne un message propre.

  Livré : seul le pré-join leur donne un message propre. La salle d'attente les range sous
  « Connexion impossible », et la création de salon sous « La réunion n'a pas pu être
  créée ». Une fois la personne en file, la salle d'attente ignore même le 404 et le 410, et
  redemande sans fin : #32.

  Livré : la main levée ne passe pas par ce lecteur. Elle a sa propre lecture des réponses,
  que le lot n'a pas touchée : un 404 y reste `not-found` et un 410 y devient une erreur
  serveur. Sans effet visible, puisque la séance n'affiche qu'un message pour tout échec de
  main levée.
- **Jeton de salle** : la requête générique qui porte le jeton de salle (coupure du son) et
  la requête de main levée envoient `X-LiveKit-Token`, sans repli vers `Bearer`.

### Pré-join

- Au montage, l'écran lit le salon pour vérifier qu'il existe et afficher son nom. Il ne
  redirige plus vers la salle d'attente au montage.
- « Rejoindre » enchaîne :
  1. en invité, mémorisation du nom ; avec un compte, mémorisation de la visite ;
  2. appel de `joinRoom` ;
  3. si la personne est admise, accès mis de côté puis navigation vers la séance avec les
     paramètres caméra et micro ;
  4. sinon, navigation vers la salle d'attente avec ces mêmes paramètres ;
  5. en cas d'erreur, message sur place.

  Livré : la spec faisait de la mémorisation de la visite une étape à part, valable pour
  tous. Un invité n'a pas d'historique : rien ne l'authentifie d'une visite à l'autre, donc
  aucun compte ne pourrait relire la ligne. C'était déjà le cas avant le lot, qui l'a gardé.
- Un appui répété pendant la requête n'en lance pas une seconde.
- Le champ du nom de l'invité est limité à 50 caractères.
- Erreurs : 404 JSON donne le message « introuvable » existant, 410 un nouveau message
  « réunion supprimée », « route absente » un nouveau message « serveur trop ancien pour
  l'application ». Le réseau et les erreurs 5xx gardent leurs messages existants.

### Salle d'attente

- L'écran reçoit les paramètres caméra et micro, et les transmet à la séance.
- La première demande part au montage, puis toutes les **3 s** (au lieu de 5).
- L'identifiant signé est gardé en mémoire, écrasé par celui de chaque réponse, et renvoyé
  à la demande suivante. Rien n'est persisté.
- Au retour au premier plan (`AppState` qui passe à `active`), une demande part tout de
  suite. Si le serveur avait oublié la personne, il la remet en file sans le dire. On
  l'accepte, et aucun avis n'est affiché.
- **Une seule demande à la fois.** Livré, absent de la spec : une demande que l'horloge ou
  un retour au premier plan déclencherait pendant qu'une autre est en vol ne part pas. Deux
  demandes parties avant le premier identifiant inscriraient la personne deux fois, et
  préviendraient deux fois les modérateurs. Un retour au premier plan pendant une demande en
  vol attend donc la réponse de celle-ci. L'essai 4 est passé avec cette garde.
- Sur un refus : l'écran cesse de demander et affiche le message de refus.
- Sur un 400 alors qu'un identifiant a été envoyé : l'identifiant est abandonné, et la
  demande suivante part sans lui. Un 400 sans identifiant est une erreur affichée.
- **Les autres erreurs.** Livré, absent de la spec : un 403 met l'écran dans l'état « sans
  modérateur », et il continue de demander. Avant la mise en file, un 401 ou un 400 sans
  identifiant arrête l'écran sur son propre message, et toute autre erreur sur « Connexion
  impossible » (#32 pour le 404 et le 410, #33 pour les 5xx et le 429). Une fois en file,
  seuls ces deux-là l'arrêtent ; le reste est redemandé au tour suivant.
- Aucune limite de durée d'attente.
- Nom envoyé : en invité, le nom saisi, rogné ; avec un compte, le nom d'affichage du
  compte, et `anonymous` s'il est vide, comme le web.
- Sur une admission : l'accès est mis de côté avec le jeton reçu, le droit de modérer à
  faux, dans la forme qu'il a aujourd'hui, puis l'écran navigue vers la séance avec les
  paramètres.

### Séance

- L'écran consomme l'accès mis de côté. S'il n'y en a pas, il remplace la route par le
  pré-join du même salon. Il ne demande jamais l'accès lui-même.
- Caméra et micro : un paramètre présent décide. S'il manque, ce sont les Réglages (micro
  coupé à l'entrée, caméra coupée à l'entrée), jamais « allumé » par défaut.
- Le droit de modérer reste lu dans l'accès, désormais alimenté par `accesses`.

### Le reste

- Le magasin d'accès mis de côté garde son interface : mettre de côté, prendre une fois,
  vider.
- Deux nouvelles clés de traduction, « réunion supprimée » et « serveur trop ancien pour
  l'application », dans les sept langues.
- Une section « Serveur requis » dans le README. Elle exige `POST /rooms/<id>/join/` et le
  schéma `X-LiveKit-Token`, soit le fork LinTO à partir de v1.27. L'amont publie le schéma
  `X-LiveKit-Token` depuis sa v1.35.0, mais `join/` dans aucune version au 2026-11-20.
- Tout commentaire qui décrit l'ancien contrat est réécrit : bloc `livekit` rendu par la
  lecture, `should_access_room`, `?username=`, la fonction d'accès supprimée. La recherche
  se fait sur les formulations, dans tout le code source et les specs, pas seulement dans
  les fichiers modifiés.

  Livré : la recherche a couvert le code et les tests. Un commentaire de la couche des
  participants raisonne encore sur `is_administrable`, et les documents de conception de
  `docs/superpowers/` décrivent toujours l'ancien contrat. Les deux sont relevés dans #33,
  qui demande de trancher pour les documents : les corriger, ou les garder comme trace
  datée de leur lot.
- Une seule PR, en commits atomiques. Livré : quinze commits, chacun rattaché à son ticket.
  - #21, le lecteur de réponses : `dc8143e`, `2f15197`.
  - #22, l'entrée par `join/` : `fe23388`, `875ad81`, `0771385`, `bf239f5`, `a134dbe`,
    `87b8a6d`.
  - #24, le jeton de salle : `3ac8a7c`.
  - #25, le README : `f7c9127`.
  - #23, la salle d'attente à identifiant signé : `09119ab`, `12a7ff3`, `41b4fd6`,
    `460383e`, `1826352`.

## Décisions de test

- **Un bon test observe une conséquence** : la requête partie (méthode, chemin, corps,
  en-têtes), la route atteinte et ses paramètres, le texte affiché, ou l'absence de rendu.
  Jamais une prop interne, puisqu'une prop consommée par un composant n'atteint pas
  l'élément hôte.
- **Deux coutures, celles que les specs utilisent déjà. Aucune nouvelle.**
  - **Le réseau**, avec `fetch` doublé, pour la couche API : `joinRoom`, `requestEntry`, le
    lecteur de réponses (404 JSON, 404 non JSON, 410) et les en-têtes du jeton de salle.
    Précédents : les specs de la couche API des salons, du client HTTP, de la main levée et
    des requêtes anonymes.
  - **Le module API espionné** par `jest.spyOn`, qui atteint bien nos propres modules, pour
    les trois écrans rendus avec RNTL. Le routeur est doublé. Le magasin d'accès mis de côté
    reste le vrai, sans doublure. Précédents : les specs du pré-join, de la salle d'attente
    et de la séance.

  Livré : deux écarts, tous deux dans la spec de la salle d'attente et délibérés. Un test
  remplace la mise de côté de l'accès par une fonction qui jette, pour prouver que l'écran
  sort de l'attente quand l'entrée en séance échoue après l'admission. Un autre espionne
  `setInterval` et `clearInterval`, pour prouver que l'horloge est relâchée au démontage :
  le compteur de minuteries de Jest compte aussi celles que l'écran ne pose pas.
- **Salle d'attente** : horloge simulée, comme sa spec actuelle, et écouteur `AppState`
  capturé, comme la spec de reprise après interruption.
- **Une conditionnelle, un test dont la fixture la rend vraie _et_ fausse.** C'est le cas
  de compte ou invité, `livekit` présent ou absent, `accesses` présent ou absent,
  identifiant connu ou non, 400 avec ou sans identifiant, paramètre caméra ou micro présent
  ou absent, accès mis de côté ou non.
- **Un appui, toutes ses instructions observées.** « Rejoindre » mémorise le nom ou la
  visite, demande l'entrée, met l'accès de côté et navigue : chacune de ces instructions a
  son assertion.
- **L'en-tête exact** : `X-LiveKit-Token <jeton>` sur la main levée et sur la coupure du
  son, et l'absence de `Bearer`.
- **Traductions** : le test des locales échoue si l'une des sept manque une clé.
- **RNTL 14 est asynchrone** : `await` sur chaque `render` et chaque événement.
  `jest.restoreAllMocks()` en `beforeEach` dans tout fichier qui espionne un module
  partagé.
- **Mutations à faire rougir**, en mutant la branche et non le prédicat qui l'alimente :
  - ne plus renvoyer l'identifiant ;
  - revenir à 5 s ;
  - ne pas sonder au retour au premier plan ;
  - lire le droit de modérer autrement que par `accesses` ;
  - perdre un paramètre caméra ou micro entre la salle d'attente et la séance ;
  - remettre `Bearer`.
- **Tout extrait de test écrit dans le plan aura été exécuté** contre HEAD et aura échoué
  de la bonne façon.
- **Essais sur appareil, prod en invité** :
  1. salon public : entrée directe, caméra et micro respectés ;
  2. salon `trusted` : salle d'attente, admission depuis le web par le propriétaire, séance
     avec caméra et micro respectés ;
  3. même cas avec un refus : message affiché, sondage arrêté ;
  4. plus de 6 s en arrière-plan pendant l'attente, puis retour : remise en file, puis
     admission ;
  5. main levée visible côté web ;
  6. salon inconnu : message « introuvable » ; salon supprimé : message du 410 si on sait en
     produire un, sinon test unitaire seul.

  Livré : passés le 2026-11-20 sur un Pixel 10 Pro Fold, avec un build release de
  `1826352`, sans écart (#27). Le salon supprimé n'a pas été essayé en production : il reste
  couvert par les tests unitaires du pré-join.
- **Essais sur appareil, dev reconstruit en v1.39, avec un compte** :
  7. propriétaire : entrée directe ; modération et coupure du son disponibles ;
  8. le propriétaire admet un invité depuis l'app ;
  9. un compte sans rôle sur un salon `restricted` passe par la salle d'attente et se fait
     admettre.

  Livré : passés le 2026-11-20, même appareil, même build (#28). L'essai 7 prévoyait aussi
  l'enregistrement, retiré puisque l'app n'en a plus de commande (`884749e`). Couper le
  micro d'un invité et l'expulser ont marché ; « Passer administrateur » a échoué : #34.
- **Condition de fusion** : tests, typecheck et lint verts, **et** les deux séries d'essais
  sur appareil. Livré : à `1826352`, typecheck et lint sans erreur, 1772 tests verts dans
  109 suites ; dev reconstruit le 2026-11-20 (#26), et les deux séries passées.

## Hors périmètre

- Créer le salon quand il n'existe pas, comme le fait le web : #29, lié aux liens d'agenda
  morts.
- Couper le son en admin par la session, comme le web : avec le jeton de salle, un admin ne
  peut pas couper le son dans un salon réglé `everyone_can_mute: false`, comme avant ce lot.
  Suivi dans #30.
- Laisser admettre les personnes en attente par tout participant connecté d'un salon
  `trusted`, comme le fork le permet : #31.
- L'authentification par jeton d'accès utilisateur de Meet (`UserAccessJWTAuthentication`).
  Elle est éteinte en production, et elle exigerait un intermédiaire serveur détenteur d'un
  secret capable d'usurper tout compte du domaine. Plan B seulement, si la PR serveur
  `linto-ai/meet#15` cale.
- Tout changement serveur : le déploiement de `linto-ai/meet#15`, sans laquelle aucune
  personne connectée n'entre en production ; la question `AllowOffline` du SSO. La
  reconstruction de dev en v1.39, tâche séparée, a été faite le 2026-11-20 (#26).
- Toute compatibilité avec un serveur sans `join/` : aucun repli vers l'ancien contrat,
  seulement un message clair.
- La publication de la v0.10.0, qui suit la fusion sur un feu vert séparé.
- La validation d'adresse de serveur à la connexion, défaut antérieur à ce lot.

## Défauts relevés pendant le lot

Ouverts hors lot, en `needs-triage`.

- #32 : une fois la personne en file, la salle d'attente ignore le 404 et le 410 et
  redemande sans fin ; avant la mise en file, elle les affiche comme « Connexion
  impossible ».
- #33 : trous de test, messages, références périmées, et documents de conception qui
  décrivent encore l'ancien contrat.
- #34 : « Passer administrateur » appelle une route qui ne change pas les rôles, et l'app le
  propose pour des invités anonymes que le serveur refuse de promouvoir.
- #35 : le retour Android quitte la séance au lieu de refermer le panneau ouvert.

## Notes

- **Origine du changement** : le commit amont `4e953da2` (2026-10-22) sert les jetons par
  `POST …/join/`. Il n'est dans aucune version amont publiée au 2026-11-19. La salle
  d'attente sans cookie et l'identifiant signé (`10ac8925`, `191e6d49`) sont dans la v1.35.0
  amont. Le fork LinTO est l'amont 1.37.0 plus les changements non publiés. Images :
  `ghcr.io/linto-ai/meet-backend:v1.39` et `meet-frontend:v1.39`, publiques.
- **Le client web, pour comparaison** : sondage toutes les 3 s, y compris en arrière-plan ;
  abandon à 10 min ; création du salon sur un 404. L'app s'en écarte délibérément sur les
  deux derniers points.
- **Conséquences connues** : en production, au 2026-11-19, seuls les invités entrent tant
  que `linto-ai/meet#15` n'est pas déployée. Dev, qui n'ouvrait plus aucune séance avant sa
  reconstruction, en ouvre de nouveau depuis #26.
- **Fond de la séance** : tout nouveau texte posé sur un écran au fond forcé sombre prend
  une couleur explicite issue des jetons de style, et un test `toHaveStyle` garde cette
  couleur.
