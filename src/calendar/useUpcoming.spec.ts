import { renderHook, waitFor } from '@testing-library/react-native';

import * as accounts from 'src/auth/accounts';
import * as session from 'src/auth/session';
import type { CalendarEvent } from 'src/calendar/ics';
import * as sideService from 'src/calendar/sideService';
import { useUpcomingMeetings } from 'src/calendar/useUpcoming';

// Espionné par le namespace, et non par `require` : ce sont NOS modules, donc
// `__esModule` est vrai et `jest.spyOn` atteint bien la liaison que voit le
// crochet. La borne d'`AGENTS.md` ne vise que `react-native`, dont les exports
// sont des accesseurs recopiés par l'interop. Précédent : `call.spec.tsx`.

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.twake-dev.maudet.cloud',
    issuer: 'https://sso.linagora.com',
    clientId: 'livekit-meet',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

function anEvent(): CalendarEvent {
  const startMs = Date.now() + 3600000;
  return {
    uid: 'evt-1',
    summary: 'COCO',
    startMs,
    endMs: startMs + 3600000,
    meetUrl: 'https://meet.twake-dev.maudet.cloud/mjj-beyv-zai',
  };
}

// L'erreur telle que `getJson` la jette. Sa forme est le CONTRAT entre les deux
// modules, et `sideService.spec.ts` garde l'autre bout : que le pont pose bien
// `status` sur l'erreur d'une réponse refusée.
function httpError(status: number): Error {
  return Object.assign(new Error(`https://side/api/user: ${status}`), { status });
}

describe('useUpcomingMeetings', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'jeton-cache' });
    jest.spyOn(session, 'forceRefresh').mockResolvedValue({ ok: true, token: 'jeton-neuf' });
  });

  // Le cas mesuré le 2026-08-03 : l'audience du client OIDC a été corrigée
  // côté LemonLDAP, mais le jeton DÉJÀ en cache porte encore l'ancienne, et
  // `getAccessToken` le rend tel quel jusqu'à trente secondes de son
  // expiration. Sans ce rejeu, le panneau reste masqué jusqu'à une heure
  // après un correctif serveur déjà en place.
  it('rejoue avec un jeton neuf quand le service rend 401', async () => {
    const fetchUpcoming = jest
      .spyOn(sideService, 'fetchUpcoming')
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce([anEvent()]);

    const view = await renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(session.forceRefresh).toHaveBeenCalledTimes(1);
    // Le rejeu doit porter le jeton NEUF : rejouer le même serait un appel de
    // plus et le même refus.
    expect(fetchUpcoming).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'jeton-neuf',
      expect.any(Number),
    );
  });

  // L'autre polarité de la même conditionnelle. Sans elle, un rejeu
  // INCONDITIONNEL passerait aussi bien.
  it('ne rejoue pas sur un code autre que 401', async () => {
    jest.spyOn(sideService, 'fetchUpcoming').mockRejectedValue(httpError(503));

    const view = await renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(view.result.current.status).toBe('unavailable'));
    expect(session.forceRefresh).not.toHaveBeenCalled();
  });

  // La garde qui empêche la boucle : un jeton neuf refusé lui aussi ne doit
  // pas relancer un renouvellement. Sans elle, un service définitivement
  // fermé ferait tourner le SSO en rond.
  it('ne renouvelle qu’une fois quand le jeton neuf est refusé aussi', async () => {
    const fetchUpcoming = jest
      .spyOn(sideService, 'fetchUpcoming')
      .mockRejectedValue(httpError(401));

    const view = await renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(view.result.current.status).toBe('unavailable'));
    expect(session.forceRefresh).toHaveBeenCalledTimes(1);
    expect(fetchUpcoming).toHaveBeenCalledTimes(2);
  });

  // Le renouvellement peut échouer — SSO injoignable, session révoquée. Le
  // panneau se masque, et l'appel refusé ne doit pas être rejoué.
  it('se masque quand le renouvellement échoue', async () => {
    const fetchUpcoming = jest
      .spyOn(sideService, 'fetchUpcoming')
      .mockRejectedValue(httpError(401));
    jest.spyOn(session, 'forceRefresh').mockResolvedValue({ ok: false, reason: 'unavailable' });

    const view = await renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(view.result.current.status).toBe('unavailable'));
    expect(fetchUpcoming).toHaveBeenCalledTimes(1);
  });

  it('rend les évènements quand le premier appel réussit', async () => {
    jest.spyOn(sideService, 'fetchUpcoming').mockResolvedValue([anEvent()]);

    const view = await renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(session.forceRefresh).not.toHaveBeenCalled();
  });
});
