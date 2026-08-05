import * as Clipboard from 'expo-clipboard';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_SERVER_URL } from 'src/constants';
import { listKnownHosts } from 'src/instance/knownInstances';
import { parsePastedMeeting } from 'src/navigation/deepLinks';
import {
  CODE_GROUPS,
  formatCodeSlug,
  isCompleteCode,
  normalizeCodeInput,
} from 'src/rooms/roomCodeEntry';
import { FormSheet } from 'src/ui/formSheet';
import { tokens } from 'src/ui/tokens';

// Le couple remonté à la validation. `host` accompagne désormais `slug` :
// un salon rejoint depuis un lien collé peut viser une instance différente de
// celle par défaut, et l'appelant doit savoir laquelle interroger.
type JoinTarget = { readonly slug: string; readonly host: string };

type Props = {
  readonly visible: boolean;
  readonly onSheetDismiss: () => void;
  // Remonte un COUPLE, pas une route : la navigation appartient à l'appelant,
  // qui sait d'où il vient. Cette feuille ne connaît pas expo-router.
  readonly onJoinRoom: (target: JoinTarget) => void;
  readonly host: string;
  // ABSENT = la rangée n'est pas rendue. UNE prop porte la capacité ET le
  // rappel : deux props à tenir d'accord seraient une de trop, et `home.tsx`
  // n'a aucun serveur à choisir.
  readonly onHostChange?: (host: string) => void;
  readonly testID: string;
};

// Les index de fin de groupe, pour savoir où poser un séparateur. Dérivés de
// `CODE_GROUPS` plutôt que recopiés : deux constantes à tenir d'accord seraient
// une de trop.
const SEPARATOR_AFTER = CODE_GROUPS.reduce<readonly number[]>((marks, size) => {
  const previous = marks[marks.length - 1] ?? 0;
  return [...marks, previous + size];
}, []).slice(0, -1);

const TOTAL_CELLS = CODE_GROUPS.reduce((total, size) => total + size, 0);

// Un schéma en tête, quel qu'il soit. Capturé pour être COMPARÉ, pas seulement
// retiré : la conception ne veut que `https` (« un scheme autre que https ou un
// chemin sont refusés »), et retirer aveuglément ferait accepter
// `twakevisio://room` comme l'hôte « room ».
const SCHEME_PREFIX = /^([a-z][a-z\d+\-.]*):\/\//i;

// Ce qu'est un hôte, port compris. Volontairement étroit : lettres, chiffres,
// points et tirets, puis un port décimal. Ni IPv6 entre crochets, ni IDN
// non-ASCII — aucune instance meet connue n'en porte, et l'élargir demanderait
// de savoir ce qu'on en ferait ensuite.
const HOST_WITH_PORT = /^[a-z0-9.-]+(:\d+)?$/i;

// L'hôte par défaut, en NOM D'HÔTE. Un simple retrait de schéma, jamais
// `new URL` : celui de React Native ne jette pas et n'est pas celui de Node —
// voir la section « Jest et l'application n'exécutent PAS le même URL »
// d'`AGENTS.md`. Ici la chaîne est une constante du dépôt, donc un `replace`
// suffit et ne peut pas échouer.
const DEFAULT_HOST = DEFAULT_SERVER_URL.replace(/^https?:\/\//, '');

// Valide une adresse saisie À LA MAIN dans la rangée de serveur, quand on
// appuie sur « Changer ».
//
// Un PRÉDICAT explicite, et surtout PAS `new URL()` dans un `try`/`catch`
// comme avant : **`URL` n'est pas le même objet sous Jest et sur l'appareil.**
// React Native installe le sien (`polyfillGlobal('URL', …)`,
// `Libraries/Core/setUpXHR.js:35`), un jeu de regex qui NE JETTE JAMAIS pour
// une chaîne sans schéma et dont la classe de caractères de l'hôte
// (`/^https?:\/\/(?:[^@]+@)?([^:\/?#]+)/`, `Libraries/Blob/URL.js:130-140`)
// ACCEPTE LES ESPACES. Mesuré le 2026-08-05 en chargeant ce polyfill sous
// Jest : `new URL('https://mon serveur').hostname` rend « mon serveur » sur
// appareil, et lève sous Node.
//
// La version d'avant ne refusait donc RIEN sur un téléphone : quelqu'un tapait
// « mon serveur », la feuille l'acceptait, `welcome.tsx:128` ouvrait une
// session invité dessus, et tout appel réseau ultérieur échouait en disant
// « connexion impossible » à une personne dont c'était l'ADRESSE qui était
// fausse. Elle ne rejetait que ce que Node rejette — c'est-à-dire rien de ce
// que voit l'utilisateur.
//
// Le PORT est CONSERVÉ, comme le fait déjà le collage (`deepLinks.ts:127` lit
// `parsed.host`, jamais `hostname`) : sans cela, la même personne qui héberge
// son instance sur `:8443` marchait en COLLANT un lien et se retrouvait
// silencieusement sur `:443` en TAPANT la même adresse.
//
// Conséquence assumée : un chemin n'est plus toléré. `https://meet.acme.com/x`
// était accepté et son `/x` jeté sans un mot ; il est désormais refusé, ce que
// demande la conception.
function normalizeHostInput(raw: string): string | null {
  const trimmed = raw.trim();

  const scheme = SCHEME_PREFIX.exec(trimmed);
  if (scheme !== null && scheme[1]?.toLowerCase() !== 'https') return null;
  const host = scheme === null ? trimmed : trimmed.slice(scheme[0].length);

  if (!HOST_WITH_PORT.test(host)) return null;
  // Un point en tête, en queue, ou deux à la suite passent la classe de
  // caractères ci-dessus et ne forment pourtant aucun nom de domaine.
  const name = host.split(':')[0] ?? '';
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return null;

  // Explicite, et non plus offert par `URL` : le polyfill de React Native ne
  // normalise PAS la casse — `new URL('https://MEET.ACME.com/x').hostname`
  // rend « MEET.ACME.com » sur appareil là où Node rend « meet.acme.com ».
  return host.toLowerCase();
}

export function JoinSheet({
  visible,
  onSheetDismiss,
  onJoinRoom,
  host,
  onHostChange,
  testID,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [pasteFailed, setPasteFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  // L'édition manuelle de l'hôte : un brouillon distinct de `host`, qui reste
  // la prop tant que rien n'a été confirmé. Une saisie abandonnée ne doit pas
  // affecter ce que la feuille affiche ou remonte ailleurs.
  const [hostEditing, setHostEditing] = useState(false);
  const [hostDraft, setHostDraft] = useState('');
  const [hostInvalid, setHostInvalid] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // La case où le prochain caractère atterrira. `code.length` la donne
  // exactement : 0 sur un champ vide, et sinon la position qui SUIT le dernier
  // caractère saisi.
  //
  // Elle vaut `TOTAL_CELLS` une fois le code complet — un index hors des cases,
  // donc aucune n'est marquée, ce qui est juste : il n'y a plus rien à saisir,
  // et le bouton d'envoi vient d'apparaître.
  //
  // Ce repère n'est pas cosmétique. Le champ réel est TRANSPARENT
  // (`styles.hiddenInput`) : son curseur système l'est donc aussi, et sans ce
  // marquage rien à l'écran ne dit où l'on en est ni même que le champ a le
  // focus.
  const caretIndex = focused ? code.length : -1;

  // Hors allowlist : `listKnownHosts()` sert ici de RÉFÉRENCE d'affichage, pas
  // de filtre. La Décision 1 du partenaire humain accepte tout hôte collé —
  // elle demande seulement de dire quand il n'est pas reconnu.
  const hostKnown = listKnownHosts().includes(host.toLowerCase());

  // La rangée ne se rend QUE si l'hôte diverge du défaut, et seulement là où
  // l'on peut en changer. Le lien discret prend le relais dans l'autre cas :
  // sans lui, aucune divergence ne pourrait naître d'une saisie.
  const canChooseHost = onHostChange !== undefined;
  const diverges = host.toLowerCase() !== DEFAULT_HOST.toLowerCase();
  const showHostRow = canChooseHost && (diverges || hostEditing);
  const showOtherServer = canChooseHost && !diverges && !hostEditing;

  function handleChange(raw: string): void {
    setCode(normalizeCodeInput(raw));
    setPasteFailed(false);
  }

  async function handlePaste(): Promise<void> {
    const clip = await Clipboard.getStringAsync();
    // `parsePastedMeeting`, PAS `parseMeetingLink` : coller est un geste
    // délibéré dont l'hôte sera montré, un lien profond ne l'est pas. Les deux
    // fonctions existent pour cette raison ; ne pas les confondre.
    const target = parsePastedMeeting(clip);
    if (target === null) {
      setPasteFailed(true);
      return;
    }
    setCode(normalizeCodeInput(target.slug));
    setPasteFailed(false);
    // `host: null` veut dire « le collage ne portait aucun hôte » — un code nu,
    // ou le schéma applicatif. On garde alors le courant.
    if (target.host !== null) onHostChange?.(target.host);
  }

  function handleSubmit(): void {
    const slug = formatCodeSlug(code);
    if (slug !== null) onJoinRoom({ slug, host });
  }

  function handleHostChangePress(): void {
    // Le brouillon repart de l'hôte COURANT, pas de celui du dernier montage :
    // un collage a pu le faire avancer entre-temps.
    setHostDraft(host);
    setHostEditing(true);
  }

  function handleHostDraftChange(raw: string): void {
    setHostDraft(raw);
    setHostInvalid(false);
  }

  function handleHostConfirm(): void {
    const normalized = normalizeHostInput(hostDraft);
    if (normalized === null) {
      setHostInvalid(true);
      return;
    }
    onHostChange?.(normalized);
    setHostEditing(false);
  }

  return (
    <FormSheet
      onSheetDismiss={onSheetDismiss}
      testID={testID}
      title={t('join.title')}
      visible={visible}
    >
      <Text style={styles.instructions} testID={`${testID}-instructions`}>
        {t('join.instructions')}
      </Text>

      <Pressable onPress={handlePaste} style={styles.paste} testID={`${testID}-paste`}>
        <Text style={styles.pasteLabel}>{t('join.paste')}</Text>
      </Pressable>

      {/* Ce que « Coller » fait vraiment, dit sous le bouton qui le fait.
          Sans cette ligne, rien n'annonce que le code se remplit tout seul :
          la personne voit dix cases vides et suppose qu'il faut les saisir.

          DEUX formulations, et ce n'est pas une coquetterie. La promesse « le
          serveur aussi » n'est tenue QUE là où la rangée de serveur existe —
          c'est-à-dire là où `onHostChange` est fourni, donc en mode invité.
          Sur l'accueil connecté, `home.tsx` ne le passe pas : un lien collé
          d'une autre instance y remplit le code et GARDE le serveur du compte,
          ce qui est le comportement voulu. Promettre le serveur là-bas serait
          faux, et un texte faux coûte plus cher qu'un texte absent. */}
      <Text style={styles.pasteHelp} testID={`${testID}-paste-help`}>
        {t(onHostChange === undefined ? 'join.pasteHelp' : 'join.pasteHelpWithServer')}
      </Text>

      {/* Rendue seulement quand l'hôte DIVERGE du défaut.
          Décision de Michel-Marie le 2026-08-05 : les deux feuilles doivent se
          ressembler au repos, et on ne montre le serveur qu'au moment où il
          n'est PAS celui qu'on suppose — après un lien collé d'une autre
          instance, ou après un « Changer ». Ailleurs, l'afficher n'apprenait
          rien et distinguait sans raison la feuille invité de celle de
          l'accueil connecté.
          `onHostChange` reste la condition première : `home.tsx` ne le passe
          pas, une personne connectée n'ayant aucun serveur à choisir. */}
      {!showHostRow ? null : (
        <View style={styles.hostRow}>
          <Text style={styles.hostLabel}>{t('join.server')}</Text>

          {hostEditing ? (
            <View style={styles.hostEdit}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={handleHostDraftChange}
                onSubmitEditing={handleHostConfirm}
                placeholder={t('join.serverPrompt')}
                style={styles.hostInput}
                testID={`${testID}-host-input`}
                value={hostDraft}
              />
              {hostInvalid ? (
                <Text style={styles.error} testID={`${testID}-host-error`}>
                  {t('join.serverInvalid')}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.hostDisplay}>
              <View style={styles.hostValueGroup}>
                <Text style={styles.hostValue} testID={`${testID}-host`}>
                  {host}
                </Text>
                {/* Un FAIT à lire, pas une erreur : `textMeta`, jamais `danger`
                    — Décision 3 du partenaire humain. */}
                {hostKnown ? null : (
                  <Text style={styles.hostUnknown} testID={`${testID}-host-unknown`}>
                    {t('join.serverUnknown')}
                  </Text>
                )}
              </View>
              <Pressable onPress={handleHostChangePress} testID={`${testID}-host-change`}>
                <Text style={styles.hostChangeLabel}>{t('join.serverChange')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* La saisie réelle est un `TextInput` TRANSPARENT superposé aux cases —
          la technique du mockup. Elle donne un curseur système et une seule
          source de vérité, là où dix champs demanderaient de synchroniser dix
          états et de gérer le recul entre eux. */}

      {/* Les deux chemins, et leur hiérarchie. Coller est le cas majoritaire —
          le libellé de l'accueil dit « J'ai reçu un lien » —, donc il passe en
          premier et en bouton PLEIN. La grille reste, pour un code transmis de
          vive voix, mais elle n'est plus ce qu'on voit d'abord. */}
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orLabel}>{t('join.or')}</Text>
        <View style={styles.orLine} />
      </View>

      <Pressable onPress={() => inputRef.current?.focus()} style={styles.cellsWrapper}>
        <View style={styles.cells}>
          {Array.from({ length: TOTAL_CELLS }, (_, index) => (
            <React.Fragment key={index}>
              <View
                style={[
                  styles.cell,
                  index < code.length ? styles.cellFilled : null,
                  index === caretIndex ? styles.cellCaret : null,
                ]}
                testID={`${testID}-box-${index}`}
              >
                {/* Une BARRE, et non la case entière colorée : une case remplie
                    porte déjà le lavis de marque, et deux marquages par la même
                    couleur de fond seraient indistinguables. Le trait dit « le
                    prochain caractère arrive ICI ».
                    Rendue À CÔTÉ du texte et jamais à sa place : la case du
                    curseur est toujours vide — c'est la position SUIVANTE —,
                    donc le nœud de texte ne montre rien, mais il reste
                    joignable et les gardes des autres tests tiennent. */}
                {index === caretIndex ? (
                  <View style={styles.caret} testID={`${testID}-caret`} />
                ) : null}
                <Text style={styles.cellText} testID={`${testID}-cell-${index}`}>
                  {code[index] ?? ''}
                </Text>
              </View>
              {SEPARATOR_AFTER.includes(index + 1) ? <View style={styles.separator} /> : null}
            </React.Fragment>
          ))}
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onBlur={() => setFocused(false)}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          ref={inputRef}
          style={styles.hiddenInput}
          testID={`${testID}-input`}
          value={code}
        />
      </Pressable>

      <Text style={styles.hint} testID={`${testID}-hint`}>
        {t('join.hint')}
      </Text>

      {/* L'échappatoire, quand l'hôte EST celui par défaut : sans elle on ne
          pourrait jamais le faire diverger au clavier, et la rangée ci-dessus
          n'apparaîtrait que sur un lien collé. Volontairement discrète — c'est
          un cas minoritaire, et la feuille doit rester proche de celle de
          l'accueil connecté. */}
      {showOtherServer ? (
        <Pressable onPress={handleHostChangePress} testID={`${testID}-other-server`}>
          <Text style={styles.otherServer}>{t('join.otherServer')}</Text>
        </Pressable>
      ) : null}

      {pasteFailed ? (
        <Text style={styles.error} testID={`${testID}-paste-error`}>
          {t('join.pasteFailed')}
        </Text>
      ) : null}

      {/* Le mockup GRISE ce bouton tant que le code est incomplet. On ne le rend
          pas du tout : une commande morte sort ainsi de l'arbre
          d'accessibilité, et c'est la forme que ce dépôt a retenue ailleurs. */}
      {isCompleteCode(code) ? (
        <Pressable onPress={handleSubmit} style={styles.submit} testID={`${testID}-submit`}>
          <Text style={styles.submitLabel}>{t('join.submit')}</Text>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    borderColor: tokens.color.fieldBorder,
    borderRadius: 11,
    borderWidth: 1,
    // `row` et non le défaut `column` de Yoga. La case du curseur porte DEUX
    // enfants — la barre et le nœud de texte, vide mais présent —, et un `Text`
    // vide occupe quand même une hauteur de LIGNE. Empilés en colonne, les deux
    // faisaient ~48 dp centrés dans 52, ce qui repoussait la barre dans la
    // moitié haute. En rangée, chacun est centré sur l'axe transverse, donc
    // verticalement. Le texte vide ne mesure aucune largeur : la barre reste
    // centrée horizontalement.
    flexDirection: 'row',
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  // La barre de saisie. `brandStrong` et non `brand` : 5,12:1 sur le blanc de
  // la feuille, quand `brand` n'en donne que 3,22 — au-dessus des 3:1 d'un
  // objet graphique, mais ce trait est FIN, et un repère de 2 dp de large
  // mérite la marge que le seuil ne demande pas.
  caret: {
    backgroundColor: tokens.color.brandStrong,
    borderRadius: 1,
    height: 22,
    width: 2,
  },
  // La case du curseur : le filet passe au vert soutenu, la LARGEUR ne bouge
  // pas. Un filet qui épaissirait décalerait le contenu de la case d'un dp à
  // chaque frappe, et le rang entier tressauterait.
  cellCaret: { borderColor: tokens.color.brandStrong },
  cellFilled: {
    backgroundColor: tokens.color.brandWash,
    borderColor: tokens.color.brand,
  },
  cellText: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: 19,
  },
  cells: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  cellsWrapper: { position: 'relative' },
  error: { color: tokens.color.danger, fontFamily: tokens.font.semiBold, fontSize: 13 },
  // Transparent et superposé : il capte la frappe, les cases affichent.
  hiddenInput: {
    bottom: 0,
    left: 0,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  hint: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 12.5,
  },
  // Le libellé « Changer », de la même famille que `pasteLabel` mais coloré
  // comme une action plutôt qu'un contenu : c'est la seule commande de cette
  // rangée.
  hostChangeLabel: {
    color: tokens.color.brandStrong,
    fontFamily: tokens.font.bold,
    fontSize: 13,
  },
  hostDisplay: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  hostEdit: { flex: 1, gap: 6 },
  hostInput: {
    borderColor: tokens.color.fieldBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: tokens.color.textPrimary,
    flex: 1,
    fontFamily: tokens.font.medium,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  hostLabel: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.semiBold,
    fontSize: 13,
  },
  hostRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  // Le marqueur d'hôte inconnu : une INFORMATION, pas une erreur, donc
  // `textMeta` — jamais `danger`. Voir la Décision 3 du partenaire humain.
  hostUnknown: {
    color: tokens.color.textMeta,
    fontFamily: tokens.font.medium,
    fontSize: 11.5,
  },
  hostValue: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: 14,
  },
  hostValueGroup: { gap: 2 },
  instructions: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  // L'explication sous le bouton « Coller ». Plus petite et plus discrète que
  // le libellé du bouton : elle informe, elle n'appelle pas à l'action.
  // Couleur EXPLICITE comme tout texte de cette feuille.
  pasteHelp: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  // Le bouton PLEIN, et non plus un contour. Coller est le cas majoritaire —
  // l'accueil dit « J'ai reçu un lien de réunion » —, et l'action majoritaire
  // porte le poids visuel. La grille, en dessous, garde son contour.
  paste: {
    alignItems: 'center',
    backgroundColor: tokens.color.brandStrong,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
  },
  pasteLabel: {
    color: tokens.color.onBrand,
    fontFamily: tokens.font.extraBold,
    fontSize: 15,
  },
  // Le départage des deux chemins. Le trait est DÉCORATIF — le mot « ou » porte
  // seul l'information —, donc WCAG 1.4.11 ne s'applique pas à lui.
  orRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  orLine: { backgroundColor: tokens.color.fieldBorder, flex: 1, height: 1 },
  orLabel: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 12.5,
  },
  otherServer: {
    color: tokens.color.brandStrong,
    fontFamily: tokens.font.semiBold,
    fontSize: 12.5,
  },
  separator: {
    backgroundColor: tokens.color.textChevron,
    borderRadius: 2,
    height: 2,
    width: 9,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: tokens.color.brandStrong,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
  },
  submitLabel: {
    color: tokens.color.onBrand,
    fontFamily: tokens.font.extraBold,
    fontSize: 16,
  },
});
