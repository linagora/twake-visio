import { render, screen } from '@testing-library/react-native';
import React from 'react';

import WelcomeScreen from './welcome';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WelcomeScreen', () => {
  it('propose les trois entrées exigées', async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByTestId('sign-in-btn')).not.toBeNull();
    expect(screen.queryByTestId('sign-up-btn')).not.toBeNull();
    expect(screen.queryByTestId('org-server-btn')).not.toBeNull();
  });
});
