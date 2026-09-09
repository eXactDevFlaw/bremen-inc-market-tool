import { api } from "./api.js";
import { t } from "./i18n.js";

const RECENTS_LIMIT = 6;
const RECENTS_PREFIX = "bremenInc.recents.";
// ESI's /search/ lehnt Begriffe unter 3 Zeichen ab (z.B. "ji" fuer Jita
// schlaegt fehl, "jit" funktioniert) - deshalb hier wie im Backend ein
// einheitliches Minimum von 3.
const MIN_SEARCH_LENGTH = 3;

function loadRecents(key) {
  try {
    const raw = localStorage.getItem(RECENTS_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecent(key, entry, sameEntry) {
  try {
    const list = loadRecents(key).filter((e) => !sameEntry(e, entry));
    list.unshift(entry);
    localStorage.setItem(RECENTS_PREFIX + key, JSON.stringify(list.slice(0, RECENTS_LIMIT)));
  } catch {
    // localStorage kann z.B. im privaten Modus fehlschlagen - dann bleibt der Verlauf einfach leer, kein harter Fehler.
  }
}

function categoryLabel(category) {
  return (
    { region: t("trading.locCategoryRegion"), solar_system: t("trading.locCategorySystem"), station: t("trading.locCategoryStation") }[category] ??
    category
  );
}

/**
 * Such-Dropdown mit echtem Dropdown-Verhalten: oeffnet sich bereits beim
 * Fokussieren/Klicken (auch ohne Eingabe) und zeigt dann optional angepinnte
 * Eintraege (z.B. Handelshubs) sowie die zuletzt gewaehlten Eintraege aus dem
 * lokalen Verlauf, filtert ab 3 Zeichen live per `searchFn(term)`, und
 * unterstuetzt Pfeiltasten/Enter/Escape wie ein natives Auswahlfeld.
 * `options.recentsKey` haelt die Verlaeufe verschiedener Felder (Orte vs.
 * Items) im localStorage getrennt. `options.pinnedFetcher` (optional) laedt
 * einmalig eine Liste fest angepinnter Eintraege (z.B. die 5 Handelshubs).
 */
export function createAutocomplete(inputEl, resultsEl, searchFn, onSelect, formatRow, options) {
  const { recentsKey, toRecentEntry, sameEntry, emptyHintKey, pinnedFetcher, pinnedHeadingKey } = options;
  let debounceTimer = null;
  let currentResults = [];
  let activeIndex = -1;
  let pinnedItems = null; // null = noch nicht geladen

  async function ensurePinned() {
    if (pinnedItems !== null) return pinnedItems;
    if (!pinnedFetcher) {
      pinnedItems = [];
      return pinnedItems;
    }
    try {
      pinnedItems = await pinnedFetcher();
    } catch {
      pinnedItems = [];
    }
    return pinnedItems;
  }

  async function openWithRecents() {
    const pinned = await ensurePinned();
    const recents = loadRecents(recentsKey).filter((r) => !pinned.some((p) => sameEntry(p, r)));
    const groups = [];
    if (pinned.length) groups.push({ heading: t(pinnedHeadingKey ?? "autocomplete.hubs"), items: pinned });
    if (recents.length) groups.push({ heading: t("autocomplete.recent"), items: recents });
    renderGroups(groups, t(emptyHintKey));
  }

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim().length < MIN_SEARCH_LENGTH) openWithRecents();
  });

  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const term = inputEl.value.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      openWithRecents();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchFn(term);
        renderGroups([{ heading: null, items: results }], t("autocomplete.noResults"));
      } catch (err) {
        // Backend liefert bei bekannten Fehlern (z.B. "kein Charakter
        // verbunden") eine sprechende, uebersetzte Meldung - die zeigen wir
        // direkt an statt der generischen Fallback-Meldung.
        renderGroups([], err?.message || t("autocomplete.searchError"));
      }
    }, 300);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (resultsEl.classList.contains("hidden") || currentResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight();
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        e.preventDefault();
        pick(currentResults[activeIndex]);
      }
    } else if (e.key === "Escape") {
      hide();
      inputEl.blur();
    }
  });

  function highlight() {
    resultsEl.querySelectorAll(".autocomplete-row").forEach((row, i) => {
      row.classList.toggle("autocomplete-row-active", i === activeIndex);
    });
    resultsEl.querySelector(".autocomplete-row-active")?.scrollIntoView({ block: "nearest" });
  }

  function pick(result) {
    hide();
    inputEl.value = "";
    if (recentsKey && toRecentEntry) pushRecent(recentsKey, toRecentEntry(result), sameEntry ?? (() => false));
    onSelect(result);
  }

  /** `groups`: [{heading: string|null, items: [...]}] - wird zu einer flachen, per Pfeiltaste navigierbaren Liste gerendert, mit optionalen Zwischenueberschriften. */
  function renderGroups(groups, emptyMessage) {
    activeIndex = -1;
    currentResults = groups.flatMap((g) => g.items);
    if (currentResults.length === 0) {
      resultsEl.innerHTML = `<div class="autocomplete-empty">${emptyMessage ?? t("autocomplete.noResults")}</div>`;
      resultsEl.classList.remove("hidden");
      return;
    }
    let idx = 0;
    resultsEl.innerHTML = groups
      .map((g) => {
        const heading = g.heading ? `<div class="autocomplete-heading">${g.heading}</div>` : "";
        const rows = g.items
          .map((r) => {
            const { label, tag } = formatRow(r);
            const row = `<div class="autocomplete-row" data-index="${idx}"><span>${label}</span><span class="autocomplete-cat">${tag}</span></div>`;
            idx++;
            return row;
          })
          .join("");
        return heading + rows;
      })
      .join("");
    resultsEl.classList.remove("hidden");
    resultsEl.querySelectorAll(".autocomplete-row").forEach((row) => {
      row.addEventListener("click", () => pick(currentResults[Number(row.dataset.index)]));
    });
  }

  function hide() {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    currentResults = [];
    activeIndex = -1;
  }

  document.addEventListener("click", (e) => {
    if (e.target !== inputEl && !resultsEl.contains(e.target)) hide();
  });
}

/** Freitextsuche ueber Regionen/Systeme/Stationen, inkl. Dropdown mit angepinnten Handelshubs + zuletzt gewaehlten Orten. onSelect({id, name, category}). */
export function createLocationAutocomplete(inputEl, resultsEl, onSelect) {
  createAutocomplete(
    inputEl,
    resultsEl,
    (term) => api.searchLocations(term),
    onSelect,
    (r) => ({ label: r.name, tag: categoryLabel(r.category) }),
    {
      recentsKey: "locations",
      toRecentEntry: (r) => ({ id: r.id, name: r.name, category: r.category }),
      sameEntry: (a, b) => a.id === b.id && a.category === b.category,
      emptyHintKey: "autocomplete.typeToSearch",
      pinnedFetcher: () => api.getTradeHubs(),
      pinnedHeadingKey: "autocomplete.hubs",
    },
  );
}

/** Freitextsuche ueber Item-Typen, inkl. Dropdown mit zuletzt gewaehlten Items. onSelect({typeId, name}). */
export function createItemAutocomplete(inputEl, resultsEl, onSelect) {
  createAutocomplete(
    inputEl,
    resultsEl,
    (term) => api.searchItems(term),
    onSelect,
    (r) => ({ label: r.name, tag: "" }),
    {
      recentsKey: "items",
      toRecentEntry: (r) => ({ typeId: r.typeId, name: r.name }),
      sameEntry: (a, b) => a.typeId === b.typeId,
      emptyHintKey: "autocomplete.typeToSearch",
    },
  );
}
