import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { InitialsAvatar, initialsOf } from './initialsAvatar';

describe('initialsOf', () => {
  it('prend la première et la dernière initiale d’un nom composé', () => {
    expect(initialsOf('Michel Maudet')).toBe('MM');
  });

  // La branche « un seul mot » doit être empruntée par sa propre fixture,
  // sinon l'implémentation pourrait toujours prendre deux lettres.
  it('prend une seule lettre d’un nom simple', () => {
    expect(initialsOf('Michel')).toBe('M');
  });

  it('saute les prénoms du milieu et prend le dernier mot', () => {
    expect(initialsOf('Jean Pierre Dupont')).toBe('JD');
  });

  it('ignore les espaces surnuméraires', () => {
    expect(initialsOf('  Michel   Maudet  ')).toBe('MM');
  });

  it('met en majuscules un nom saisi en minuscules', () => {
    expect(initialsOf('michel maudet')).toBe('MM');
  });

  // Un nom vide n'a pas d'initiale : rendre une lettre inventée serait pire
  // qu'une pastille vide.
  it('rend une chaîne vide pour un nom vide', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('InitialsAvatar', () => {
  it('pose la couleur explicite du texte, jamais celle du thème', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="md" testID="avatar" />);
    expect(screen.getByTestId('avatar-text')).toHaveStyle({
      color: tokens.color.avatarForeground,
    });
  });

  it('pose la couleur explicite du fond', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="md" testID="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveStyle({
      backgroundColor: tokens.color.avatarBackground,
    });
  });

  it('affiche les initiales', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="md" testID="avatar" />);
    expect(screen.getByTestId('avatar-text')).toHaveTextContent('MM');
  });

  // Trois tailles, trois fixtures : la taille est une conditionnelle, et sans
  // ces trois cas l'implémentation pourrait rendre une constante.
  it.each([
    ['sm', 32],
    ['md', 40],
    ['lg', 56],
  ] as const)('rend la taille %s à %i px', async (size, diameter) => {
    await render(<InitialsAvatar name="Michel Maudet" size={size} testID="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveStyle({ width: diameter, height: diameter });
  });

  it('reste circulaire quelle que soit la taille', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="lg" testID="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveStyle({ borderRadius: 28 });
  });
});
