/**
 * Double manuel de `@livekit/react-native-webrtc`.
 *
 * L'index du vrai paquet construit un `NativeEventEmitter` au chargement du
 * module (`AudioDeviceModuleEvents.ts` → `EventEmitter.ts`), sur un module
 * natif qui n'existe pas sous Jest. L'import jette donc avant même qu'une
 * fonction ne soit appelée, et il jette pour toute suite qui importe
 * `src/call/media.ts` — soit `media.spec.ts`, `call.spec.tsx` et
 * `prejoin.spec.tsx`, sur un message qui ne nomme ni caméra ni périphérique.
 *
 * Placé à côté de `node_modules`, Jest le substitue automatiquement partout,
 * sans `jest.mock(...)` — même mécanisme que `__mocks__/@livekit/react-native.ts`.
 *
 * `enumerateDevices` est un `jest.fn()` rendant `Promise<unknown>`, la
 * signature réelle : le vrai passe-plat ne type pas son résultat, et c'est ce
 * qui justifie le module de parsing de `src/call/devices.ts`.
 */
/**
 * Une piste que l'on peut arrêter, et qui SAIT qu'elle l'a été.
 *
 * `stop()` en `jest.fn()` nu suffirait à vérifier l'appel, mais pas à
 * distinguer « arrêtée une fois » de « arrêtée deux fois », ni à assertir
 * qu'une piste acquise après démontage l'est aussi. `stopped` porte ce fait.
 */
export class FakeMediaStreamTrack {
  public stopped = false;

  public readonly stop = jest.fn((): void => {
    this.stopped = true;
  });
}

/**
 * `toURL()` rend une chaîne stable par flux : c'est elle que `RTCView` reçoit
 * en `streamURL`, et un test qui la compare a besoin qu'elle ne change pas
 * d'un rendu à l'autre.
 */
export class FakeMediaStream {
  private static counter = 0;

  public readonly _url: string;

  public constructor(
    public readonly tracks: FakeMediaStreamTrack[] = [new FakeMediaStreamTrack()],
  ) {
    FakeMediaStream.counter += 1;
    this._url = `fake-stream-${String(FakeMediaStream.counter)}`;
  }

  public getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }

  public toURL(): string {
    return this._url;
  }
}

export const mediaDevices = {
  enumerateDevices: jest.fn(async (): Promise<unknown> => []),
  // Rend un flux neuf à chaque appel, comme le vrai : deux acquisitions
  // successives ne partagent pas leurs pistes, et confondre les deux masquerait
  // une fuite.
  getUserMedia: jest.fn(async (): Promise<unknown> => new FakeMediaStream()),
};

// `RTCView` est une vue native ; sous Jest elle n'existe pas. Le double la
// remplace par un composant hôte inerte qui GARDE ses props, pour que
// `streamURL` et `mirror` restent assertables — ce sont des props que le vrai
// composant natif consomme, mais celui-ci les expose.
export const RTCView = 'RTCView';
