import * as client from 'src/api/client';
import { startRecording, stopRecording } from 'src/api/recording';
import type { Account } from 'src/auth/accounts';

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
} as Account;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('startRecording', () => {
  it('poste sur la route du salon visé', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await startRecording(ACCOUNT, 'r-2');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-2/start-recording/');
    expect((spy.mock.calls[0]?.[2] as RequestInit).method).toBe('POST');

    // Un seul salon vérifié ne distingue pas un identifiant transmis d'une
    // route codée en dur qui coïnciderait avec celui-ci : un second salon,
    // distinct, est nécessaire pour lever le doute.
    await startRecording(ACCOUNT, 'r-9');

    expect(spy.mock.calls[1]?.[1]).toBe('/api/v1.0/rooms/r-9/start-recording/');
  });

  it('rend un succès sans valeur', async () => {
    // Les trois tests d'échec ci-dessous ne distinguent pas `toVoid(result)`
    // d'un simple retour de `result` : la branche d'échec de `toVoid` ne fait
    // rien d'autre que renvoyer `result` tel quel. Seul un succès portant une
    // valeur brute peut prouver que cette valeur est bien effacée.
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: true, value: { recording_id: 'rec-1' } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('n’envoie que le mode, et rien d’autre', async () => {
    // `RecordingOptions` porte `extra: "forbid"` : une clé de trop fait échouer
    // la validation côté serveur. `toEqual` sur l'objet entier est donc
    // l'assertion qui compte, pas une lecture de `body.mode`.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await startRecording(ACCOUNT, 'r-1');

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'screen_recording' });
  });

  it('rend un échec de permission comme une valeur, sans lever', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 409 comme une valeur, avec son statut intact', async () => {
    // C'est ce statut, et lui seul, que `recordingErrorMessage` distingue :
    // l'écraser en `server` sans statut rendrait « déjà en cours »
    // inatteignable.
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 409 } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 409 } });
  });

  it('rend un 502 comme une valeur, distinct du 409', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 502 } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 502 } });
  });
});

describe('stopRecording', () => {
  it('poste sur la route du salon visé', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await stopRecording(ACCOUNT, 'r-3');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-3/stop-recording/');
    expect((spy.mock.calls[0]?.[2] as RequestInit).method).toBe('POST');

    // Même raison que côté startRecording : un second salon, distinct,
    // écarte une route codée en dur qui coïnciderait avec le premier.
    await stopRecording(ACCOUNT, 'r-8');

    expect(spy.mock.calls[1]?.[1]).toBe('/api/v1.0/rooms/r-8/stop-recording/');
  });

  it('n’envoie ni corps ni content-type', async () => {
    // Un `content-type: application/json` sur un corps vide fait échouer le
    // parseur JSON de DRF, et le 400 qui en sortirait serait indiscernable
    // d'une requête mal formée.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await stopRecording(ACCOUNT, 'r-1');

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('rend le 404 comme une valeur', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'not-found' } });

    const result = await stopRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('rend un succès sans valeur', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: true, value: { message: 'Recording stopped' } });

    const result = await stopRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: undefined });
  });
});
