import { calendarEventUrl } from 'src/calendar/webCalendar';

const MEET = 'https://meet.twake-dev.maudet.cloud';

describe('calendarEventUrl', () => {
  it("pointe la route /events/:uid de l'agenda web", () => {
    // Route relevée le 2026-08-03 dans la table du routeur du bundle servi par
    // `calendar-ng.twake-dev.maudet.cloud` : `path:"/events/:uid"`. Lue à la
    // source, pas devinée.
    expect(calendarEventUrl(MEET, '3fd6d933-6337-41d0-a84b-b6df22146c82')).toBe(
      'https://calendar-ng.twake-dev.maudet.cloud/events/3fd6d933-6337-41d0-a84b-b6df22146c82',
    );
  });

  it('tolère une barre oblique finale', () => {
    expect(calendarEventUrl(`${MEET}/`, 'evt-1')).toBe(
      'https://calendar-ng.twake-dev.maudet.cloud/events/evt-1',
    );
  });

  // Un UID d'iCalendar n'a AUCUNE contrainte de caractères (RFC 5545 §3.8.4.7),
  // et Sabre en émet qui contiennent `@`. Sans encodage, un `#` ou un `?` y
  // couperait l'URL en deux.
  it("encode l'identifiant", () => {
    expect(calendarEventUrl(MEET, 'a b/c?d#e')).toBe(
      'https://calendar-ng.twake-dev.maudet.cloud/events/a%20b%2Fc%3Fd%23e',
    );
  });

  it("rend null quand l'hôte n'a pas de domaine parent", () => {
    // `https://meet` n'a rien à remplacer : préfixer donnerait un hôte qui
    // n'existe pas, et un lien qui échoue sans dire pourquoi. Mieux vaut ne pas
    // rendre l'icône du tout.
    expect(calendarEventUrl('https://meet', 'evt-1')).toBeNull();
  });

  it("rend null sur une URL qui n'en est pas une", () => {
    expect(calendarEventUrl('pas une url', 'evt-1')).toBeNull();
  });

  it('rend null sans identifiant', () => {
    // Un évènement sans UID ne se retrouve pas dans l'agenda : le lien mènerait
    // à une page vide.
    expect(calendarEventUrl(MEET, '')).toBeNull();
  });
});
