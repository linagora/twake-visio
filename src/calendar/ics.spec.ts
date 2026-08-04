import { readEvent } from 'src/calendar/ics';

// Relevé le 2026-08-03 sur `tcalendar-side-service.twake-dev.maudet.cloud`, par
// un REPORT CalDAV réel. Copié tel quel, jamais réécrit à la main : c'est la
// seule façon de savoir que le parseur lit ce que le serveur envoie.
const REAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Linagora//Twake-Calendar//EN
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:3fd6d933-6337-41d0-a84b-b6df22146c82
TRANSP:OPAQUE
DTSTART;TZID=Europe/Paris:20260803T093000
CLASS:PUBLIC
SEQUENCE:1
X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.maudet.cloud/mjj-beyv-zai
SUMMARY:COCO
DTSTAMP:20260802T215056Z
DTEND;TZID=Europe/Paris:20260803T110000
ORGANIZER;CN=michel.maudet@linagora.com michel.maudet@linagora.com:mailto:michel.maudet@linagora.com
DESCRIPTION:Join Visio : https://meet.twake-dev.maudet.cloud/mjj-beyv-zai
CONFERENCE;VALUE=URI;FEATURE=AUDIO,VIDEO;LABEL=Join video call:https://meet.twake-dev.maudet.cloud/mjj-beyv-zai
END:VEVENT
END:VCALENDAR`;

// 2026-08-03 09:30 à Paris, c'est-à-dire 07:30 UTC — l'été, décalage +02:00.
const COCO_START_UTC = Date.UTC(2026, 7, 3, 7, 30, 0);
const COCO_END_UTC = Date.UTC(2026, 7, 3, 9, 0, 0);

describe('readEvent', () => {
  it('lit un évènement réel du serveur, fuseau nommé compris', () => {
    const event = readEvent(REAL);

    expect(event).not.toBeNull();
    expect(event?.summary).toBe('COCO');
    expect(event?.uid).toBe('3fd6d933-6337-41d0-a84b-b6df22146c82');
    expect(event?.meetUrl).toBe('https://meet.twake-dev.maudet.cloud/mjj-beyv-zai');
  });

  it("convertit DTSTART;TZID=Europe/Paris en instant, sans le prendre pour de l'UTC", () => {
    // Le piège : `20260803T093000` lu comme UTC donnerait 09:30 UTC, soit deux
    // heures trop tôt. La conversion doit passer par le fuseau nommé.
    expect(readEvent(REAL)?.startMs).toBe(COCO_START_UTC);
    expect(readEvent(REAL)?.endMs).toBe(COCO_END_UTC);
  });

  // PAS de test « ne lit pas le DTSTART du VTIMEZONE ». Il a été écrit, et il
  // était VERT DANS LES DEUX ÉTATS : le parseur garde la DERNIÈRE occurrence
  // de DTSTART, donc celle du VEVENT écrase celle de 1970 même sans la garde
  // `inEvent`. Retirer cette garde ne rougissait rien.
  //
  // Le piège reste couvert : le test de conversion ci-dessus épingle l'instant
  // exact, et un parseur qui lirait `19700329T020000` le fait échouer.

  it('préfère X-OPENPAAS-VIDEOCONFERENCE aux autres porteurs du lien', () => {
    // L'ICS réel porte le même lien à TROIS endroits : la propriété dédiée,
    // `CONFERENCE`, et `DESCRIPTION`. La propriété dédiée est la seule qui soit
    // structurée ; les deux autres sont des replis.
    const other = REAL.replace(
      'X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.maudet.cloud/mjj-beyv-zai',
      'X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.maudet.cloud/aaa-bbb-ccc',
    );

    expect(readEvent(other)?.meetUrl).toBe('https://meet.twake-dev.maudet.cloud/aaa-bbb-ccc');
  });

  it('retombe sur CONFERENCE quand la propriété dédiée manque', () => {
    const without = REAL.split('\n')
      .filter((line) => !line.startsWith('X-OPENPAAS-VIDEOCONFERENCE'))
      .join('\n');

    expect(readEvent(without)?.meetUrl).toBe('https://meet.twake-dev.maudet.cloud/mjj-beyv-zai');
  });

  it('retombe sur DESCRIPTION quand les deux premières manquent', () => {
    const without = REAL.split('\n')
      .filter(
        (line) => !line.startsWith('X-OPENPAAS-VIDEOCONFERENCE') && !line.startsWith('CONFERENCE'),
      )
      .join('\n');

    expect(readEvent(without)?.meetUrl).toBe('https://meet.twake-dev.maudet.cloud/mjj-beyv-zai');
  });

  it('rend null quand aucun lien de visioconférence ne figure', () => {
    // Un rendez-vous d'agenda ordinaire. Il n'a rien à faire dans un panneau
    // qui annonce des visioconférences.
    const plain = REAL.split('\n')
      .filter(
        (line) =>
          !line.startsWith('X-OPENPAAS-VIDEOCONFERENCE') &&
          !line.startsWith('CONFERENCE') &&
          !line.startsWith('DESCRIPTION'),
      )
      .join('\n');

    expect(readEvent(plain)).toBeNull();
  });

  it('déplie les lignes continuées, comme l’exige la RFC 5545', () => {
    // Le serveur peut replier à 75 octets. Sans dépliage, le lien est tronqué
    // au milieu et le salon devient introuvable.
    const folded = REAL.replace(
      'X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.maudet.cloud/mjj-beyv-zai',
      'X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.mau\r\n det.cloud/mjj-beyv-zai',
    );

    expect(readEvent(folded)?.meetUrl).toBe('https://meet.twake-dev.maudet.cloud/mjj-beyv-zai');
  });

  it('accepte un DTSTART en UTC, suffixé Z', () => {
    const utc = REAL.replace(
      'DTSTART;TZID=Europe/Paris:20260803T093000',
      'DTSTART:20260803T073000Z',
    ).replace('DTEND;TZID=Europe/Paris:20260803T110000', 'DTEND:20260803T090000Z');

    expect(readEvent(utc)?.startMs).toBe(COCO_START_UTC);
    expect(readEvent(utc)?.endMs).toBe(COCO_END_UTC);
  });

  it('déduit la fin depuis DURATION quand DTEND manque', () => {
    const duration = REAL.replace('DTEND;TZID=Europe/Paris:20260803T110000', 'DURATION:PT1H30M');

    expect(readEvent(duration)?.endMs).toBe(COCO_END_UTC);
  });

  it('donne à un évènement sans fin ni durée une heure, plutôt que de le jeter', () => {
    // Le jeter le ferait disparaître du panneau ; lui donner une fin arbitraire
    // le garde visible le temps qu'il commence. Une heure est la durée par
    // défaut d'un rendez-vous dans la plupart des agendas.
    const none = REAL.split('\n')
      .filter((line) => !line.startsWith('DTEND'))
      .join('\n');

    expect(readEvent(none)?.endMs).toBe(COCO_START_UTC + 3600000);
  });

  it('rend null sur un contenu qui ne porte aucun VEVENT', () => {
    expect(readEvent('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR')).toBeNull();
  });

  it('rend null sur une chaîne vide', () => {
    expect(readEvent('')).toBeNull();
  });
});
