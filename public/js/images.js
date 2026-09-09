// Oeffentlicher EVE-Image-Server (images.evetech.net) - kein Auth noetig,
// von CCP explizit als CDN zur direkten Einbindung gedacht.
// https://developers.eveonline.com/docs/services/image-server/
//
// WICHTIG: der API-Parameter `size` akzeptiert NUR Zweierpotenzen
// (32/64/128/256/512/1024) - jede andere Zahl (z.B. 48 fuer eine 48px-
// Anzeige) liefert einen Fehler statt eines Bildes, das <img> feuert dann
// still sein onerror und wird unsichtbar. Deshalb hier strikt trennen:
// `size` ist die gewuenschte ANZEIGE-Groesse (px, geht in width/height/CSS),
// `apiSize()` rundet auf die naechste gueltige Server-Groesse auf.
const VALID_API_SIZES = [32, 64, 128, 256, 512, 1024];

function apiSize(displaySize) {
  return VALID_API_SIZES.find((s) => s >= displaySize) ?? VALID_API_SIZES[VALID_API_SIZES.length - 1];
}

export function characterPortraitUrl(characterId, size = 64) {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${apiSize(size)}`;
}

export function corporationLogoUrl(corporationId, size = 64) {
  return `https://images.evetech.net/corporations/${corporationId}/logo?size=${apiSize(size)}`;
}

export function typeIconUrl(typeId, size = 32) {
  return `https://images.evetech.net/types/${typeId}/icon?size=${apiSize(size)}`;
}

/** <img>-Tag, das sich bei fehlendem Bild (z.B. sehr alte NPC-Corp ohne Logo) selbst versteckt statt ein kaputtes Icon zu zeigen. */
export function portraitImg(characterId, size, cssClass) {
  return `<img class="${cssClass}" src="${characterPortraitUrl(characterId, size)}" width="${size}" height="${size}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`;
}

export function corpLogoImg(corporationId, size, cssClass) {
  return `<img class="${cssClass}" src="${corporationLogoUrl(corporationId, size)}" width="${size}" height="${size}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`;
}

export function typeIconImg(typeId, size, cssClass) {
  return `<img class="${cssClass}" src="${typeIconUrl(typeId, size)}" width="${size}" height="${size}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`;
}
