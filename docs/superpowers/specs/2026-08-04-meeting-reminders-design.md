# Rappels de réunion, conception

**Date : 2026-08-04.** Décidé avec le propriétaire du produit, approche **B**
(programmation locale plus rafraîchissement en tâche de fond).

## Le besoin

Une personne connectée, dont l'agenda est joignable, veut être prévenue avant
ses visioconférences et pouvoir les rejoindre d'un seul geste depuis la
notification.

## Ce qui existe déjà, et sur quoi on s'appuie

Relevé dans le code le 2026-08-04, pas supposé :

| fait                                                                                     | où                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| l'agenda rend `loading` / `unavailable(cause, reason)` / `ready(events, now)`             | `src/calendar/useUpcoming.ts:32-46`        |
| la fenêtre retenue va de `now - 1 h` à `now + 24 h`                                       | `WINDOW_BEHIND_MS`, `WINDOW_AHEAD_MS`      |
| `selectUpcoming` tronque ensuite à **3** évènements                                       | `MAX_EVENTS`, `upcoming.ts:49`             |
| le rafraîchissement est de 60 s, **au premier plan seulement**                            | `REFRESH_MS`, `useUpcoming.ts:59`          |
| « Rejoindre » depuis l'accueil fait `parseMeetingLink(event.meetUrl, allowedHosts)`        | `src/screens/home.tsx:108-119`             |
| puis `router.push('/room/{slug}/prejoin')`                                                | idem                                       |
| les réglages présentent un choix par `SettingRow`, une ligne qui se déplie                | `src/ui/settingRow.tsx`, `reglages.tsx:164` |
| `preferences.ts` encode déjà « pas de choix » par `null` (`language`)                     | `src/settings/preferences.ts:18`           |
| aucune bibliothèque de notification n'est installée                                       | `package.json`                             |
| `POST_NOTIFICATIONS` est déjà déclarée, pour le service d'appel                           | `app.json`                                 |

**La troncature à 3 est une contrainte d'AFFICHAGE**, imposée par la carte de
l'accueil. Les rappels ne l'héritent pas : une journée à six réunions est
justement celle où l'on en oublie une.

## Périmètre

Reçoivent un rappel les évènements que l'application récupère déjà quand
l'agenda est disponible : ceux de la fenêtre de 24 h **dont le lien de
visioconférence est analysable**. Un évènement sans lien exploitable n'en reçoit
pas, parce que le bouton « Rejoindre » n'aurait rien à ouvrir, et qu'un rappel
d'agenda sans action est ce que le téléphone fait déjà.

Hors périmètre : les rappels poussés par un serveur, les rappels multiples pour
un même évènement, la personnalisation par réunion.

## Architecture

### Le réglage : une ligne, pas un interrupteur plus une liste

```
Notifications
┌──────────────────────────────────────────┐
│ Rappel avant une réunion      15 minutes │
│ Vous recevez une notification avec un    │
│ bouton « Rejoindre »                     │
└──────────────────────────────────────────┘
   Jamais · 1 heure · 30 minutes · 15 minutes · 5 minutes
```

`preferences.ts` gagne un champ, et un seul :

```ts
readonly reminderLeadMinutes: 60 | 30 | 15 | 5 | null;   // null = jamais
```

Trois raisons de ne pas faire un interrupteur suivi d'une liste. C'est
exactement le composant `SettingRow` que les quatre autres réglages utilisent,
donc aucun motif d'interface nouveau. Cela supprime l'état bâtard « activé, mais
quel délai ». Et `null` pour « pas de choix » est déjà l'idiome de ce fichier.

Le groupe n'est rendu que lorsque l'agenda est `ready`. Quand il ne l'est pas,
le groupe **n'est pas rendu du tout** plutôt que désactivé : `AGENTS.md`
proscrit `disabled` sur les commandes de cet écran, et le précédent est
`participantsPanel.tsx`.

### Le moteur, coupé en deux

`src/notifications/reminders.ts`

```ts
export type Reminder = {
  readonly id: string;        // dérivé de l'uid de l'évènement
  readonly fireAtMs: number;
  readonly title: string;     // l'intitulé de la réunion
  readonly startMs: number;
  readonly slug: string;
};

export function planReminders(
  events: readonly CalendarEvent[],
  leadMinutes: number,
  now: number,
  allowedHosts: readonly string[],
): readonly Reminder[];
```

`planReminders` est **pure** : aucune dépendance native, donc testable en
entier. Elle écarte les évènements déjà commencés, ceux dont l'instant de rappel
est déjà passé, et ceux dont `parseMeetingLink` ne tire aucun slug.

`syncReminders(plan)` annule tout puis repose, sur `expo-notifications`.

**Annuler-puis-reposer, et non un diff.** Un diff exigerait de retrouver quel
rappel système correspond à quel évènement, à travers des identifiants que le
système peut avoir perdus entre deux exécutions. L'annulation globale est
idempotente et coûte quelques millisecondes.

Trois appelants, un seul moteur : le rafraîchissement d'agenda au premier plan,
le changement de préférence, et la tâche de fond.

### La tâche de fond, et la limite qu'il faut écrire

`expo-background-task` appuyé sur `expo-task-manager`, enregistrée **seulement**
quand un délai est choisi, désenregistrée quand on repasse à « Jamais ». Elle
refait la requête d'agenda et rappelle le même `syncReminders`.

> **iOS ne garantit aucun horaire.** La tâche est opportuniste : sur un
> téléphone où l'application est peu ouverte, elle peut ne pas s'exécuter de la
> journée. Android l'étrangle en Doze. La tâche **améliore** la fraîcheur, elle
> ne la garantit pas.
>
> Les rappels **déjà posés**, eux, se déclenchent quoi qu'il arrive, y compris
> si l'application ne tourne plus jamais : c'est le système qui les tient. C'est
> là que se trouve la fiabilité, pas dans la tâche.

Cette limite doit figurer dans la spécification et dans le code, pas être
découverte à l'usage.

### La notification et son bouton

Une catégorie `meeting-reminder` portant une action `join`, enregistrée au
démarrage par `setNotificationCategoryAsync`. Sur iOS, une action de
notification n'existe pas sans catégorie déclarée.

- **Titre** : l'intitulé de la réunion.
- **Corps** : l'heure de début, formatée par `src/calendar/format.ts`.
- **Bouton** : « Rejoindre ».

L'action ouvre `twakevisio://room/{slug}/prejoin`. Le slug vient de
`parseMeetingLink`, **la fonction déjà utilisée par l'accueil**, avec la même
liste d'hôtes que lui : celle de l'instance de la personne, pas
`listKnownHosts()`, qui est l'allowlist de ce qui arrive du dehors.

Un lien qu'on ne sait pas analyser ne produit **aucun** rappel, plutôt qu'un
rappel dont le bouton échoue.

Le pré-accueil et non la salle d'attente : c'est déjà où mène « Rejoindre »
depuis l'accueil, et un même mot doit faire une même chose. La salle d'attente
n'a de sens que pour un salon fermé, donc son comportement varierait selon le
salon.

### La permission

Demandée **à l'activation**, jamais au démarrage. Refusée, la ligne retombe sur
« Jamais » et affiche comment l'autoriser dans les réglages du système, plutôt
que de rester sur un délai qui ne produira jamais rien.

## Cas limites, tranchés d'avance

| situation                              | décision                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| l'agenda devient indisponible          | on **laisse** les rappels posés : un rappel périmé gêne moins qu'un silence     |
| la personne est déjà en réunion        | le rappel se déclenche : ce peut être la réunion suivante                       |
| l'instant de rappel est déjà passé     | aucun rappel, plutôt qu'un rappel immédiat                                      |
| la réunion a déjà commencé             | aucun rappel                                                                    |
| deux agendas portent le même évènement | un seul rappel : `selectUpcoming` déduplique déjà par `uid`                     |
| déconnexion                            | tous les rappels sont annulés                                                   |

## Fichiers

| fichier                                       | rôle                                                        |
| --------------------------------------------- | ----------------------------------------------------------- |
| `src/notifications/reminders.ts`              | `planReminders` (pure) et `syncReminders`                   |
| `src/notifications/reminders.spec.ts`         | couverture par conditionnelle du planificateur              |
| `src/notifications/permission.ts`             | demande et lecture de l'autorisation                        |
| `src/notifications/backgroundTask.ts`         | enregistrement et corps de la tâche                         |
| `src/notifications/category.ts`               | la catégorie `meeting-reminder` et son action               |
| `src/notifications/response.ts`               | de la réponse de notification vers `router.push`            |
| `src/settings/preferences.ts`                 | le champ `reminderLeadMinutes`                              |
| `src/screens/reglages.tsx`                    | le groupe « Notifications »                                 |
| `src/i18n/locales/*.json`                     | les sept locales                                            |
| `app.json`                                    | les greffons `expo-notifications` et `expo-background-task` |

## Tests

Le planificateur reçoit **un test par conditionnelle, dont la fixture rend la
condition vraie et fausse** : c'est la règle du dépôt, et le lot du partage
d'écran a montré ce qu'il en coûte de l'oublier. Les conditionnelles sont : lien
analysable ou non, rappel dans le passé ou non, évènement commencé ou non,
fenêtre de 24 h dedans ou dehors.

Les nouvelles lignes de réglages reçoivent la garde de couleur explicite,
`toHaveStyle({ color: tokens.color.… })`, précédents dans `reglages.spec.tsx`.

Le gestionnaire de réponse est testé sur une **conséquence observable** : la
navigation effectuée, jamais sur une prop qu'un composant consomme, qui serait
verte dans les deux états.

## Dépendances à ajouter

`expo-notifications@~57.0.8`, `expo-background-task@~57.0.7`,
`expo-task-manager@~57.0.7`, installées par `npx expo install` et jamais par
`npm install`.

**Après installation, balayer les pairs manquants.** `.npmrc` porte
`legacy-peer-deps=true` : npm n'installe aucune dépendance de pair, et l'absence
se manifeste loin de sa cause. La procédure est dans `AGENTS.md`.

## Ce que cette conception ne fait pas

- Aucun rappel poussé par un serveur. Ce serait la seule voie réellement fiable,
  et elle sort de ce dépôt : travail côté side-service, service FCM et APNs,
  enregistrement du jeton de l'appareil, et une conséquence de confidentialité
  que `PRIVACY.md` devrait alors décrire.
- Aucun réglage par réunion.
- Aucun rappel de suivi après le début.
