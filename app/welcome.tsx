// Route mince : expo-router exige un export default sous app/, et son
// require.context balaie tout .tsx du dossier — un spec colocalisé ici
// entrerait dans le bundle de production. L'écran vit donc dans src/screens.
export { WelcomeScreen as default } from 'src/screens/welcome';
