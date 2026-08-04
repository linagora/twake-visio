<!--
Merci pour cette contribution. Le gabarit est court : remplissez-le en prose,
pas en cases cochées mécaniquement. Une case cochée sans avoir été vérifiée
coûte plus cher qu'une case laissée vide et signalée comme telle.
-->

## Ce que ça change, et pourquoi

<!-- Le diff dit déjà QUOI. Dites POURQUOI. Si c'est un correctif, quel était
     le symptôme, et quelle en était la cause réelle. -->

Corrige #

## Comment ça a été vérifié

<!-- Sur quoi : un appareil (lequel, quel système), un simulateur, la suite de
     tests. Si vous n'avez pas pu tester une plateforme, DITES-LE — c'est une
     information utile, pas un aveu. -->

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Essayé sur un appareil Android
- [ ] Essayé sur un appareil iOS

## Points de vigilance de ce dépôt

<!-- Cochez ce qui s'applique. Rayez le reste plutôt que de laisser un doute.
     Le détail de chaque point est dans AGENTS.md et CONTRIBUTING.md. -->

- [ ] Aucune chaîne visible en dur — les **sept** locales sont remplies
- [ ] Aucun style en ligne : `StyleSheet.create` nourri par `src/ui/tokens`
- [ ] Tout composant ajouté à l'écran d'appel pose une **couleur explicite**
      (fond sombre forcé, thème clair par défaut : sans elle, noir sur noir)
- [ ] Chaque conditionnelle ajoutée a un test dont la fixture la rend vraie
      **et** fausse
- [ ] Aucune assertion sur une prop que le composant **consomme** — elle serait
      verte dans les deux états
- [ ] `android/` et `ios/` ne sont pas commités ; le natif passe par un plugin

## Captures

<!-- Pour tout changement visible. Avant / après si vous le pouvez. -->
