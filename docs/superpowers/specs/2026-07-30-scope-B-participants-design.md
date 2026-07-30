# Périmètre B — Participants et modération

Conception validée le 2026-07-30 avec Michel-Marie. Premier des quatre sous-projets de la
barre de contrôle en séance ; les trois autres sont A (périphériques), C (interaction) et
D (enregistrement).

## Pourquoi celui-ci d'abord

La salle d'attente existe dans l'application depuis la tâche 18 et **ne mène nulle part** :
personne ne peut admettre qui que ce soit. Tout salon `trusted` ou `restricted` est donc
inutilisable en pratique, alors que le choix du niveau d'accès est présenté à la création
comme une décision de fond. C'est le seul trou du socle qui rende inopérante une
fonctionnalité déjà livrée.

## Ce que ça fait

Pendant une séance, un modérateur voit un **bandeau** quand quelqu'un frappe à la porte,
avec Admettre et Refuser. Un **panneau**, ouvert à la demande, liste les personnes
connectées et permet de couper un micro, d'expulser, de changer un rôle.

Hors périmètre, décidé : pas de notification quand l'application est en arrière-plan. Cela
demanderait des notifications push, donc un service, des jetons d'appareil, et un backend
meet qui sache les émettre — aucun endpoint d'abonnement n'existe dans son API. Ce serait
une contribution en amont avant de pouvoir commencer côté mobile.

## Deux sources, deux identités, jamais confondues

| | Personnes connectées | Personnes en attente |
|---|---|---|
| Source | LiveKit, déjà lu par `src/call/participants.ts` | API meet, par interrogation |
| Fraîcheur | temps réel, gratuit | scrutation à 5 s |
| Identifiant | `identity` LiveKit, une chaîne | `participant_id`, une **UUID** |
| Qui y a droit | tout le monde | modérateurs, salons non publics |

Les deux identifiants ne sont pas interchangeables : `remove_participant` et
`mute_participant` attendent l'identité LiveKit, `enter` attend l'UUID du lobby. Les
confondre produit des 404 silencieux. Le typage les gardera distincts jusque dans les
signatures.

## Quand on interroge, et quand on n'interroge pas

Jamais, sauf si **les deux** conditions tiennent :

- le salon n'est pas `public` — le serveur rend `[]` sur `waiting-participants` et 404 sur
  `enter` pour un salon public, qui n'a pas de salle d'attente ;
- `is_administrable` est vrai dans la réponse du salon — c'est exactement
  `is_administrator_or_owner`, la même règle que la permission `HasPrivilegesOnRoom` que
  ces endpoints exigent.

L'application reçoit déjà `is_administrable` par `fetchRoomAccess`. Comme l'écran de
création propose `public` par défaut, la majorité des réunions ne déclencheront aucune
requête.

## Une correction à apporter à la salle d'attente existante

L'écran d'attente livré aujourd'hui scrute `fetchRoomAccess`. C'est le mauvais endpoint :
il détecte l'admission, parce qu'un jeton finit par apparaître, mais **il ne peut jamais
détecter un refus**. Une personne refusée attendrait indéfiniment.

`POST /rooms/{id}/request-entry/` rend `{id, status, username, livekit}` où `status` vaut
`waiting`, `accepted` ou `denied`, et où le bloc `livekit` est présent une fois accepté.
Le service est conçu pour être rappelé — « if waiting, refresh timeout to maintain
position ». C'est donc lui qu'il faut scruter, et lui seul : il porte à la fois
l'admission, le refus et le jeton.

`src/api/rooms.ts` ne lit aujourd'hui que `id` et jette le reste.

## Cadence

Cinq secondes, tant que l'écran concerné est monté. L'endpoint est limité à **150 requêtes
par minute et par utilisateur** (`DEFAULT_THROTTLE_RATES.request_entry`) : douze requêtes
par minute laissent une marge d'un ordre de grandeur.

## Le bandeau

Une seule personne à la fois, la première arrivée, avec le nombre de personnes restantes à
côté. Une pile de bandeaux mangerait la vidéo, qui est la raison d'être de l'écran.

Refuser appelle le même endpoint qu'admettre, avec `allow_entry: false`. La personne
refusée le lira dans son propre statut, qui passe à `denied`, et son écran d'attente le lui
dira au lieu de continuer à tourner.

## Découpage

- `src/api/participants.ts` — les cinq endpoints, typés, chacun rendant un `ApiResult`.
- `src/rooms/waitingQueue.ts` — module **pur** : qui passe en premier, ce que devient la
  file quand trois personnes arrivent ensemble, ce qui se passe quand une personne
  disparaît de la liste sans qu'on ait répondu. Testable sans réseau ni rendu.
- `src/rooms/useWaitingParticipants.ts` — la scrutation et son cycle de vie, y compris son
  arrêt au démontage.
- `src/screens/room/waitingBanner.tsx` et `participantsPanel.tsx` — composants minces, qui
  reçoivent leur état et n'en calculent aucun.

Cette frontière est celle qui a fonctionné pour le rendu vidéo : la sélection dans un
module pur, la coquille aussi bête que possible.

## Tests

La logique de file et de sélection est vérifiable et sera éprouvée par mutation, comme le
reste du projet. Les appels API se testent contre un client bouchonné. Les écrans se
testent pour leur câblage — quelle action part avec quel identifiant — jamais pour leur
apparence.

Le piège à éviter, déjà rencontré : un test qui passe parce que ses données ne
discriminent pas. Une personne en attente et une personne connectée devront porter des
identifiants différents dans les fixtures, sans quoi une confusion des deux types passerait
inaperçue.

## Risques connus

`mute_participant` porte dans la source de meet un commentaire `TEMPORARY` : son
authentification y est reconnue comme insuffisante et compensée par une vérification de
présence du demandeur. Ce contrat peut changer sous nous.

Rien n'a été vérifié sur appareil quant au comportement du serveur lors d'un refus au-delà
du statut `denied` : la personne est-elle retirée de la liste d'attente, peut-elle
redemander l'entrée. À établir avant d'écrire l'écran correspondant.
