import { Platform } from 'react-native';

import { keyboardMode } from 'src/ui/keyboard';

describe('keyboardMode', () => {
  it("rend 'padding' sur iOS, où le clavier se superpose à la fenêtre", () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    expect(keyboardMode()).toBe('padding');
  });

  it("rend 'resize' ailleurs, où la fenêtre a déjà rétréci", () => {
    // Les deux branches, jamais une seule : avec une seule, une constante en
    // dur serait indiscernable d'une lecture correcte de la plateforme. Même
    // convention que `audioRoute.spec.ts`.
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(keyboardMode()).toBe('resize');
  });
});
