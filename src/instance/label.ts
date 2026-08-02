// L'hôte, pas l'URL entière : c'est lui qui distingue deux instances, et une
// même personne porte souvent la MÊME adresse sur les deux — mesuré, un compte
// de développement dont le `mail` de l'annuaire est celui de production. Afficher
// l'adresse seule ne dirait donc pas où l'on est.
//
// Vivait dans `src/screens/home.tsx` tant que l'accueil portait le bandeau de
// compte. Le Lot 2 de la refonte l'a déplacé vers Réglages, où le mockup met
// l'identité ; la fonction a suivi l'information plutôt que de rester dans un
// écran qui ne l'emploie plus.
export function instanceLabel(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}
