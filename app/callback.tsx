// Route mince : voir app/welcome.tsx.
//
// Elle n'existe que pour donner une cible à la redirection OIDC, qu'expo-router
// route malgré nous. Voir le commentaire de src/screens/callback.tsx.
export { CallbackScreen as default } from 'src/screens/callback';
