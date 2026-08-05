import { parsePastedMeeting } from 'src/navigation/deepLinks';

// L'`URL` que React Native installe sur l'APPAREIL — `polyfillGlobal('URL', …)`,
// `Libraries/Core/setUpXHR.js:35` —, chargée telle quelle depuis le paquet.
// `require` parce que ce module est en Flow et n'expose aucun type.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { URL: ReactNativeURL } = require('react-native/Libraries/Blob/URL') as { URL: typeof URL };

describe('parsePastedMeeting', () => {
  describe("une URL, l'hôte étant rapporté tel quel", () => {
    it("rend le slug et l'hôte d'une instance connue", () => {
      expect(parsePastedMeeting('https://meet.linagora.com/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.linagora.com',
      });
    });

    it('ACCEPTE un hôte hors allowlist, en le rapportant', () => {
      expect(parsePastedMeeting('https://meet.acme.com/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.acme.com',
      });
    });

    // Un test sur la casse de l'hôte AVAIT été retiré ici, au motif que
    // `new URL()` normalise déjà le sien et qu'une assertion dessus serait
    // verte quoi qu'il arrive. La mutation qui l'a établi était juste ; elle
    // avait seulement été faite sur le MAUVAIS MOTEUR — voir le bloc
    // « sous l'URL de l'APPAREIL » en fin de fichier. Le voici rendu, avec
    // sous lui celui qui, lui, rougit.
    it("abaisse la casse de l'hôte", () => {
      expect(parsePastedMeeting('https://MEET.ACME.com/abc-defg-hij')?.host).toBe('meet.acme.com');
    });

    it('ignore une chaîne de requête', () => {
      expect(parsePastedMeeting('https://meet.acme.com/abc-defg-hij?utm=mail')?.slug).toBe(
        'abc-defg-hij',
      );
    });

    it('refuse un segment réservé', () => {
      expect(parsePastedMeeting('https://meet.acme.com/callback')).toBe(null);
    });

    it('refuse un chemin à plusieurs segments', () => {
      expect(parsePastedMeeting('https://meet.acme.com/a/b')).toBe(null);
    });

    it('refuse http en clair', () => {
      expect(parsePastedMeeting('http://meet.acme.com/abc-defg-hij')).toBe(null);
    });
  });

  describe('une URL noyée dans un message', () => {
    it("l'extrait du texte qui l'entoure", () => {
      expect(parsePastedMeeting('Rejoins-moi : https://meet.acme.com/abc-defg-hij à 14 h')).toEqual(
        { slug: 'abc-defg-hij', host: 'meet.acme.com' },
      );
    });

    it('retire le point qui termine la phrase, pas le slug', () => {
      expect(parsePastedMeeting('On se voit là https://meet.acme.com/abc-defg-hij.')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.acme.com',
      });
    });

    it('rend null quand le texte ne porte aucune URL exploitable', () => {
      expect(parsePastedMeeting('Rejoins-moi https://meet.acme.com/mentions-legales')).toBe(null);
    });
  });

  // Ces deux tests tournent sous le `URL` de Node, mais ils valent désormais
  // pour l'appareil AUSSI : le schéma applicatif ne passe plus par `URL` du
  // tout — `slugFromAppLink` lit la chaîne brute. Leurs jumeaux du bloc « sous
  // l'URL de l'APPAREIL », en fin de fichier, le prouvent sur l'autre moteur.
  describe('le schéma applicatif', () => {
    it("rend le slug SANS hôte : le lien n'en porte aucun", () => {
      expect(parsePastedMeeting('twakevisio://room/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: null,
      });
    });

    it('refuse un hôte autre que « room »', () => {
      expect(parsePastedMeeting('twakevisio://callback/abc-defg-hij')).toBe(null);
    });
  });

  describe('un code nu', () => {
    it('accepte le code avec ses tirets', () => {
      expect(parsePastedMeeting('abc-defg-hij')).toEqual({ slug: 'abc-defg-hij', host: null });
    });

    it('accepte le code sans tirets', () => {
      expect(parsePastedMeeting('abcdefghij')).toEqual({ slug: 'abcdefghij', host: null });
    });

    it('détoure les espaces autour du code', () => {
      expect(parsePastedMeeting('  abc-defg-hij \n')?.slug).toBe('abc-defg-hij');
    });

    // LE test de ce lot. `normalizeCodeInput` jetterait la ponctuation et
    // rendrait dix lettres — un code « complet » et faux. Le motif doit donc
    // s'appliquer au texte ENTIER.
    it("REFUSE une phrase qui contient un code, au lieu d'en extraire dix lettres", () => {
      expect(parsePastedMeeting('Rejoins-moi : abc-defg-hij')).toBe(null);
    });

    it('refuse un code trop court', () => {
      expect(parsePastedMeeting('abc-defg-hi')).toBe(null);
    });

    it('refuse un code portant un chiffre', () => {
      expect(parsePastedMeeting('abc-def9-hij')).toBe(null);
    });
  });

  it('rend null sur un presse-papiers vide', () => {
    expect(parsePastedMeeting('')).toBe(null);
  });

  it('rend null sur du texte quelconque', () => {
    expect(parsePastedMeeting('bonjour tout le monde')).toBe(null);
  });
});

// ————————————————————————————————————————————————————————————————————————
// LA MESURE : `URL` n'est pas le même objet sous Jest et sur l'appareil.
//
// Jest tourne sur le `URL` WHATWG de Node. L'application tourne sur celui que
// React Native installe globalement (`polyfillGlobal('URL', …)`,
// `Libraries/Core/setUpXHR.js:35`), un jeu de regex — `Libraries/Blob/URL.js`,
// getters `host` et `hostname` lignes 130-140 :
// `/^https?:\/\/(?:[^@]+@)?([^:\/?#]+)/`.
//
// Trois divergences, relevées le 2026-08-05 en chargeant ce polyfill ici même :
//
// | entrée                        | Node (Jest)      | React Native (appareil) |
// | ----------------------------- | ---------------- | ----------------------- |
// | `https://MEET.ACME.com/x`     | `meet.acme.com`  | `MEET.ACME.com`         |
// | `twakevisio://room/abc`       | host = « room »  | host = « » (vide)       |
// | `https://mon serveur`         | **lève**         | hôte « mon serveur »    |
//
// Elle EXPLIQUE, et elle ne l'excuse pas, une mesure fausse de la Tâche 1 : le
// `.toLowerCase()` de `deepLinks.ts:127` avait été jugé sans effet parce que
// le mutant restait vert. Il l'était sous Node. Sur l'appareil, cette ligne
// est PORTANTE — sans elle, `meet.linagora.com` collé en capitales ne
// correspond à aucune instance connue, et la feuille marque un hôte parfaitement
// connu comme inconnu.
describe("le collage, sous l'URL de l'APPAREIL", () => {
  let nodeUrl: typeof URL;

  beforeEach(() => {
    nodeUrl = globalThis.URL;
    globalThis.URL = ReactNativeURL;
  });

  afterEach(() => {
    globalThis.URL = nodeUrl;
  });

  // CELUI-CI rougit si `.toLowerCase()` part, là où son jumeau du haut reste
  // vert : React Native ne normalise rien, c'est la ligne de `deepLinks.ts`
  // qui le fait.
  it("abaisse la casse de l'hôte — que le moteur, lui, ne fait pas", () => {
    expect(parsePastedMeeting('https://MEET.ACME.com/abc-defg-hij')?.host).toBe('meet.acme.com');
  });

  /**
   * Ce test gardait un chemin MORT. Il rougit désormais parce qu'on l'a
   * réparé — c'était exactement son but, écrit ainsi le 2026-08-05.
   *
   * Le défaut : `fromUrl` lisait l'hôte et le chemin par `URL`, or les
   * accesseurs de React Native sont des regex ancrées sur `^https?://`
   * (`Libraries/Blob/URL.js:130-141`). Pour `twakevisio://room/<slug>` elles ne
   * correspondent à rien : `host` valait la chaîne vide ET `pathname` valait
   * « / ». Ce n'était donc pas seulement l'hôte qui manquait, c'était aussi le
   * slug — irrécupérable. Sous Node, où tourne Jest, les deux valaient « room »
   * et « /abc-defg-hij », d'où des tests verts contre du code que personne
   * n'exécutait.
   *
   * `slugFromAppLink` lit la chaîne brute par une regex, sans `URL` : le seul
   * moyen que les deux moteurs se comportent pareil.
   */
  it('reconnaît le schéma applicatif, sur appareil AUSSI', () => {
    expect(parsePastedMeeting('twakevisio://room/abc-defg-hij')).toEqual({
      slug: 'abc-defg-hij',
      host: null,
    });
  });

  it('refuse un segment réservé porté par le schéma applicatif', () => {
    expect(parsePastedMeeting('twakevisio://room/callback')).toBe(null);
  });

  it('refuse un hôte autre que « room », sur appareil aussi', () => {
    expect(parsePastedMeeting('twakevisio://callback/abc-defg-hij')).toBe(null);
  });

  // Le pendant du prédicat de `joinSheet.tsx` : ici, sur appareil, rien ne
  // lève. Une validation bâtie sur un `catch` autour de `new URL` ne refuse
  // donc rien de ce que voit l'utilisateur.
  it("n'a AUCUN URL invalide à refuser : le constructeur ne lève pas", () => {
    expect(() => new globalThis.URL('https://mon serveur')).not.toThrow();
    expect(new globalThis.URL('https://mon serveur').hostname).toBe('mon serveur');
  });
});
