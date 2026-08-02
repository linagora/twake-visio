import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SectionLabel } from './sectionLabel';

describe('SectionLabel', () => {
  // Aucun test ne peut prouver qu'un texte est lisible — RNTL ne rastérise
  // rien. Mais celui-ci prouve que la couleur explicite n'a pas été retirée,
  // et c'est la cause qu'on garde, pas le symptôme.
  it('pose la couleur explicite, jamais celle du thème', async () => {
    await render(<SectionLabel label="7 derniers jours" testID="label" />);
    expect(screen.getByTestId('label')).toHaveStyle({ color: tokens.color.textSectionLabel });
  });

  it('affiche son libellé', async () => {
    await render(<SectionLabel label="7 derniers jours" testID="label" />);
    expect(screen.getByTestId('label')).toHaveTextContent('7 derniers jours');
  });

  // Le mockup capitalise le libellé par le style, pas par la valeur : la
  // traduction reste en casse normale et reste lisible dans le fichier de
  // locale. Muter `textTransform` doit rougir.
  it('capitalise par le style et non par la valeur traduite', async () => {
    await render(<SectionLabel label="7 derniers jours" testID="label" />);
    expect(screen.getByTestId('label')).toHaveStyle({ textTransform: 'uppercase' });
  });
});
