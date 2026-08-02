import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SettingRow } from './settingRow';

const OPTIONS = [
  { id: 'off', label: 'Coupé' },
  { id: 'on', label: 'Actif' },
];

type Overrides = Partial<React.ComponentProps<typeof SettingRow>>;

function renderRow(overrides: Overrides = {}): Promise<unknown> {
  return render(
    <SettingRow
      currentLabel="Coupé"
      hint="Valeur appliquée à chaque réunion que vous rejoignez"
      label="Micro à l’entrée en réunion"
      onOptionPress={jest.fn()}
      onRowPress={jest.fn()}
      open={false}
      options={OPTIONS}
      selectedId="off"
      testID="row"
      {...overrides}
    />,
  );
}

describe('SettingRow', () => {
  it('pose la couleur explicite du libellé', async () => {
    await renderRow();
    expect(screen.getByTestId('row-label')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  // `brandStrong` et non `brand` : #1FA45C ne donne que 3,22:1 et ceci est du
  // texte. La garde vaut donc autant pour la couleur choisie que pour sa
  // présence.
  it('pose la couleur explicite de la valeur courante', async () => {
    await renderRow();
    expect(screen.getByTestId('row-current')).toHaveStyle({ color: tokens.color.brandStrong });
  });

  it('affiche le libellé, la valeur courante et le hint', async () => {
    await renderRow();
    expect(screen.getByTestId('row-label')).toHaveTextContent('Micro à l’entrée en réunion');
    expect(screen.getByTestId('row-current')).toHaveTextContent('Coupé');
    expect(screen.getByTestId('row-hint')).toBeTruthy();
  });

  // Le hint est optionnel depuis que la rangée caméra a perdu le sien : il
  // répétait mot pour mot celui de la rangée micro, juste au-dessus.
  it('ne rend aucun hint quand on ne lui en donne pas', async () => {
    await renderRow({ hint: undefined });
    expect(screen.queryByTestId('row-hint')).toBe(null);
  });

  // Repliée / dépliée : la conditionnelle prend ses deux valeurs, et
  // l'assertion observe le RENDU — jamais la prop `open`, que le composant
  // consomme lui-même et qui vaudrait `undefined` sur l'élément hôte.
  it('ne rend aucune option quand elle est repliée', async () => {
    await renderRow({ open: false });
    expect(screen.queryByTestId('row-option-off')).toBe(null);
    expect(screen.queryByTestId('row-option-on')).toBe(null);
  });

  it('rend une option par choix quand elle est dépliée', async () => {
    await renderRow({ open: true });
    expect(screen.getByTestId('row-option-off')).toBeTruthy();
    expect(screen.getByTestId('row-option-on')).toBeTruthy();
  });

  it('coche l’option sélectionnée, et elle seule', async () => {
    await renderRow({ open: true, selectedId: 'on' });
    expect(screen.getByTestId('row-check-on')).toBeTruthy();
    expect(screen.queryByTestId('row-check-off')).toBe(null);
  });

  // La fixture doit sélectionner l'AUTRE option aussi, sinon un `=== 'on'`
  // codé en dur passerait.
  it('déplace la coche quand la sélection change', async () => {
    await renderRow({ open: true, selectedId: 'off' });
    expect(screen.getByTestId('row-check-off')).toBeTruthy();
    expect(screen.queryByTestId('row-check-on')).toBe(null);
  });

  it('marque l’option sélectionnée par son fond', async () => {
    await renderRow({ open: true, selectedId: 'on' });
    expect(screen.getByTestId('row-option-on')).toHaveStyle({
      backgroundColor: tokens.color.brandWash,
    });
  });

  it('appelle onRowPress quand on presse l’en-tête', async () => {
    const onRowPress = jest.fn();
    await renderRow({ onRowPress });
    await fireEvent.press(screen.getByTestId('row-header'));
    expect(onRowPress).toHaveBeenCalledTimes(1);
  });

  it('appelle onOptionPress avec l’identifiant de l’option pressée', async () => {
    const onOptionPress = jest.fn();
    await renderRow({ onOptionPress, open: true });
    await fireEvent.press(screen.getByTestId('row-option-on'));
    expect(onOptionPress).toHaveBeenCalledWith('on');
  });

  // Une ligne par option : sans elle, un `options[0].id` codé en dur passerait
  // le test précédent.
  it('distingue les options entre elles', async () => {
    const onOptionPress = jest.fn();
    await renderRow({ onOptionPress, open: true });
    await fireEvent.press(screen.getByTestId('row-option-off'));
    expect(onOptionPress).toHaveBeenCalledWith('off');
  });
});
