export type ColorScheme = 'light' | 'dark';

// Deux familles de jetons cohabitent ici, et elles n'obéissent pas à la même
// règle. Ne pas les mélanger.
//
// 1. Les jetons `*Light` / `*Dark` ci-dessous sont l'ancien jeu, conservé parce
//    que l'ÉCRAN D'APPEL les consomme en littéraux. Chacun porte une variante
//    par schéma : une valeur unique partagée échoue au contraste sur l'un des
//    deux fonds — #C62828 sur #0B0B0C donne 3,4:1, sous le seuil AA de 4,5:1.
//
// 2. Les jetons du système visuel de la coque, plus bas, n'ont PAS de variante
//    par schéma, et c'est délibéré : depuis le Lot 1 de la refonte, `makeTheme`
//    rend toujours le thème clair. Voir le commentaire de tête de
//    `src/ui/theme.ts` pour ce que cela achète et ce que cela coûte.
export const tokens = {
  color: {
    primaryLight: '#0057B8',
    primaryDark: '#4D9AFF',
    onPrimaryLight: '#FFFFFF',
    onPrimaryDark: '#0B1B2B',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#121212',
    backgroundLight: '#F5F7FA',
    backgroundDark: '#0B0B0C',
    textLight: '#1A1A1A',
    textDark: '#ECECEC',
    dangerLight: '#C62828',
    dangerDark: '#FF8A80',
    successLight: '#2E7D32',
    successDark: '#81C784',
    muted: '#6B7280',

    // — Système visuel de la coque —
    //
    // Transcrit du projet Claude Design « Twake Visio, navigation mobile »,
    // fichier VisioPhone.dc.html. Ces jetons n'ont PAS de variante par schéma,
    // et c'est délibéré : `makeTheme` rend toujours le thème clair, la coque
    // étant claire dans le mockup et l'appel gardant ses couleurs explicites.
    // Voir le commentaire de tête de `src/ui/theme.ts`.
    //
    // Cinq valeurs du mockup échouaient WCAG AA et ont été assombries au
    // minimum, à teinte préservée. Le mockup est un document web ; ce dépôt
    // impose 4,5:1 pour du texte, et `theme.spec.ts` le vérifie.
    //
    //   rôle                 mockup         ratio   retenu          ratio
    //   texte de bouton      blanc/#1FA45C   3,22   blanc/#177E44    5,12
    //   méta                 #767E79         4,17   #717874          4,52
    //   libellé de section   #8A928D         2,97   #6D7370          4,50
    //   onglet inactif       #939B96         2,85   #727875          4,51
    //   pied de page         #A6ADA9         2,25   #6E7270          4,53
    //   danger (texte)       #D93B3B         4,21   #D03939          4,51
    //
    // Le danger est mesuré sur `appBackground`, pas sur une carte : il y porte
    // « Se déconnecter », et c'est le fond le moins favorable des deux.
    //
    // `brand` ne porte JAMAIS de texte : du blanc dessus ne donne que 3,22:1.
    // C'est un accent — remplissage, anneau, pastille d'onglet actif — et sur
    // fond BLANC seulement : sur `appBackground` il tombe à 2,99, sous le seuil
    // non textuel de 3:1 lui-même. Le vert qui porte du texte est `brandStrong`.
    brand: '#1FA45C',
    brandStrong: '#177E44',
    brandWash: '#EAF6EF',
    onBrand: '#FFFFFF',

    // — Les deux dégradés de marque, et leur correction —
    //
    // Le mockup en pose deux : la tuile-logo (160°) et la carte d'action de
    // l'accueil (150°). Aucun des deux ne porte du blanc de façon accessible,
    // exactement comme cinq valeurs de la palette du Lot 1 : c'est un document
    // web, écrit sans passe d'accessibilité.
    //
    //   rôle                    mockup              blanc   retenu     blanc
    //   tuile, butée claire     #2FBE6C              2,41   #2AA960     3,02
    //   tuile, butée foncée     #159049              4,10   #138041     5,01
    //   carte, butée claire     #26B166              2,78   #1D874E     4,54
    //   carte, butée foncée     #158B48              4,36   #106A37     6,69
    //
    // La butée CLAIRE gouverne : c'est là que le contraste est le pire, et un
    // dégradé ne « moyenne » pas — un glyphe posé dessus rencontre les deux.
    //
    // Deux seuils différents, et c'est voulu : la tuile ne porte qu'un GLYPHE,
    // soumis aux 3:1 du non-textuel (WCAG 1.4.11) ; la carte porte un TITRE,
    // soumis aux 4,5:1 du texte. D'où deux facteurs d'assombrissement, 0,892 et
    // 0,765, appliqués aux DEUX butées pour que le dégradé garde son caractère.
    tileGradientFrom: '#2AA960',
    tileGradientTo: '#138041',
    cardGradientFrom: '#1D874E',
    cardGradientTo: '#106A37',

    appBackground: '#F5F7F6',
    cardSurface: '#FFFFFF',
    // Traits DÉCORATIFS. Ils ne portent aucune information nécessaire pour
    // identifier une commande — une carte se voit à son fond, notre champ de
    // recherche à sa loupe et à son texte indicatif — donc WCAG 1.4.11 ne
    // s'applique pas et les valeurs du mockup sont conservées telles quelles.
    cardBorder: '#E7EBE9',
    rowSeparator: '#F0F3F1',
    fieldBorder: '#E1E6E3',
    // Le trait qui EST l'affordance : celui que Paper dessine autour d'un
    // `TextInput` en mode `outlined`, où rien d'autre ne délimite la commande.
    // Là, 1.4.11 s'applique. `#E1E6E3` n'y donne que 1,26:1 ; #7C847F donne
    // 3,84:1 sur une carte et 3,57:1 sur le fond. Ne pas confondre les deux
    // rôles : c'est l'erreur que `theme.spec.ts` a attrapée.
    controlOutline: '#7C847F',

    textPrimary: '#141815',
    textSecondary: '#5A625D',
    textMeta: '#717874',
    textSectionLabel: '#6D7370',
    textTabInactive: '#727875',
    // Glyphe décoratif, soumis au seuil NON textuel de 3:1 (WCAG 1.4.11) et non
    // à celui du texte : #8F9692 donne 3,02:1 sur une carte blanche.
    textChevron: '#8F9692',
    textFooter: '#6E7270',

    danger: '#D03939',
    avatarBackground: '#F2C879',
    avatarForeground: '#6A4B10',
  },
  // Les clés passées à `useFonts` ; ce sont elles, pas les chemins, que
  // `fontFamily` attend ensuite.
  //
  // Ces noms sont ceux qu'exporte `@expo-google-fonts/manrope`, repris tels
  // quels plutôt que réinventés : le paquet nomme ses constantes
  // `Manrope_500Medium`, et une clé qui n'y correspondrait pas chargerait un
  // fichier sous un nom que `fontFamily` ne retrouverait jamais — sans erreur,
  // avec un simple repli silencieux sur la police système.
  //
  // Quatre graisses et AUCUNE Regular : mesuré sur le mockup, 800 (×53),
  // 700 (×51), 500 (×14), 600 (×12), aucun `font-weight:400`.
  font: {
    medium: 'Manrope_500Medium',
    semiBold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extraBold: 'Manrope_800ExtraBold',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 16, card: 18, pill: 999 },
  typography: {
    body: { fontSize: 16, lineHeight: 24 },
    title: { fontSize: 22, lineHeight: 28 },
    caption: { fontSize: 13, lineHeight: 18 },
    sectionLabel: { fontSize: 12, lineHeight: 16, letterSpacing: 1 },
    rowTitle: { fontSize: 15, lineHeight: 20 },
    rowHint: { fontSize: 12, lineHeight: 17 },
    tabLabel: { fontSize: 11, lineHeight: 14 },
    screenTitle: { fontSize: 19, lineHeight: 24, letterSpacing: -0.4 },
  },
} as const;
