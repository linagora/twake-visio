import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { CalendarEvent } from 'src/calendar/ics';
import { tokens } from 'src/ui/tokens';
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
  handlers: {
    readonly onJoin?: (e: CalendarEvent) => void;
    readonly onOpenEvent?: (e: CalendarEvent) => void;
  } = {},
): Promise<unknown> {
  return render(
    <UpcomingMeetings
      events={events}
      now={NOW}
      onJoin={handlers.onJoin ?? jest.fn()}
      onOpenEvent={handlers.onOpenEvent ?? jest.fn()}
    />,
  );
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

  describe('le décompte', () => {
    it('dit « en cours » pour une réunion commencée', async () => {
      await renderPanel([event('a', NOW - MINUTE)]);

      expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent('home.upcoming.ongoing');
    });

    it('compte en minutes ET secondes en deçà d’une heure', async () => {
      await renderPanel([event('a', NOW + 25 * MINUTE + 7000)]);

      expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
        'home.upcoming.inMinutes {"minutes":25,"seconds":"07"}',
      );
    });

    it('compte en heures, minutes ET secondes au-delà', async () => {
      await renderPanel([event('a', NOW + 3 * HOUR + 39 * MINUTE + 42000)]);

      expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
        'home.upcoming.inHours {"hours":3,"minutes":"39","seconds":"42"}',
      );
    });

    // L'unité de TÊTE est un compte, celles qui suivent sont des positions
    // d'horloge. « dans 9 min » se lit, « dans 09 min » non ; mais « 3 h 9 »
    // n'existe pas, et un décompte dont les chiffres changent de largeur
    // chaque seconde sautille.
    it('remplit les unités subordonnées, jamais celle de tête', async () => {
      await renderPanel([
        event('a', NOW + 9 * MINUTE + 5000),
        event('b', NOW + 3 * HOUR + 9 * MINUTE + 5000),
      ]);

      expect(screen.getByTestId('upcoming-when-a')).toHaveTextContent(
        'home.upcoming.inMinutes {"minutes":9,"seconds":"05"}',
      );
      expect(screen.getByTestId('upcoming-when-b')).toHaveTextContent(
        'home.upcoming.inHours {"hours":3,"minutes":"09","seconds":"05"}',
      );
    });
  });

  describe('la pastille « en cours »', () => {
    // Ce que RNTL peut prouver : la pastille est RENDUE, et elle porte la
    // couleur voulue. Ce qu'il ne peut pas : qu'elle clignote — rien n'est
    // rastérisé, et l'animation est pilotée hors du fil JavaScript.
    it('pose une pastille sur une réunion commencée', async () => {
      await renderPanel([event('a', NOW - MINUTE)]);

      expect(screen.getByTestId('upcoming-live-a')).toHaveStyle({
        backgroundColor: tokens.color.danger,
      });
    });

    it('ne pose aucune pastille sur une réunion à venir', async () => {
      // L'autre polarité : sans ce cas, une pastille INCONDITIONNELLE passerait.
      await renderPanel([event('a', NOW + MINUTE)]);

      expect(screen.queryByTestId('upcoming-live-a')).toBe(null);
    });
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

  describe('les deux commandes de la ligne', () => {
    // Deux lignes, et c'est la SECONDE qu'on presse : avec une seule, un
    // gestionnaire qui remonterait toujours `events[0]` passerait aussi.
    it('« Rejoindre » remonte CET évènement, pas le premier de la liste', async () => {
      const onJoin = jest.fn();
      const second = event('b', NOW + 2 * HOUR, 'Point BC');
      await renderPanel([event('a', NOW + HOUR), second], { onJoin });

      await fireEvent.press(screen.getByTestId('upcoming-join-b'));

      expect(onJoin).toHaveBeenCalledTimes(1);
      expect(onJoin).toHaveBeenCalledWith(second);
    });

    it("l'icône agenda remonte CET évènement, et ne rejoint rien", async () => {
      const onJoin = jest.fn();
      const onOpenEvent = jest.fn();
      const second = event('b', NOW + 2 * HOUR, 'Point BC');
      await renderPanel([event('a', NOW + HOUR), second], { onJoin, onOpenEvent });

      await fireEvent.press(screen.getByTestId('upcoming-calendar-b'));

      expect(onOpenEvent).toHaveBeenCalledTimes(1);
      expect(onOpenEvent).toHaveBeenCalledWith(second);
      // Les deux commandes sont voisines dans la même ligne : presser l'une ne
      // doit pas déclencher l'autre.
      expect(onJoin).not.toHaveBeenCalled();
    });

    it('teinte le glyphe agenda en textSecondary', async () => {
      // `color` est une prop que `MaterialCommunityIcons` CONSOMME — elle
      // n'atteint pas l'élément hôte. Ce qu'on observe est la conséquence : le
      // STYLE du `Text` que le glyphe rend. Précédent : `tabBarIcon.spec.tsx`.
      await renderPanel([event('a', NOW + HOUR)]);

      expect(screen.getByTestId('upcoming-calendar-a-glyph')).toHaveStyle({
        color: tokens.color.textSecondary,
      });
    });
  });
});
