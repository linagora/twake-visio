module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  // `assets/…` est résolu par Metro, pas par Jest. Sans cette correspondance,
  // un `require` d'image fait échouer le CHARGEMENT de la suite entière — donc
  // le total de tests BAISSE au lieu de rougir, et « 0 failed » se lit comme un
  // succès. Deux suites, 161 tests, avaient disparu ainsi.
  //
  // `moduleNameMapper` et non `moduleDirectories` : le second ajoute la racine
  // au chemin de résolution de TOUS les modules, et fait alors passer des
  // imports qui devraient échouer — essayé, il cassait deux autres suites.
  moduleNameMapper: { '^assets/(.*)$': '<rootDir>/assets/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@livekit/.*|react-native-.*))',
  ],
};
