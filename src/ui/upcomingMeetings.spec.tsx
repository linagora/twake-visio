import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { CalendarEvent } from 'src/calendar/ics';
import { UpcomingMeetings } from './upcomingMeetings';

// `t` rend la clé ET ses paramètres. Le double habituel du dépôt ne rend que la
// clé, ce qui aurait rendu ce fichier aveugle à tout ce qui se joue dans les
// paramètres — y compris le remplissage des minutes, le défaut que ce fichier
// existe pour attraper.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`,
  }),
}));

// 2026-08-03 08:00 UTC, l'instant de référence de tous les délais ci-dessous.
const NOW = Date.UTC(2026, 7, 3, 8, 0, 0);
const MINUTE = 60000;
const HOUR = 3600000;

function event(uid: string, startMs: number, summary = 'COCO'): CalendarEvent {
  return {
    uid,
    summary,
    startMs,
    endMs: startMs + HOUR,
    meetUrl: `https://meet.twake-dev.maudet.cloud/${uid}`,
  };
}

function renderPanel(
  events: readonly CalendarEvent[],
  onJoin: (e: CalendarEvent) => void = jest.fn(),
): Promise<unknown> {
  return render(<UpcomingMeetings events={events} now={NOW} onJoin={onJoin} />);
}

describe('UpcomingMeetings', () => {
  it('rend une ligne par évènement', async () => {
    await renderPanel([event('a', NOW + HOUR), event('b', NOW + 2 * HOUR)]);

    expect(screen.getByTestId('upcoming-row-a')).toBeOnTheScreen();
    expect(screen.getByTestId('upcoming-row-b')).toBeOnTheScreen();
    expect(screen.queryByTestId('upcoming-empty')).toBe(null);
  });

  it('rend le message « rien de prévu » sur une liste vide, et aucune ligne', async () => {
    // L'autre polarité de la même conditionnelle. Une liste vide n'est PAS une
    // panne : le calendrier a répondu, il n'y a rien. Voir `UpcomingState`.
    await renderPanel([]);

    expect(screen.getByTestId('upcoming-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('upcoming-row-a')).toBe(null);
  });

  it("affiche l'heure de début, sur deux chiffres", async () => {
    // Construit en heure LOCALE : c'est la lecture qu'on vérifie, pas la
    // conversion de fuseau, qui appartient à `ics.ts`.
    const nineThirty = new Date(2026, 7, 3, 9, 30, 0).getTime();
    await renderPanel([event('a', nineThirty)]);

    expect(screen.getByTestId('upcoming-clock-a')).toHaveTextContent('09:30');
  });

  it('affiche le résumé de la réunion', async () => {
    await renderPanel([event('a', NOW + HOUR, 'COMEX')]);

    expect(screen.getByTestId('upcoming-title-a')).toHaveTextContent('COMEX');
  });

  it('dit « en cours » pour une réunion commencée', async () => {
    await renderPanel([event('a', NOW - MINUTE)]);

    expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent('home.upcoming.ongoing');
  });

  it('compte en minutes en deçà d’une heure', async () => {
    await renderPanel([event('a', NOW + 25 * MINUTE)]);

    expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
      'home.upcoming.inMinutes {"minutes":25}',
    );
  });

  it('compte en heures et minutes au-delà', async () => {
    await renderPanel([event('a', NOW + 3 * HOUR + 39 * MINUTE)]);

    expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
      'home.upcoming.inHours {"hours":3,"minutes":"39"}',
    );
  });

  it('remplit les minutes à deux chiffres, sans quoi on lit « 3 h 9 »', async () => {
    // Mesuré sur appareil le 2026-08-03 : le panneau affichait « dans 3 h 9 »
    // pour une réunion à 3 h 09. Le gabarit des sept langues est
    // « {{hours}} h {{minutes}} », une lecture d'horloge : les minutes s'y
    // écrivent sur deux chiffres ou ne s'y écrivent pas.
    await renderPanel([event('a', NOW + 3 * HOUR + 9 * MINUTE)]);

    expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
      'home.upcoming.inHours {"hours":3,"minutes":"09"}',
    );
  });

  it('ne pose un filet que sur les lignes suivantes, jamais la première', async () => {
    await renderPanel([event('a', NOW + HOUR), event('b', NOW + 2 * HOUR)]);

    expect(screen.getByTestId('upcoming-row-a')).not.toHaveStyle({
      borderTopWidth: StyleSheet.hairlineWidth,
    });
    expect(screen.getByTestId('upcoming-row-b')).toHaveStyle({
      borderTopWidth: StyleSheet.hairlineWidth,
    });
  });

  it('« Rejoindre » remonte CET évènement, pas le premier de la liste', async () => {
    // Deux lignes, et c'est la seconde qu'on presse : avec une seule, un
    // gestionnaire qui remonterait toujours `events[0]` passerait aussi.
    const onJoin = jest.fn();
    const second = event('b', NOW + 2 * HOUR, 'Point BC');
    await renderPanel([event('a', NOW + HOUR), second], onJoin);

    await fireEvent.press(screen.getByTestId('upcoming-join-b'));

    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith(second);
  });
});
