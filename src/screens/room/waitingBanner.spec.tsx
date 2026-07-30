import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { WaitingBanner } from './waitingBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ADA = { id: 'p-1', username: 'Ada' };

describe('WaitingBanner', () => {
  it("ne s'affiche pas quand personne n'attend", async () => {
    await render(<WaitingBanner participant={null} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-banner')).toBe(null);
  });

  it('admet la personne affichée', async () => {
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-admit'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', true);
  });

  it('refuse la personne affichée', async () => {
    // Admettre et refuser partent vers le même endpoint : inverser le booléen
    // laisserait entrer qui on voulait écarter.
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-refuse'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', false);
  });

  it('annonce les personnes restantes', async () => {
    await render(<WaitingBanner participant={ADA} remaining={2} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-others')).toBeTruthy();
  });

  it("n'annonce rien quand personne d'autre n'attend", async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-others')).toBe(null);
  });
});
