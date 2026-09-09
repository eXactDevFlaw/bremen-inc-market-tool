const tabs = document.querySelectorAll("nav.tabs .tab");
const panels = {
  overview: document.getElementById("tab-overview"),
  skills: document.getElementById("tab-skills"),
  assets: document.getElementById("tab-assets"),
  trading: document.getElementById("tab-trading"),
  market: document.getElementById("tab-market"),
  industry: document.getElementById("tab-industry"),
  settings: document.getElementById("tab-settings"),
};

const listeners = [];

/** Registriert eine Funktion, die bei jeder Aktivierung des Tabs `name` laeuft. */
export function onTabActivate(name, fn) {
  listeners.push({ name, fn });
}

export function activateTab(name) {
  if (!panels[name]) return;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(panels).forEach(([key, panel]) => {
    if (key === name) {
      panel.classList.remove("hidden");
      panel.classList.remove("tab-enter");
      void panel.offsetWidth; // Reflow erzwingen, damit die Animation bei jeder Aktivierung neu startet.
      panel.classList.add("tab-enter");
    } else {
      panel.classList.add("hidden");
    }
  });
  listeners.filter((l) => l.name === name).forEach((l) => l.fn());
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

// Event-Delegation statt statischer Listener, damit auch dynamisch
// eingefuegte "data-goto"-Buttons (z.B. in der Overview) funktionieren.
document.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest("[data-goto]") : null;
  if (target instanceof HTMLElement && target.dataset.goto) {
    activateTab(target.dataset.goto);
  }
});
