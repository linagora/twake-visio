# Contribuer à Twake Visio

Merci de votre intérêt. Ce document dit comment monter l'environnement, ce que
la relecture attend, et surtout **ce qui a déjà coûté cher ici** — plusieurs des
règles ci-dessous sont invisibles à la lecture du code et ne se voient qu'à
l'exécution.

Une lecture est obligatoire avant d'écrire du code : **[`AGENTS.md`](AGENTS.md)**.
C'est la source de vérité des conventions de ce dépôt, humains compris malgré
son nom, et il consigne les erreurs déjà payées avec leur mesure. Le présent
fichier en est le résumé opérationnel ; en cas de contradiction, `AGENTS.md`
l'emporte.

En participant, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md). Pour
une faille de sécurité, n'ouvrez **pas** d'issue : voir [`SECURITY.md`](SECURITY.md).

## Monter l'environnement

**Node 20**, et une **compilation de développement** — Expo Go ne fonctionne
pas, LiveKit exige du code natif. Pour Android, un **JDK 21** : le 24 casse la
configuration CMake d'AGP et le 17 ne couvre pas Expo 57. Pour iOS, **Xcode 26.4
au minimum** ; sous 26.3 une source d'Expo SDK 57 ne compile pas.

```bash
npm ci
npm run android      # ou npm run ios
```

**Ajoutez toujours une dépendance avec `npx expo install`, jamais
`npm install`** : la version doit correspondre au SDK Expo plutôt qu'être la
dernière publiée.

Le simulateur iOS ne peut publier ni caméra ni micro : tester iOS demande un
appareil.

### Quand quelque chose échoue de façon absurde, suspectez un pair manquant

`.npmrc` porte `legacy-peer-deps=true` pour une raison bornée — un paquet **web**
tiré par LiveKit — mais son effet ne l'est pas : npm n'installe **aucune**
dépendance de pair, jamais. Un pair absent reste invisible jusqu'à ce que
quelque chose le cherche, et se manifeste alors loin de sa cause : un module
introuvable, un projet Gradle qui n'existe pas, un plantage natif sur un écran
qui marchait. C'est arrivé trois fois. La procédure de balayage est dans
`AGENTS.md`.

## Avant d'ouvrir une pull request

```bash
npm test
npm run typecheck
npm run lint
```

Les trois doivent être verts. `lefthook` enchaîne le formatage, le lint et le
typecheck avant chaque commit — **mais pas les tests** : lancez-les vous-même,
un commit peut passer le hook avec une suite rouge.

## Ce que la relecture regarde

**Sept locales, toutes remplies.** Aucune chaîne visible par une personne
utilisatrice ne vit dans le code. `src/i18n/index.spec.ts` échoue si une clé
manque dans l'une des sept — allemand, anglais, espagnol, français, italien,
russe, vietnamien.

**Pas de style en ligne.** Jamais de `style={{…}}` : toujours un
`StyleSheet.create` nourri par `src/ui/tokens`, source unique du style.
`twake-mui` et `cozy-ui` sont des bibliothèques **web** et ne s'importent pas
ici ; elles servent de référence de valeurs, rien de plus.

**Une couleur explicite sur l'écran d'appel.** Cet écran force un fond sombre
quel que soit le schéma du système, mais `react-native-paper` fait retomber son
texte sur `onSurface`, quasi-noir en schéma clair — le défaut de la plupart des
appareils. Un composant posé là sans couleur explicite donne du **noir sur
noir**. C'est arrivé, mesuré à 1,08:1 de contraste, avec toute la suite au vert.
Le détail — et la liste des props concernées, y compris `rippleColor` — est dans
`AGENTS.md`.

**Un test par conditionnelle, dont la fixture rend la condition vraie _et_
fausse.** Un lot a produit huit trous de couverture, tous de la même forme : le
test observait un résultat sans jamais faire varier la valeur sur laquelle le
code branche. L'implémentation aurait pu être une constante.

**N'affirmez pas dans un test ce qu'un composant consomme.** Une prop qu'un
composant déstructure avant de répandre le reste n'atteint jamais l'élément
hôte : `props.visible` y vaut `undefined`, et l'assertion est **verte dans les
deux états**. Assertez une conséquence observable — rendu ou non rendu, un style
composé, un texte.

**Ne nommez pas une prop de geste comme celle d'un composant hôte.**
`fireEvent.press` remonte l'arbre de fibres jusqu'au premier ancêtre hôte : une
prop nommée `onPress` sur votre propre composant est trouvée sur sa propre
fibre, et le test passe que vous la câbliez ou non. Mesuré : zéro rouge sur la
mutation. Préfixez — `onTilePress`, `onRowPress`.

## Structure

Les écrans vivent dans **`src/screens`**, jamais dans `app/`. expo-router tire
_tout_ `.tsx` sous `app/` dans le bundle : un fichier de test qui y serait
colocalisé deviendrait une route et ferait échouer la compilation. Un fichier de
`app/` contient donc une ligne :

```tsx
export { WelcomeScreen as default } from 'src/screens/welcome';
```

Les tests sont **colocalisés** en `*.spec.ts` / `*.spec.tsx`, sans instantanés.

**Ne commitez jamais `android/` ni `ios/`.** Ils sont ignorés et régénérés par
`expo prebuild` ; toute configuration native passe par un plugin de
`plugins/`, sans quoi elle disparaît à la prochaine régénération.

Deux règles de style TypeScript, toutes deux vérifiées par ESLint : **exports
nommés uniquement** — l'exception étant `app/`, où expo-router exige un export
par défaut — et **pas de `x as unknown as T`**, l'exception étant les fichiers de
spec, où typer un `global.fetch` bouchonné l'impose.

## Commits et pull requests

Sujets en [Conventional Commits](https://www.conventionalcommits.org), à
l'impératif ; `commitlint` les vérifie. La casse de phrase est autorisée ici,
par surcharge délibérée de la configuration par défaut.

```
feat(call): Raise a hand and react from the bar, in one press
fix(effects): Keep the background when switching lens
```

Un bon message dit **pourquoi**, pas quoi — le diff dit déjà quoi. S'il corrige
un défaut mesuré, donnez la mesure.

Une pull request par sujet. Décrivez ce que vous avez vérifié, et sur quoi : un
appareil, un simulateur, la suite de tests. Si vous n'avez pas pu tester une
plateforme, dites-le — c'est utile, pas disqualifiant.
