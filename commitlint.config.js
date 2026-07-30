module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // This project uses an imperative, sentence-case subject (first letter
    // uppercase), matching the repository's existing commit history. The
    // default config only forbids the other non-conforming case styles.
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
  },
};
