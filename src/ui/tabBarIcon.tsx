import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

// Les trois glyphes du mockup. Vérifiés présents dans la table de
// `MaterialCommunityIcons` : un nom absent rend un carré vide, sans erreur.
export type TabGlyph = 'video-outline' | 'clock-outline' | 'cog-outline';

type Props = {
  readonly focused: boolean;
  readonly name: TabGlyph;
  readonly testID: string;
};

// L'icône d'un onglet, dans sa pastille.
//
// Elle vit ici et non dans `app/(tabs)/_layout.tsx` parce qu'un fichier sous
// `app/` ne porte aucune logique — la règle d'`AGENTS.md` — et parce que la
// pastille est la seule chose de cette barre qui mérite un test.
//
// La pastille est ce qui a imposé un rendu à nous : `tabBarActiveTintColor`
// teinte le glyphe et le libellé, mais aucune option de la barre ne pose un
// fond arrondi derrière la seule icône.
//
// `brandStrong` et non `brand` pour le glyphe : #1FA45C sur blanc ne donne que
// 3,22:1, assez pour le REMPLISSAGE de la pastille — un aplat, seuil 3:1 — mais
// on veut le glyphe aussi net que le libellé qu'il coiffe, lequel est du texte.
export function TabBarIcon({ focused, name, testID }: Props): React.ReactElement {
  return (
    <View style={[styles.pill, focused ? styles.pillActive : null]} testID={testID}>
      <MaterialCommunityIcons
        color={focused ? tokens.color.brandStrong : tokens.color.textTabInactive}
        name={name}
        size={22}
        testID={`${testID}-glyph`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: 9,
    height: 26,
    justifyContent: 'center',
    width: 34,
  },
  pillActive: { backgroundColor: tokens.color.brandWash },
});
