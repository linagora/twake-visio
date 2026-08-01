// Route mince : voir app/welcome.tsx.
//
// La cible de l'App Link HTTPS sur lequel le SSO renvoie. Elle n'affiche rien
// d'autre que l'écran de rappel existant : `openAuthSessionAsync` intercepte
// l'URL avant tout rendu, et cette route n'existe que pour qu'expo-router ait
// une destination si jamais elle est atteinte.
export { CallbackScreen as default } from 'src/screens/callback';
