import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type BrandTileSize = 'sm' | 'lg';

type Props = {
  readonly size: BrandTileSize;
  readonly testID: string;
};

// Le côté et le rayon sont posés SÉPARÉMENT par le mockup — 32/10 et 92/26 —
// et le second n'est pas proportionnel au premier. Les dériver l'un de l'autre
// donnerait une petite tuile trop ronde.
const SIDE: Readonly<Record<BrandTileSize, number>> = { sm: 32, lg: 92 };
const RADIUS: Readonly<Record<BrandTileSize, number>> = { sm: 10, lg: 26 };
const GLYPH: Readonly<Record<BrandTileSize, number>> = { sm: 18, lg: 46 };

// La tuile de marque : le carré vert à dégradé qui porte le glyphe caméra.
//
// C'est l'un des deux seuls endroits de l'application qui emploient un dégradé,
// avec `ActionCard`. Un aplat `brand` en ferait un carré vert uni, ce qui se
// voit surtout en 92 px sur l'écran de connexion.
//
// `colors`, `start` et `end` sont des props que `LinearGradient` CONSOMME : ne
// rien assertir dessus, ce serait vert dans les deux états. Le spec observe la
// taille du conteneur et la couleur du glyphe, qui sont joignables.
export function BrandTile({ size, testID }: Props): React.ReactElement {
  const side = SIDE[size];
  return (
    <LinearGradient
      colors={[tokens.color.tileGradientFrom, tokens.color.tileGradientTo]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[styles.tile, { borderRadius: RADIUS[size], height: side, width: side }]}
      testID={testID}
    >
      <MaterialCommunityIcons
        color={tokens.color.onBrand}
        name="video-outline"
        size={GLYPH[size]}
        testID={`${testID}-glyph`}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
