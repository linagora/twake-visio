module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  // Une correspondance `^assets/(.*)$` a vécu ici, et elle a coûté cher : elle
  // faisait passer sous Jest un spécificateur que **Metro** ne résout pas, donc
  // toute la suite était verte pendant que le serveur de développement rendait
  // un 500 et qu'aucun écran ne s'affichait sur l'appareil. Le commentaire
  // qu'elle portait affirmait l'inverse — « résolu par Metro, pas par Jest ».
  //
  // Les images se requièrent donc par chemin RELATIF, que les deux résolvent de
  // la même façon. Une aide de test qui élargit la résolution au-delà de ce que
  // fait le bundler ne rattrape pas un trou : elle le cache.
  //
  // Le vrai danger d'un `require` d'image non résolu reste entier côté Jest :
  // il fait échouer le CHARGEMENT de la suite, donc le total de tests BAISSE au
  // lieu de rougir, et « 0 failed » se lit comme un succès. Deux suites,
  // 161 tests, avaient disparu ainsi. Compter le total, pas les échecs.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@livekit/.*|react-native-.*))',
  ],
};
