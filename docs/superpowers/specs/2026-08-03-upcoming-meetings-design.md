# « Vos prochaines visioconférences » sur l'accueil mobile

Remplacer la liste « Mes réunions » de l'accueil par le panneau des prochaines
visioconférences, celui que porte déjà le web.

Branche : `feat/upcoming-meetings`.

## Ce qui est MESURÉ, et qui contraint tout le reste

Relevé le 2026-08-03 contre `twake-dev.maudet.cloud`. Chaque ligne a été observée, pas
déduite.

| fait | conséquence |
| --- | --- |
| Le widget web est un script de surcouche servi depuis `/visio-patches/widget.js`, pas une fonctionnalité de meet | il n'existe aucune API meet des prochaines réunions |
| Le side-service est l'image `linagora/twake-calendar-side-service:branch-master` | son code n'est dans aucun dépôt local : **on ne peut pas lui ajouter d'endpoint** |
| `meet.twake-dev.maudet.cloud/api/v1.0/config/` ne porte **aucune** clé calendrier | `canShowAgenda(features)` est fermé partout et ne peut pas servir de signal |
| Aucun `.well-known` de catalogue de services sur six hôtes testés, en exigeant du JSON | pas de découverte par catalogue |
| Sous `/api/`, seuls `/api/user` et `/api/users` existent (401 contre 404 pour le reste) | la surface JSON du side-service se limite à l'utilisateur |
| Sous `/dav/`, **tout** chemin rend 401, y compris absurde | on ne peut RIEN prouver de l'existence d'une route sous ce préfixe par sondage |

Cette dernière ligne est une borne d'instrument, pas un résultat : elle interdit de conclure
que `/dav/api/calendars` existe, ce qu'un premier balayage avait laissé croire.

## Décision : le chemin CalDAV, celui du widget

L'application refait ce que fait le widget, appel pour appel :

1. `GET {side}/api/user` → `_id`
2. `GET {side}/dav/calendars/{uid}.json?personal=true` → agendas, via `_embedded['dav:calendar'][].\_links.self.href`
3. Par agenda : `REPORT` CalDAV (corps XML `calendar-query`) sur la fenêtre voulue
4. Filtrage : ne garder que les évènements portant un lien meet

Le coût est réel — XML et iCalendar embarqués — et il est **cerné** : une seule fonction rend
une liste d'évènements. Le jour où un endpoint JSON existe, seule cette fonction change.

**Alternatives écartées.** Ajouter un endpoint au side-service : impossible sans son code.
Écrire un proxy : déplace le problème et ajoute un service à exploiter.

## Le signal de capacité

**Le succès de l'appel EST le signal.** L'application tente l'étape 1 ; une réponse
exploitable ouvre le panneau, un `401`, `404` ou une injoignabilité le laisse masqué, en
silence.

C'est délibérément un signal observé et non déclaré, faute de mieux : le champ
`calendar.enabled` que `discovery.ts` sait déjà lire n'est servi par aucune instance connue.
`src/call/agenda.ts` n'est donc **pas** le garde-fou de ce panneau, et reçoit un commentaire
qui le dit — sans quoi le prochain lecteur croira que c'est lui qui décide.

## Ce qui n'est PAS vérifié, et qu'il faudra mesurer ensemble

**Le side-service n'accepte pas encore le jeton meet.** Il répond `401` aujourd'hui et rien
ne peut être testé de bout en bout sans un jeton valide. Le chemin complet est construit,
mais la première mesure réelle demande une session.

Conséquence de conception, pas de confort : un `401` n'est pas une erreur à afficher, c'est
l'état « pas de calendrier ici ». Le panneau disparaît, l'accueil reste utilisable.

## Découverte de l'hôte

`https://meet.<domaine>` → `https://tcalendar-side-service.<domaine>`, en retirant le premier
label. C'est la règle du widget (`BASE_DOMAIN`), et c'est une **hypothèse** sur les autres
instances : une fonction pure, testée, et le seul endroit à corriger si une instance nomme
ses hôtes autrement.

## Découpage

```
src/calendar/sideService.ts   URL du service depuis le compte (pur) + sonde /api/user
src/calendar/caldav.ts        les trois appels HTTP, corps du REPORT
src/calendar/events.ts        PUR : parsing ICS, sélection, dérivation du salon
src/calendar/useUpcoming.ts   crochet : états, rafraîchissement
src/ui/upcomingMeetings.tsx   le panneau
src/screens/home.tsx          « Mes réunions » retirée, panneau posé
```

Tout ce qui décide vit dans `events.ts`, pur et sans réseau — c'est là que portent les tests.
Le reste transporte.

### Le lien « Rejoindre » réutilise l'existant

L'URL meet d'un évènement est convertie en slug par `parseMeetingLink` (`src/navigation/deepLinks.ts`),
la fonction qui sert déjà aux liens profonds. Un évènement dont l'URL ne donne aucun slug
n'est pas affiché : une ligne « Rejoindre » qui ne mène nulle part est pire qu'une ligne
absente.

## Rendu

**Pas de fond vert** — demande explicite. Le panneau emprunte `cardSurface` comme les deux
cartes d'action au-dessus, et `SectionLabel` pour son titre.

Chaque ligne : l'heure (`HH:mm`), le titre, le délai relatif, une action « Rejoindre ».
**Trois évènements**, comme la capture web, et non les cinq du widget.

**Le délai se rafraîchit à la MINUTE**, pas à la seconde. Le web affiche « dans 8h 54m 59s » ;
un `setInterval` d'une seconde sur mobile réveille le fil JavaScript 3 600 fois par heure
pour une information que personne ne lit à la seconde près.

## États

| état | rendu |
| --- | --- |
| service injoignable, `401`, `404` | **rien** — le panneau n'existe pas |
| joignable, aucun évènement | une ligne « Aucune visioconférence à venir » |
| joignable, des évènements | jusqu'à trois lignes |
| en cours de premier chargement | rien, plutôt qu'un squelette qui clignote |

La distinction entre les deux premiers cas est le point : sans elle, une personne dont le
calendrier marche mais dont l'agenda est vide croit l'application cassée.

## Ce que la suppression de « Mes réunions » coûte

Michel-Marie a tranché « supprimée purement ». Consigné ici parce que ce n'est pas neutre :

- **Historique** liste `listVisits()`, le journal **local** des salons ouverts depuis cet appareil ;
- **« Mes réunions »** listait `fetchMyRooms()`, les salons que le **serveur** attribue au compte.

Les salons dont on est propriétaire sans les avoir ouverts depuis ce téléphone deviennent donc
inaccessibles autrement que par leur lien. `fetchMyRooms` reste dans `src/api/rooms.ts`, sans
appelant : le jour où on veut les retrouver, l'appel existe encore.

## Tests

Le gros porte sur `events.ts`, qui est pur :

- parsing ICS : `SUMMARY`, `DTSTART`, `DTEND`, `DURATION` sans `DTEND`, dépliage des lignes
  continuées (RFC 5545), échappements
- détection du lien : `X-OPENPAAS-VIDEOCONFERENCE` d'abord, puis `URL`, puis `DESCRIPTION`
- fenêtre : un évènement commencé mais non terminé est GARDÉ, un terminé est jeté — les deux
  polarités, avec une horloge injectée
- tri et troncature à trois
- un évènement sans slug exploitable est jeté

`sideService.ts` : la dérivation d'hôte, et les trois issues de la sonde.
Le panneau : les quatre états, et que l'appui sur « Rejoindre » navigue vers le bon slug.

Une horloge est **injectée**, jamais `Date.now()` lu dans la fonction : sans quoi la fenêtre
ne peut pas être rendue vraie ET fausse par une fixture.
