# Refonte UX/UI — fondations, coque de navigation, capacités d'instance — conception

Lot 1 du chantier de refonte, ouvert depuis le projet Claude Design
**« Twake Visio, navigation mobile »** (`7288bbb2-718d-4ac9-91f8-4c31319bb3ae`),
fichier `VisioPhone.dc.html`.

Ce lot livre le **système visuel**, la **coque à trois onglets**, les deux écrans
qui n'existent pas encore (**Historique**, **Réglages**), et la **détection de la
capacité agenda** de l'instance. Il ne touche pas à l'écran d'appel.

Marqueurs employés ci-dessous : **[V]** fait vérifié dans les sources, avec sa
ligne ; **[M]** valeur mesurée sur le mockup ; **[D]** décision du propriétaire ;
**[?]** ce qui reste à établir.

---

## Le besoin, dans les mots du propriétaire

> « Est-ce que tu peux ouvrir ce chantier-là de refonte UX et UI de l'application ? »
> — dans une branche séparée, d'autres sessions codant en parallèle.

Puis, en cours de conception :

> « Si l'instance Twake ne dispose pas du calendrier […] il faut bien sûr que la
> partie liée à l'agenda soit désactivée. »

---

## Pourquoi ce lot commence par les fondations et non par l'écran d'appel

Le mockup couvre **onze surfaces** : authentification, coque à onglets, accueil,
feuille Créer, feuille Rejoindre (code 3-4-3), pré-join, panneaux audio et vidéo
(deux niveaux de flou, huit arrière-plans), appel, historique avec feuille de
transcription, réglages. C'est l'application entière — trop pour une seule
spécification.

Le découpage n'est pas arbitraire : il suit la carte des collisions. Au
2026-08-02, quatorze branches sont en vol. Leur intersection avec les fichiers de
ce lot a été relevée une par une **[V]** :

| Fichier | Branches qui le modifient |
| --- | --- |
| `src/screens/room/create.tsx` | aucune |
| `src/screens/room/prejoin.tsx` | aucune |
| `src/i18n/index.ts` | aucune |
| `app/_layout.tsx` | aucune |

Toutes les collisions vivent plus profond dans `src/screens/room/` — `call.tsx`,
les panneaux, `controlBar.ts`, `stage.tsx`. **L'écran d'appel est une zone de
conflit ; tout le reste est libre.** Un lot qui commence par restyler `call.tsx`
produirait dix conflits ; celui-ci n'en produit aucun, et livre aux branches en
vol le système de style qu'elles consommeront ensuite.

Les lots suivants, hors périmètre ici : accueil refondu et feuilles
Créer/Rejoindre (Lot 2), pré-join et effets d'arrière-plan (Lot 3, frotte avec
`design/audio-devices`), peau de l'écran d'appel (Lot 4, à faire atterrir après
les branches en vol).

---

## Les décisions prises **[D]**

1. **Périmètre** : fondations + coque. Pas les écrans de l'appel, pas l'accueil.
2. **Historique** : journal local sur l'appareil, pas d'endpoint backend.
3. **Schéma de couleurs** : coque toujours claire, appel toujours sombre.
   `makeTheme` cesse de lire le schéma système.
4. **Durée dans l'historique** : reportée. Le lot enregistre l'entrée seule.

---

## Les faits, et leur source

### 1. Le backend ne porte ni date, ni durée, ni transcription **[V]**

`/api/v1.0/rooms/` renvoie exactement `{ id, slug, name, access_level, livekit?,
is_administrable? }` — la forme est écrite dans `RawRoom`, `src/api/rooms.ts:8-15`.
Aucun champ temporel, aucune liste de participants, aucun enregistrement, aucune
transcription.

Le dépôt le dit déjà, `src/screens/home.tsx:50` :

> « Rien d'autre n'est disponible pour ordonner : l'API ne documente aucune date
> sur cette liste, et trier par une date qu'on n'a pas vue serait deviner. »

**Conséquence.** Deux surfaces du mockup n'ont pas de source :

- la liste « Réunions · -2 h → +24 h » de l'accueil (agenda — voir §7) ;
- le badge « Transcription et compte rendu » et la feuille de transcription.

La seconde est **reportée**, et la mesure du 2026-08-02 précise pourquoi — la
transcription **existe**, mais pas là où l'application pourrait la lire :

- `recording.available_modes` vaut `["screen_recording", "transcript"]` sur les
  trois instances relevées. La transcription est donc un **mode
  d'enregistrement**, pas une ressource séparée.
- `transcription_destination` vaut `"https://studio.linto.ai"` en production et
  `null` sur l'instance de développement. Le produit est donc déposé chez un
  **service tiers**, que meet ne réexpose pas.

Autrement dit : rien dans `/api/v1.0/` ne permet de **lister** les
transcriptions d'un compte, ni de les rattacher à une réunion passée. Le badge
et la feuille du mockup demanderaient LinTO, pas meet. Une coquille vide serait
pire qu'une absence.

### 2. Le motif du stockage local existe déjà, et il est motivé **[V]**

`src/rooms/titles.ts` garde en MMKV l'intitulé lisible d'un salon, avec sa
justification écrite en tête : meet impose `slug = slugify(name)`, le sérialiseur
de liste n'expose que quatre champs, et un titre rangé dans `configuration`
demanderait une requête de détail par salon.

Le journal des réunions se range naturellement dans ce motif : mêmes contraintes,
même réponse.

### 3. Les quatre rangées de Réglages ont toutes un point d'accroche libre **[V]**

| Rangée | Fichier | Ligne | État actuel |
| --- | --- | --- | --- |
| Micro à l'entrée | `src/screens/room/prejoin.tsx` | `:26` | `useState(false)` |
| Caméra à l'entrée | `src/screens/room/prejoin.tsx` | `:25` | `useState(false)` |
| Accès par défaut | `src/screens/room/create.tsx` | `:55` | `useState<AccessLevel>('public')` |
| Langue | `src/i18n/index.ts` | `:27` | `getLocales()[0]?.languageCode ?? 'en'` |

Quatre changements d'une ligne, dans trois fichiers qu'aucune branche en vol ne
touche. **Aucune rangée morte** : l'écran ne montre pas un réglage qui ne ferait
rien.

### 4. La chaîne des capacités d'instance existe, entière, et sert déjà **[V]**

- `InstanceFeatures` — `src/instance/types.ts:1` — porte `recording`, `subtitle`,
  `telephony`.
- Elle est lue depuis `/api/v1.0/config/` — `src/instance/discovery.ts:116`, la
  forme brute étant déclarée en `RawConfig`, `discovery.ts:5-11`
  (`recording.is_enabled`, `subtitle.enabled`, `telephony.enabled`).
- Elle est persistée **par compte** : `Account.instance` est un `InstanceConfig`
  complet, `src/auth/accounts.ts:5-10`, rangé en MMKV.
- Elle est consommée comme garde de capacité :
  `canStartRecording(features, access)`, `src/call/recording.ts:126`, dont le
  commentaire de tête donne la raison — sans le drapeau, « l'instance répond 404 ».

C'est le précédent exact de ce que demande la capacité agenda. Rien à inventer :
un champ de plus sur une chaîne qui fonctionne.

### 5. `@react-navigation` est absent — et ce n'est **pas** le piège habituel **[V]**

`node_modules/@react-navigation/` n'existe pas. Le réflexe qu'impose `AGENTS.md`
est de suspecter `legacy-peer-deps=true` et un pair jamais installé. **Ce n'est
pas le cas ici** : `expo-router@57` ne déclare `@react-navigation` ni en
`dependencies` ni en `peerDependencies`. Il embarque sa propre navigation —
`standard-navigation@^0.0.5` dans ses `dependencies` — et exporte `Tabs` depuis
`build/exports.d.ts`.

Donc **rien à installer**. À confirmer au premier build natif, la dépendance
n'ayant jamais été exercée dans ce dépôt.

### 6. Le groupe `(tabs)` ne casse aucune redirection **[V]**

Un groupe entre parenthèses n'apparaît pas dans l'URL. Déplacer `app/home.tsx`
vers `app/(tabs)/home.tsx` laisse la route `/home` intacte, donc les cinq
appelants continuent de marcher **sans être modifiés** :

| Appelant | Ligne |
| --- | --- |
| `app/index.tsx` | `:8` |
| `src/screens/welcome.tsx` | `:26` |
| `src/screens/server.tsx` | `:57` |
| `src/screens/room/call.tsx` | `:639` |

Le dernier compte : `call.tsx` est le fichier le plus disputé du dépôt, et ce lot
n'y touche pas.

### 7. Le mockup emploie quatre graisses, et aucune Regular **[M]**

Relevé sur `VisioPhone.dc.html` : `800` × 53, `700` × 51, `500` × 14, `600` × 12.
**Aucun `font-weight:400`.** La famille embarquée se limite donc à
`Manrope-Medium`, `-SemiBold`, `-Bold`, `-ExtraBold` — quatre fichiers, non huit.

Tailles relevées, par fréquence : 13, 11, 14, 12, 16, 15, 14.5, 12.5, 19, 17,
20, 13.5, 11.5, 30, 28.

### 8. Le mockup se contredit avec `AGENTS.md` sur le niveau d'accès par défaut **[V]**

Le mockup fixe `access` à `'trusted'` par défaut (script de `VisioPhone.dc.html`,
`groups()`). `AGENTS.md` écrit l'inverse, et le motive :

> « A room creator must not need to be present for the meeting to start.
> `restricted` breaks this outright and `trusted` breaks it for external guests. »

`src/screens/room/create.tsx:55` défaut à `'public'` pour cette raison.

**Le dépôt gagne.** Le défaut du réglage est `'public'`. Le mockup a tort ici, et
ce n'est pas un détail de style : c'est une exigence produit écrite.

### 9. Le mockup ne liste que cinq langues ; le dépôt en porte sept **[V]**

`SUPPORTED_LOCALES`, `src/i18n/index.ts:14` : `en fr es it de vi ru`. Le mockup
omet `vi` et `ru`. `AGENTS.md` impose les sept, toutes remplies avant fusion. La
rangée « Langue » en liste donc **sept**, plus « Langue du système ».

---

## Le système visuel — `src/ui/tokens`

Transcription du mockup, pas une réinterprétation.

### Couleurs de marque **[M]**

| Rôle | Valeur | Où, dans le mockup |
| --- | --- | --- |
| Vert primaire | `#1FA45C` | 24 usages : onglet actif, boutons, anneaux de sélection |
| Vert foncé | `#177E44` | texte sur lavis vert : valeur courante d'un réglage, badge |
| Lavis vert | `#EAF6EF` | pastille de l'onglet actif, fond d'option cochée, badge |
| Dégradé de marque | `#2FBE6C → #159049` | tuile-logo de l'en-tête, 160° |

### Neutres, coque claire **[M]**

| Rôle | Valeur |
| --- | --- |
| Fond d'application | `#F5F7F6` |
| Surface de carte | `#FFFFFF` |
| Bordure de carte | `#E7EBE9` |
| Séparateur de rangée | `#F0F3F1` |
| Bordure de champ | `#E1E6E3` |
| Texte principal | `#141815` |
| Texte secondaire | `#5A625D` |
| Méta | `#767E79` |
| Libellé de section | `#8A928D` |
| Onglet inactif | `#939B96` |
| Chevron | `#9AA29D` |
| Pied de page | `#A6ADA9` |

Danger `#D93B3B`. Avatar par défaut `#F2C879` sur `#6A4B10`.

### Le schéma **[D]**

`makeTheme` (`src/ui/theme.ts:5`) cesse de lire son argument de schéma et rend
toujours le thème clair. `app/_layout.tsx` perd son `useColorScheme`.

**Ce que ça achète.** `AGENTS.md` consacre sa plus longue section à un piège :
`call.tsx` force `backgroundDark` quel que soit le schéma, mais Paper fait
retomber son texte sur `theme.colors.onSurface`, que le thème **clair** fixe à
`textLight` — d'où des contrastes mesurés à 1,08:1 et 1,13:1, du noir sur du noir.

En rendant la coque toujours claire, `onSurface` redevient **juste par défaut**
partout hors appel. Le piège cesse de s'étendre aux écrans neufs au lieu d'être
recopié trois fois de plus. L'écran d'appel, lui, garde ses couleurs explicites :
il ne change pas dans ce lot, et la doctrine d'`AGENTS.md` continue de s'y
appliquer mot pour mot.

**Ce que ça coûte, dit franchement.** L'application ne suit plus le mode sombre
du système. C'est un renoncement réel, assumé parce que le mockup ne spécifie
aucune valeur sombre pour la coque : les inventer serait de la conception, pas de
la transcription.

Les jetons `*Dark` **restent en place** — `call.tsx` les consomme, et l'appel est
hors périmètre.

### Typographie **[M]**

Manrope, quatre graisses (§7). Ajout d'`expo-font` par `npx expo install`, jamais
`npm install`. Chargement dans `app/_layout.tsx`, à côté du garde `i18nReady`
qui existe déjà et suit exactement le même motif : rendre `null` tant que la
ressource n'est pas prête.

---

## Les primitives — `src/ui/`

Sept, chacune employée au moins deux fois dans le lot. Aucune primitive
spéculative.

| Primitive | Employée par |
| --- | --- |
| `AppHeader` | les trois onglets |
| `SurfaceCard` | Historique (conteneur de liste), Réglages (groupes, carte de profil) |
| `SectionLabel` | Historique, Réglages |
| `InitialsAvatar` | en-tête, profil de Réglages, rangées d'Historique |
| `SearchField` | Historique |
| `SettingRow` | Réglages (dépliante : valeur courante + chevron + options) |
| `EmptyState` | Historique |

**Nommage des props de geste.** `onRowPress`, `onAvatarPress`, `onOptionPress` —
**jamais** `onPress`. C'est la règle d'`AGENTS.md`, mesurée sur `VideoTile` :
`fireEvent.press` remonte la fibre React jusqu'au premier ancêtre **hôte**, donc
une prop qui reprend le nom d'un événement hôte est trouvée sur la fibre du
composant lui-même et le test passe que la prop soit câblée ou non. Mesuré sur ce
dépôt : la mutation « ne pas câbler `onPress` » donnait **zéro rouge** ; après
renommage, **quatre**.

**Aucun style en ligne.** `StyleSheet.create` alimenté par les jetons, toujours.

---

## La coque à trois onglets

```
app/(tabs)/_layout.tsx     barre d'onglets custom
app/(tabs)/home.tsx        déplacé depuis app/home.tsx
app/(tabs)/historique.tsx  nouveau
app/(tabs)/reglages.tsx    nouveau
```

Les fichiers sous `app/` restent d'une ligne, sans logique — la règle d'`AGENTS.md`.
Les écrans vivent dans `src/screens/`, avec leurs specs à côté.

**Barre custom, et pourquoi.** Le mockup pose l'icône active dans une pastille
`#EAF6EF` arrondie de 26 px, sous un libellé de 11 px. Les options standard d'un
navigateur d'onglets ne rendent pas cette pastille ; on passe donc `tabBar={…}`.

Les trois icônes du mockup, en `MaterialCommunityIcons` (déjà fourni au
`PaperProvider`, `app/_layout.tsx`) : `video-outline` (accueil), `clock-outline`
(historique), `cog-outline` (réglages).

**L'onglet Agenda du mockup n'existe pas.** Le script de `VisioPhone.dc.html`
garde une machinerie `agenda` (icône calendrier, `headerTitle`, branche
`showUpcoming`), mais la variante `b` — celle retenue — ne le liste pas dans ses
onglets. La surface agenda est la liste « -2 h → +24 h » de l'accueil. Voir §7 et
la capacité ci-dessous.

---

## Historique — journal local

### Le stockage

`src/rooms/journal.ts`, MMKV, `id: 'room-journal'`. Même motif que `titles.ts`,
et la justification est la même : meet ne peut pas porter cette donnée.

```ts
export type MeetingVisit = {
  readonly slug: string;
  readonly title: string;
  readonly joinedAt: number; // epoch ms
};

export function rememberVisit(slug: string, title: string): void;
export function listVisits(): readonly MeetingVisit[];
```

Écrit depuis `src/screens/room/prejoin.tsx` au moment de rejoindre — fichier
qu'aucune branche en vol ne touche (§ des collisions).

**Borne.** Les 200 dernières visites. Sans plafond, MMKV croît sans fin ; le
dépôt a déjà ce réflexe, `MAX_ROOM_PAGES` dans `src/api/rooms.ts:57`.

### La réserve sur la durée **[D]**

Le mockup affiche « Hier · 42 min ». La durée exige un point d'accroche à la
**fin** de l'appel, donc dans `call.tsx` — le fichier le plus disputé du dépôt.

Le lot enregistre donc **l'entrée seule**, et la ligne affiche « Hier · 14:30 ».
Exact plutôt que deviné, ce qui est la doctrine du dépôt (`titles.ts` : « le code,
qui est au moins exact »). La durée arrive avec le lot de l'appel.

### L'écran

Champ de recherche, un libellé de section (« 7 derniers jours », ou « Résultats »
quand la recherche est active), puis les rangées : avatar d'initiales de 40 px,
nom, méta relative. `date-fns` est déjà une dépendance et porte les locales.

État vide, deux cas distincts : journal vide (« Aucune réunion pour l'instant »)
et recherche infructueuse (« Aucune réunion ne correspond à … »). Ce sont deux
messages, pas un.

Couleurs d'avatar : quatre paires relevées au mockup **[M]** — `#EAF6EF`/`#1B7A45`,
`#FDF2E3`/`#8A5A12`, `#EDF1FB`/`#2B4A9E`, `#F6EDF6`/`#7A2E78` — choisies par
empreinte du `slug`, donc stables d'un rendu à l'autre.

---

## Réglages

### L'écran

Carte de profil (avatar 56 px, nom, adresse), trois groupes, « Se déconnecter » en
`#D93B3B`, pied « Twake Visio 1.0 · Serveur souverain ».

| Groupe | Rangée | Options | Défaut |
| --- | --- | --- | --- |
| Audio et vidéo par défaut | Micro à l'entrée | Coupé / Actif | **Coupé** |
| | Caméra à l'entrée | Coupée / Active | **Active** |
| Réunions que je crée | Accès par défaut | Ouverte / Ouverte aux personnes de confiance / Restreinte | **Ouverte** (§8) |
| Langue de l'application | Langue | Langue du système + les sept locales (§9) | **Langue du système** |

### Le stockage

`src/settings/preferences.ts`, MMKV, `id: 'preferences'`. Types explicites,
exportés, jamais d'`enum` (`AGENTS.md`) :

```ts
export type Preferences = {
  readonly micOffOnJoin: boolean;
  readonly cameraOffOnJoin: boolean;
  readonly defaultAccessLevel: AccessLevel;
  readonly language: SupportedLocale | null; // null = suivre le système
};
```

### Les quatre branchements

Quatre changements d'une ligne, aux lignes relevées en §3. Pour la langue,
`resolveLocale()` (`src/i18n/index.ts:27`) consulte la préférence avant de
retomber sur `getLocales()`, et le choix appelle `i18next.changeLanguage()` pour
prendre effet sans redémarrage.

---

## La capacité agenda

### Ce qui est établi **[V]**

La chaîne complète existe et sert déjà (§4) : `RawConfig` → `InstanceFeatures` →
`Account.instance.features` → garde de capacité. Le précédent est
`canStartRecording`, `src/call/recording.ts:126`.

### Ce que le lot ajoute

Un champ `calendar: boolean` sur `InstanceFeatures`, lu depuis `/api/v1.0/config/`
dans `discovery.ts`, **fermé par défaut** : une configuration muette, un champ
absent, une instance qui ne répond pas ⇒ agenda éteint. C'est le sens de la
demande, et c'est le sens sûr — une surface d'agenda affichée sans calendrier
derrière produirait une liste vide inexplicable.

Et une garde exportée, sur le modèle de `canStartRecording` :

```ts
export function canShowAgenda(features: InstanceFeatures): boolean;
```

### Ce qui a été mesuré, le 2026-08-02 **[V]**

La question a été tranchée par l'observation, contre les deux instances de
production que `knownInstances.ts:5-8` déclare.

**1. `/api/v1.0/config/` ne porte aucun champ de calendrier.** Réponses
identiques sur `meet.linagora.com` et `visio.twake.app`. Champs présents, en
entier :

```
LANGUAGE_CODE, recording, background_image, telephony, subtitle, livekit,
custom_css_url, analytics, support, silence_livekit_debug_logs,
is_silent_login_enabled, idle_disconnect_warning_delay, feedback,
external_home_url, use_french_gov_footer, use_proconnect_button,
manifest_link, transcription_destination
```

Ni `calendar`, ni `agenda`, ni rien d'approchant.

**1 bis. Confirmé sur une troisième instance, et d'un build plus récent.**
`meet.twake-dev.maudet.cloud` — l'instance de développement du propriétaire,
déjà relevée dans `discovery.ts:85` — répond 200 avec trois champs que les deux
instances de production n'ont pas (`authenticated_users_can_edit_display_name`,
`max_participants_for_sound`, `auto_mute_on_join_threshold`). C'est donc une
version postérieure de meet, et elle **ne porte pas davantage de champ de
calendrier**. Ses sous-domaines `calendar.`, `agenda.`, `tmail.` et `drive.`
répondent 404 : ce déploiement est meet seul.

Trois instances, deux versions de meet, aucun signal. La conclusion ne tient pas
à un déploiement en retard.

**2. Le `.well-known` de l'organisation ne porte que deux clés.**
`https://linagora.com/.well-known/twake-configuration` renvoie exactement :

```json
{
  "twake-flagship-login-uri": "https://manager.cozycloud.cc/linagora/default",
  "twake-pass-login-uri": "https://oauthcallback.mycozy.cloud/oidc/bitwarden/linagora_default"
}
```

Le motif `twake-<application>-login-uri` est bien réel, et c'est lui que visait
la demande. Mais `twake-guidelines/AGENTS.md:1293-1294` ne documente **que ces
deux clés**, et aucun des deux domaines interrogés n'en expose une troisième.

**3. Sur les hôtes meet, ce chemin renvoie du HTML avec un 200.** Vérifié en
direct sur les deux : c'est exactement le piège que `emailResolution.ts:24`
consigne déjà. Toute sonde future devra donc valider que la réponse est bien du
JSON, un code 200 ne prouvant rien ici.

### Ce qu'on en fait **[D]**

**Aucun signal de calendrier n'est observable aujourd'hui.** Donc la garde est
livrée **fermée, sans sonde** :

```ts
export function canShowAgenda(features: InstanceFeatures): boolean;
```

`InstanceFeatures.calendar` est parsé depuis `/api/v1.0/config/` — le champ est
absent partout, il vaut donc `false` partout — et `canShowAgenda` le lit. Aucune
surface d'agenda ne se rend.

**Pourquoi ne pas sonder une clé `twake-calendar-login-uri` qu'on aurait
devinée.** Parce qu'une garde branchée sur un champ inexistant est *toujours
fausse* : elle produit exactement le même comportement que la constante
ci-dessus, mais en donnant l'impression de fonctionner. C'est indiscernable par
lecture, et c'est précisément l'erreur qu'`AGENTS.md` documente à répétition. Un
nom de champ ne s'invente pas.

**Le jour où un signal existe**, deux endroits changent — le parseur de
`discovery.ts` et rien d'autre — et tout consommateur de `canShowAgenda` en
hérite sans être touché. C'est la raison d'être de la garde : elle donne au Lot 2
un point d'appui stable pour une capacité qui n'existe pas encore.

### Où la garde s'applique

La surface agenda est la liste « Réunions · -2 h → +24 h » de l'accueil, qui
appartient au **Lot 2**. Ce lot livre donc la **capacité** ; le Lot 2 la
**consomme**. Rien d'agenda n'est rendu dans le Lot 1, la garde y est donc
livrée avec ses tests mais sans consommateur — c'est délibéré, et c'est ce qui
permet au Lot 2 de ne pas rouvrir `discovery.ts`.

---

## Hors périmètre, explicitement

- **L'écran d'appel et tous ses panneaux.** Quatorze branches y travaillent.
- **L'accueil refondu**, ses deux cartes d'action, la liste « -2 h → +24 h » — Lot 2.
- **Les feuilles Créer et Rejoindre**, dont la saisie de code 3-4-3 — Lot 2.
- **Le pré-join**, le flou et les huit arrière-plans — Lot 3, frotte avec
  `design/audio-devices`. Seules les deux lignes `useState` de `prejoin.tsx`
  changent ici.
- **L'écran d'authentification du mockup.** `welcome`, `server` et `callback`
  existent et fonctionnent ; les restyler est du Lot 2.
- **La feuille de transcription et de compte rendu.** Aucune source (§1).
- **La durée des réunions dans l'historique.** Reportée (§ Historique).
- **Le mode sombre de la coque.** Renoncement assumé (§ Le schéma).

---

## Tests

Colocalisés, `*.spec.tsx`, sans instantané. `npm test`, `npm run typecheck`,
`npm run lint` au vert.

**RNTL 14 est asynchrone** : `render`, `fireEvent` et ses raccourcis,
`renderHook`, `cleanup` — `await` sur chacun. `tsc` ne le signalera pas.

**La garde de couleur explicite.** Pour chaque texte posé par ce lot,
`expect(screen.getByTestId(…)).toHaveStyle({ color: tokens.color.… })` en égalité
stricte. Elle ne prouve pas la lisibilité — rien ne rastérise — mais elle prouve
que la couleur explicite n'a pas été retirée, et c'est la cause qu'on garde.
Attention : c'est le `toHaveStyle` de **RNTL**, pas celui de `jest-native`, RNTL
chargeant en second et écrasant dix des douze matchers homonymes.

**Un test par conditionnelle, dont la fixture rend la condition vraie ET fausse.**
Recensement des branches de ce lot :

| Conditionnelle | Fixtures exigées |
| --- | --- |
| `canShowAgenda` | `calendar: true` / `false` / champ absent |
| Recherche d'historique | requête vide / correspondante / infructueuse |
| État vide d'historique | journal vide / journal peuplé |
| `SettingRow` dépliée | `open: true` / `false` |
| Option cochée | option courante / autre option |
| Onglet actif | chacun des trois onglets |
| Langue | préférence posée / préférence nulle (repli système) |

**Et un recensement des effets, pas seulement des branches.** Chaque gestionnaire
de `SettingRow` fait deux choses — écrire la préférence, refermer la rangée. Deux
instructions, donc **deux assertions** qui le nomment. Le dépôt a déjà payé ce
trou : une feuille qui ne se refermait pas, sans rien de rouge.

**Ce qu'il ne faut pas assertir.** Aucune assertion sur une prop qu'un composant
consomme lui-même — elle vaut `undefined` sur l'élément hôte et le test est vert
dans les deux états. Assertir sur une conséquence observable : rendu ou non rendu,
style composé, texte.

---

## Ce que ça vaut, honnêtement

Ce lot ne rend l'application ni plus rapide ni plus capable. Il fait trois choses :

1. Il remplace un bleu Material générique par le système visuel du mockup, ce qui
   est la demande.
2. Il livre deux écrans qui manquaient — dont un, Réglages, qui rend enfin
   réglables quatre comportements aujourd'hui figés dans le code.
3. Il désamorce, plutôt qu'il n'étend, le piège de contraste le plus coûteux du
   dépôt.

Ce qu'il ne fait pas : l'écran que les gens regardent le plus longtemps, l'appel,
est exactement tel qu'avant. La refonte visible arrivera au Lot 4, et elle
dépend de branches qui ne sont pas encore fusionnées.

Le pari du découpage est que livrer les jetons **tôt** vaut mieux que livrer une
refonte **complète** en un bloc : les quatorze branches en vol pourront rebaser
dessus au lieu de produire quatorze conflits de style à la fusion.
