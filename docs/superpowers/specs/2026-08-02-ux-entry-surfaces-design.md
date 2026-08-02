# Refonte UX/UI — Lot 2 : surfaces d'entrée — conception

Deuxième lot du chantier ouvert depuis le projet Claude Design **« Twake Visio,
navigation mobile »**. Il refond les trois surfaces par lesquelles on entre dans
l'application : **connexion**, **accueil**, et **rejoindre une réunion**.

Il s'appuie entièrement sur le Lot 1 — jetons, thème clair permanent, sept
primitives, sept locales — dont il ne redit rien. Voir
`2026-08-02-ux-foundations-and-shell-design.md`.

Branche `design/ux-home`, partie de `design/ux-shell`. Le Lot 1 reste
**mergeable indépendamment** : l'empiler dessus retiendrait les jetons dont les
quatorze branches en vol ont besoin.

Marqueurs : **[V]** vérifié dans les sources · **[M]** mesuré sur le mockup ·
**[D]** décision · **[?]** non établi.

---

## Le périmètre, et les trois écarts au mockup

| Surface | Mockup | Ce lot | Pourquoi |
| --- | --- | --- | --- |
| Connexion | tuile-logo, titre, baseline, 3 boutons | **identique** | — |
| Accueil | en-tête, 2 cartes d'action, liste des salons | **identique** | — |
| Rejoindre | feuille, code 3-4-3, coller un lien | **identique**, mais sur une feuille NEUVE | §2 |
| Créer | feuille : nom + accès | **écran plein restyé** | §3 |
| Liste « -2 h → +24 h » | sur l'accueil | **abandonnée** | §1 |

---

## 1. La liste « -2 h → +24 h » est abandonnée, pas reportée **[D]**

Elle échoue sur **deux** obstacles indépendants, et aucun des deux n'est un
manque de travail :

**Aucune capacité.** Mesuré le 2026-08-02 sur les trois instances connues :
`/api/v1.0/config/` ne porte aucun champ de calendrier, et le
`.well-known/twake-configuration` de l'organisation n'expose que
`twake-flagship-login-uri` et `twake-pass-login-uri`. Le Lot 1 a livré
`canShowAgenda()`, qui rend donc `false` partout.

**Aucune donnée.** Même si la capacité s'ouvrait, `/api/v1.0/rooms/` ne renvoie
que `{ id, slug, name, access_level }` — sans date, sans heure, sans durée.
C'est le fait n° 1 de la spec du Lot 1, et il n'a pas bougé.

> **Construire cette liste reviendrait à écrire un écran que personne ne peut
> voir, au-dessus de données qui n'existent pas.** La garde `canShowAgenda`
> reste en place pour le jour où meet expose un signal ; la surface s'écrira
> quand elle aura quelque chose à afficher.

L'accueil garde donc « Mes réunions », la liste des salons que
`fetchMyRooms` rend déjà.

## 2. La feuille « Rejoindre » ne peut pas réutiliser `BottomSheet` **[V]**

`src/screens/room/bottomSheet.tsx` porte une précondition écrite par son auteur :

> « **AUCUN évitement de clavier.** PRÉCONDITION : ne jamais placer un
> `TextInput` dans une feuille avant qu'un évitement de clavier y soit ajouté. »

Or la feuille « Rejoindre » est **entièrement** une saisie. Trois voies :

| | Conséquence |
| --- | --- |
| Ajouter l'évitement à `BottomSheet` | Il est modifié par **5** branches en vol, et `src/ui/keyboard.ts` par **9**. Le pire endroit du dépôt. |
| Garder « Rejoindre » en écran plein | Perd l'interaction signature du mockup, pour une surface qui tient en une demi-hauteur. |
| **Une feuille neuve dans `src/ui/`** | Aucune contention, et **ce sont deux composants différents** : `BottomSheet` est une surface SOMBRE conçue pour l'écran d'appel, celle-ci est claire et posée sur la coque. |

**Décision : `src/ui/formSheet.tsx`** — feuille claire, avec évitement de
clavier. Elle ne remplace pas `BottomSheet` et ne le touche pas.

## 3. « Créer » reste un écran plein **[D]**

Le mockup en fait une feuille portant deux champs : nom, et niveau d'accès.
`src/screens/room/create.tsx` en porte **quatre** : nom, niveau d'accès,
recherche de co-organisateurs, et la liste des co-organisateurs retenus.

`AGENTS.md` pose que les co-organisateurs sont une exigence produit —
« co-organizers must be added via `POST /resource-accesses/` », parce qu'un
créateur ne doit pas avoir à être présent pour que la réunion démarre.

> **La feuille du mockup n'a pas prévu cette fonctionnalité, elle ne l'a pas
> écartée.** La transposer telle quelle la supprimerait. Et une feuille assez
> haute pour la contenir, sous un clavier ouvert, est le pire des deux formats.

`create.tsx` est donc **restyé** avec les jetons et primitives du Lot 1, et
reste un écran. Le fichier n'est modifié par **aucune** des quatorze branches
en vol **[V]**.

---

## Ce qui existe déjà et n'est pas à réécrire **[V]**

| Besoin | Ce qui le couvre | Où |
| --- | --- | --- |
| Motif du code `xxx-yyyy-zzz` | `GENERATED_ROOM_ID` | `deepLinks.ts:20` |
| Lire un lien collé → slug | `parseMeetingLink(url, allowedHosts)` | `deepLinks.ts:39` |
| Tirer un code au sort | `generateRoomCode()` | `roomCode.ts:25` |
| Liste des salons | `fetchMyRooms(account)` | `rooms.ts:78` |
| Niveau d'accès par défaut | `readPreferences().defaultAccessLevel` | Lot 1 |

**À installer** : `expo-clipboard`, pour « Coller un lien » et « Copier le lien ».
Absent aujourd'hui. `npx expo install`, jamais `npm install`.

---

## Les trois surfaces

### Connexion — `src/screens/welcome.tsx`

Cinquante lignes aujourd'hui, trois `Button` de Paper empilés. Le mockup **[M]** :
tuile de 92 px arrondie à 26, dégradé `#2FBE6C → #159049`, glyphe caméra blanc ;
« Twake » en `textPrimary` et « Visio » en `brand`, 30 px extra-bold ; baseline
sur deux lignes en `textSecondary` ; puis « S'inscrire » plein, « Se connecter »
contour, et le lien serveur d'organisation.

**Le dégradé demande `expo-linear-gradient`** — un aplat vert perdrait la
signature. À installer, ou à rendre par un aplat `brand` si l'on refuse la
dépendance : **[?]** à trancher à l'écriture du plan, en pesant une dépendance
de plus contre la seule tuile qui en aurait besoin.

**Inversion de hiérarchie assumée** : le mockup met « S'inscrire » en bouton
plein et « Se connecter » en contour. `welcome.tsx` fait l'inverse aujourd'hui.
On suit le mockup — l'application vise d'abord des personnes qui n'ont pas de
compte.

### Accueil — `src/screens/home.tsx`

`AppHeader` du Lot 1, ce qui **résout l'incohérence** des trois onglets relevée
sur appareil le 2026-08-02 et consignée dans la spec du Lot 1.

Puis les deux cartes du mockup : « Nouvelle réunion » sur dégradé vert, et
« Rejoindre une réunion » en carte blanche à filet. Puis « Mes réunions »
(`SectionLabel`) et la liste existante, en `SurfaceCard` avec `InitialsAvatar`.

**« Se déconnecter » disparaît d'ici** : Réglages le porte depuis le Lot 1, et le
mockup ne le met pas sur l'accueil. Le doublon était transitoire.

### Rejoindre — feuille sur l'accueil

Dix cases en trois groupes `3-4-3`, séparées par deux tirets. Un `TextInput`
**transparent superposé** capte la frappe — c'est la technique du mockup
(`opacity:0`, `position:absolute`, `inset:0`), et la seule qui donne un curseur
système sans dix champs à synchroniser.

Bouton « Rejoindre » inerte tant que les dix lettres ne sont pas saisies —
`joinBtnBg` du mockup passe de `#E4E9E6` à `brand` **[M]**. **Inerte, pas
`disabled`** : `AGENTS.md` interdit `disabled` sur l'écran d'appel pour une
raison de contraste qui ne vaut pas ici, mais la forme retenue reste de ne pas
rendre l'action plutôt que de la griser à moitié.

« Coller un lien de réunion » lit le presse-papiers et passe par
`parseMeetingLink`, avec l'allowlist de `listKnownHosts()` — la même qui protège
les liens profonds. Un lien d'un hôte inconnu est refusé, pas suivi.

---

## Hors périmètre, explicitement

- **Tout `src/screens/room/` sauf `create.tsx`** — quatorze branches y travaillent.
- **Le pré-join, le flou, les arrière-plans** — Lot 3.
- **L'écran d'appel** — Lot 4.
- **La liste des réunions à venir** — abandonnée, §1.
- **La feuille « Créer »** — reste un écran, §3.
- **`BottomSheet`** — pas touché, §2.

## Ce que ça vaut, honnêtement

Ce lot rend l'application **reconnaissable** : la connexion et l'accueil sont les
deux écrans qu'on voit avant tout le reste, et ce sont les derniers à porter
encore la mise en page d'origine. Il referme aussi l'incohérence des en-têtes.

Ce qu'il ne fait pas : l'écran où l'on passe le plus de temps, l'appel, reste
inchangé — et il le restera tant que les branches en vol ne seront pas
atterries. Ce lot ne rapproche pas cette échéance.
