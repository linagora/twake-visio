export type ColorScheme = 'light' | 'dark';

// Toute couleur d'avant-plan porte une variante par schéma. Une valeur unique
// partagée entre clair et sombre échoue au contraste sur l'un des deux fonds :
// #C62828 sur #0B0B0C donne 3,4:1, sous le seuil WCAG AA de 4,5:1.
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
