import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCameraPreview } from 'src/call/cameraPreview';

// Importé comme le module testé l'importe, et NON par `jest.requireMock`.
//
// C'est la borne d'`AGENTS.md` appliquée aux doubles manuels : l'objet que rend
// `requireMock` n'est pas forcément la liaison que voit le module, et un
// `mockImplementation` posé dessus n'atteint alors rien — mesuré ici même,
// zéro appel enregistré sur six tests.
import { mediaDevices } from '@livekit/react-native-webrtc';

// `FakeMediaStream` vient du DOUBLE, pas du vrai paquet : le module réel ne
// l'exporte pas, et l'importer depuis son nom ferait échouer `tsc`. Le chemin
// relatif dit d'où il vient, ce qu'un cast masquerait.
//
import { FakeMediaStream } from '../../__mocks__/@livekit/react-native-webrtc';

type Stream = { toURL: () => string; getTracks: () => { stopped: boolean }[] };

const getUserMedia = mediaDevices.getUserMedia as unknown as jest.Mock;

async function lastStream(): Promise<Stream> {
  const result = getUserMedia.mock.results.at(-1) as { value: Promise<Stream> };
  return await result.value;
}

describe('useCameraPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMedia.mockImplementation(async () => new FakeMediaStream());
  });

  describe('acquisition', () => {
    // Les deux états, chacun avec sa fixture : sans le second, une acquisition
    // inconditionnelle passerait.
    it("n'acquiert rien quand la caméra est coupée", async () => {
      await renderHook(() => useCameraPreview(false));

      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('acquiert la caméra quand elle est demandée', async () => {
      await renderHook(() => useCameraPreview(true));

      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalledTimes(1);
      });
    });

    it("rend l'URL du flux une fois acquis", async () => {
      const view = await renderHook(() => useCameraPreview(true));

      await waitFor(() => {
        expect(view.result.current).toMatch(/^fake-stream-/);
      });
    });

    it("rend null tant que rien n'est acquis", async () => {
      const view = await renderHook(() => useCameraPreview(false));

      expect(view.result.current).toBe(null);
    });

    // Le refus de permission est le cas courant, pas l'exception : l'écran doit
    // rester utilisable, pas planter.
    it("rend null quand l'acquisition échoue", async () => {
      getUserMedia.mockRejectedValue(new Error('refusé'));

      const view = await renderHook(() => useCameraPreview(true));

      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalled();
      });
      expect(view.result.current).toBe(null);
    });
  });

  describe('libération — le vrai risque', () => {
    // Une caméra jamais relâchée reste ALLUMÉE, témoin compris, après avoir
    // quitté l'écran. C'est le défaut le plus visible qu'un aperçu puisse avoir.
    it('relâche la caméra au démontage', async () => {
      const view = await renderHook(() => useCameraPreview(true));
      await waitFor(() => expect(view.result.current).not.toBe(null));
      const stream = await lastStream();

      await view.unmount();

      expect(stream.getTracks().every((track: { stopped: boolean }) => track.stopped)).toBe(true);
    });

    it('relâche la caméra quand on la coupe', async () => {
      const view = await renderHook((props: { on: boolean }) => useCameraPreview(props.on), {
        initialProps: { on: true },
      });
      await waitFor(() => expect(view.result.current).not.toBe(null));
      const stream = await lastStream();

      await act(async () => {
        view.rerender({ on: false });
      });

      expect(stream.getTracks().every((track: { stopped: boolean }) => track.stopped)).toBe(true);
      expect(view.result.current).toBe(null);
    });

    // LE cas qui fuit en pratique. `getUserMedia` est asynchrone : quitter
    // l'écran pendant qu'elle résout laisse une piste vivante que plus personne
    // ne référence.
    it('relâche un flux qui arrive APRÈS le démontage', async () => {
      let resolve: ((stream: unknown) => void) | null = null;
      const pending = new Promise((r) => {
        resolve = r as (stream: unknown) => void;
      });
      getUserMedia.mockReturnValue(pending);

      const view = await renderHook(() => useCameraPreview(true));
      await view.unmount();

      const stream = new FakeMediaStream();
      await act(async () => {
        (resolve as unknown as (s: unknown) => void)(stream);
        await pending;
      });

      expect(stream.getTracks().every((track: { stopped: boolean }) => track.stopped)).toBe(true);
    });

    // Rallumer après avoir coupé doit REacquérir : sans cela, l'aperçu resterait
    // noir pour toujours après une seule bascule.
    it('réacquiert la caméra quand on la rallume', async () => {
      const view = await renderHook((props: { on: boolean }) => useCameraPreview(props.on), {
        initialProps: { on: true },
      });
      await waitFor(() => expect(view.result.current).not.toBe(null));

      await act(async () => {
        view.rerender({ on: false });
      });
      await act(async () => {
        view.rerender({ on: true });
      });

      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => expect(view.result.current).not.toBe(null));
    });
  });
});
