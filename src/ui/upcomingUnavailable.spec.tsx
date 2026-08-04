import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { UpcomingUnavailable } from './upcomingUnavailable';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('UpcomingUnavailable', () => {
  // Une ligne par cause, et c'est le POINT du composant : le message dépend de
  // ce que la personne peut y faire, pas de ce qui a techniquement échoué. Une
  // seule cause testée laisserait un message constant passer.
  it('propose de se reconnecter quand la session est perdue', async () => {
    await render(
      <UpcomingUnavailable
        cause="signed-out"
        detail="jeton: no-session"
        onSignIn={jest.fn()}
        testID="u"
      />,
    );

    expect(screen.getByTestId('u-message')).toHaveTextContent('home.agendaSignedOut');
    expect(screen.getByTestId('u-signin')).toBeTruthy();
  });

  it("n'offre AUCUN geste quand le service ne répond pas", async () => {
    // Un bouton « se reconnecter » sur une panne de réseau enverrait la
    // personne se reconnecter pour rien, et lui ferait croire que c'est sa
    // faute. Le panneau se retente seul toutes les minutes.
    await render(
      <UpcomingUnavailable cause="unreachable" detail="502" onSignIn={jest.fn()} testID="u" />,
    );

    expect(screen.getByTestId('u-message')).toHaveTextContent('home.agendaUnreachable');
    expect(screen.queryByTestId('u-signin')).toBe(null);
  });

  it("n'offre aucun geste non plus quand l'instance n'a pas d'agenda", async () => {
    // La troisième cause, et elle n'est PAS redondante avec la deuxième : elles
    // affichent deux phrases différentes, et un composant qui les confondrait
    // dirait « nouvelle tentative dans une minute » pour une situation que rien
    // ne réparera jamais.
    await render(
      <UpcomingUnavailable
        cause="unsupported"
        detail="hôte indéductible"
        onSignIn={jest.fn()}
        testID="u"
      />,
    );

    expect(screen.getByTestId('u-message')).toHaveTextContent('home.agendaUnsupported');
    expect(screen.queryByTestId('u-signin')).toBe(null);
  });

  it('transmet la demande de reconnexion', async () => {
    const onSignIn = jest.fn();

    await render(
      <UpcomingUnavailable
        cause="signed-out"
        detail="jeton: refused"
        onSignIn={onSignIn}
        testID="u"
      />,
    );
    await fireEvent.press(screen.getByTestId('u-signin'));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  // Le détail technique a permis de distinguer « le service a refusé le jeton »
  // de « le panneau n'apparaît pas », les logs JavaScript n'atteignant pas
  // logcat. Le perdre en gagnant une belle phrase serait un mauvais échange :
  // ce test garde sa survie sous la phrase.
  it('garde le détail technique sous le message', async () => {
    await render(
      <UpcomingUnavailable
        cause="unreachable"
        detail="401 aud=[livekit-meet]"
        onSignIn={jest.fn()}
        testID="u"
      />,
    );

    expect(screen.getByTestId('u-detail')).toHaveTextContent('401 aud=[livekit-meet]');
  });

  it('porte une couleur explicite sur le titre et sur le message', async () => {
    await render(
      <UpcomingUnavailable cause="signed-out" detail="x" onSignIn={jest.fn()} testID="u" />,
    );

    expect(screen.getByTestId('u-title')).toHaveStyle({ color: tokens.color.textLight });
    expect(screen.getByTestId('u-message')).toHaveStyle({ color: tokens.color.textSecondary });
  });
});
