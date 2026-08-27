const state = { characters: [], selectedCharacterId: null };

const characterSelect = document.getElementById("characterSelect");
const tabs = document.querySelectorAll("nav.tabs .tab");
const panels = {
  skills: document.getElementById("tab-skills"),
  assets: document.getElementById("tab-assets"),
  trading: document.getElementById("tab-trading"),
  settings: document.getElementById("tab-settings"),
};

function activateTab(name) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(panels).forEach(([key, p]) => p.classList.toggle("hidden", key !== name));
}

function isk(value) {
  return Number(value).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " ISK";
}

function num(value) {
  return Number(value).toLocaleString("de-DE");
}

/** Kurzer Count-Up-Effekt fuer Stat-Zahlen - reine Optik, kein Datenverlust. */
function animateValue(el, target) {
  const duration = 500;
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString("de-DE");
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => activateTab(el.dataset.goto));
});

async function loadCharacters() {
  const res = await fetch("/api/characters");
  state.characters = await res.json();
  characterSelect.innerHTML = "";
  if (state.characters.length === 0) {
    characterSelect.innerHTML = '<option value="">KEIN PILOT VERBUNDEN</option>';
    return;
  }
  for (const c of state.characters) {
    const opt = document.createElement("option");
    opt.value = c.characterId;
    opt.textContent = c.characterName.toUpperCase();
    characterSelect.appendChild(opt);
  }
  state.selectedCharacterId = state.characters[0].characterId;
  characterSelect.value = state.selectedCharacterId;
  await Promise.all([loadSkills(), loadAssets()]);
}

characterSelect.addEventListener("change", async () => {
  state.selectedCharacterId = Number(characterSelect.value);
  await Promise.all([loadSkills(), loadAssets()]);
});

function renderOrderSlots(orderSlots) {
  const pct = Math.min(100, (orderSlots.totalSlots / orderSlots.maxPossibleSlots) * 100);
  const cards = orderSlots.skills
    .map((s) => {
      const pips = Array.from({ length: 5 }, (_, i) => `<span class="pip ${i < s.currentLevel ? "filled" : ""}"></span>`).join("");
      return `
        <div class="skill-card">
          <div class="skill-card-head">
            <span class="skill-card-name">${s.skillName}</span>
            <span class="skill-card-slots">+${s.slotsGranted}</span>
          </div>
          <div class="pips">${pips}</div>
        </div>`;
    })
    .join("");

  const recommendation = orderSlots.recommendation
    ? `<div class="recommendation-banner">
         ▸ Naechstes Trainingsziel: <b>${orderSlots.recommendation.skillName}</b>
         &mdash; naechstes Level bringt <b>+${orderSlots.recommendation.gain} Order-Slots</b>
       </div>`
    : `<div class="recommendation-banner">▸ Alle Order-Slot-Skills auf Maximum trainiert.</div>`;

  return `
    <h3 class="section-label">MARKET ORDER CAPACITY</h3>
    <div class="slot-summary">
      <div class="stat">
        <span class="stat-value">${orderSlots.totalSlots} / ${orderSlots.maxPossibleSlots}</span>
        <span class="stat-label">GENUTZTE ORDER-SLOTS</span>
      </div>
      <div class="slot-bar-track"><div class="slot-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="skill-grid">${cards}</div>
    ${recommendation}
  `;
}

async function loadSkills() {
  const el = document.getElementById("skillsContent");
  if (!state.selectedCharacterId) return;
  el.innerHTML = "// SCANNING...";
  try {
    const res = await fetch(`/api/characters/${state.selectedCharacterId}/skills`);
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    const rows = data.skills
      .slice(0, 50)
      .map(
        (s) =>
          `<tr><td>${s.name}</td><td>${s.active_skill_level}</td><td>${num(s.skillpoints_in_skill)}</td></tr>`,
      )
      .join("");
    const queue = data.queue
      .slice(0, 10)
      .map((q) => `<li>${q.skill_id} &rarr; Level ${q.finished_level}</li>`)
      .join("");

    el.innerHTML = `
      <div class="stat-row">
        <div class="stat"><span class="stat-value" data-count="${data.totalSp}">0</span><span class="stat-label">TOTAL SKILLPOINTS</span></div>
        <div class="stat"><span class="stat-value" data-count="${data.unallocatedSp}">0</span><span class="stat-label">UNVERTEILTE SP</span></div>
        <div class="stat"><span class="stat-value" data-count="${data.queue.length}">0</span><span class="stat-label">SKILLS IN QUEUE</span></div>
      </div>
      ${renderOrderSlots(data.orderSlots)}
      <h3 class="section-label">TOP SKILLS</h3>
      <table><thead><tr><th>Skill</th><th>Level</th><th>SP</th></tr></thead><tbody>${rows}</tbody></table>
      ${queue ? `<h3 class="section-label">SKILL QUEUE</h3><ul>${queue}</ul>` : ""}
    `;
    el.querySelectorAll("[data-count]").forEach((elm) => animateValue(elm, Number(elm.dataset.count)));
  } catch (err) {
    el.innerHTML = `<span class="risk-high">FEHLER: ${err.message}</span>`;
  }
}

async function loadAssets() {
  const el = document.getElementById("assetsContent");
  if (!state.selectedCharacterId) return;
  el.innerHTML = "// SCANNING...";
  try {
    const res = await fetch(`/api/characters/${state.selectedCharacterId}/assets`);
    if (!res.ok) throw new Error((await res.json()).error);
    const assets = await res.json();
    const grouped = new Map();
    for (const a of assets) {
      const key = a.type_name;
      grouped.set(key, (grouped.get(key) ?? 0) + a.quantity);
    }
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
    const rows = sorted.map(([name, qty]) => `<tr><td>${name}</td><td>${num(qty)}</td></tr>`).join("");
    el.innerHTML = `
      <div class="stat-row">
        <div class="stat"><span class="stat-value" data-count="${assets.length}">0</span><span class="stat-label">ASSET-EINTRAEGE</span></div>
        <div class="stat"><span class="stat-value" data-count="${grouped.size}">0</span><span class="stat-label">ITEM-TYPEN</span></div>
      </div>
      <table><thead><tr><th>Item</th><th>Menge (gesamt)</th></tr></thead><tbody>${rows}</tbody></table>
    `;
    el.querySelectorAll("[data-count]").forEach((elm) => animateValue(elm, Number(elm.dataset.count)));
  } catch (err) {
    el.innerHTML = `<span class="risk-high">FEHLER: ${err.message}</span>`;
  }
}

document.getElementById("runAnalysis").addEventListener("click", async () => {
  const btn = document.getElementById("runAnalysis");
  const el = document.getElementById("tradingContent");
  btn.disabled = true;
  el.innerHTML = '<p class="muted">// analysiere marktdaten und befrage die KI...</p>';
  try {
    const url = new URL("/api/trading/opportunities", window.location.origin);
    if (state.selectedCharacterId) url.searchParams.set("characterId", state.selectedCharacterId);
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json();
      if (body.code === "missing_anthropic_key") {
        el.innerHTML = `<p class="risk-high">${body.error}</p>
          <button class="link-btn" data-goto="settings">→ Zu den Settings</button>`;
        el.querySelectorAll("[data-goto]").forEach((e) => e.addEventListener("click", () => activateTab(e.dataset.goto)));
        return;
      }
      throw new Error(body.error);
    }
    const data = await res.json();
    const rows = data.recommendations
      .map(
        (r) => `
      <tr>
        <td>${r.itemName}</td>
        <td class="strategy-tag">${r.strategy === "station_trading" ? "STATION-TRADING" : "HAULING"}</td>
        <td>${r.route}</td>
        <td>${isk(r.expectedProfitPerUnit)}</td>
        <td>${r.expectedMarginPercent.toFixed(1)}%</td>
        <td><span class="risk-tag risk-${r.riskLevel}">${r.riskLevel}</span></td>
        <td class="reasoning">${r.reasoning}</td>
      </tr>`,
      )
      .join("");
    el.innerHTML = `
      <h3 class="section-label">SUMMARY</h3>
      <p>${data.summary}</p>
      <p class="muted">${data.candidateCount} Kandidaten geprueft${data.walletBalance ? ` &mdash; Wallet: ${isk(data.walletBalance)}` : ""}</p>
      <table>
        <thead><tr><th>Item</th><th>Strategie</th><th>Route</th><th>Gewinn/Einheit</th><th>Marge</th><th>Risiko</th><th>Begruendung</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    el.innerHTML = `<span class="risk-high">FEHLER: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

async function loadSettingsStatus() {
  const res = await fetch("/api/settings");
  const status = await res.json();

  const anthropicStatus = document.getElementById("anthropicKeyStatus");
  anthropicStatus.textContent = status.anthropicKeyConfigured ? "✓ HINTERLEGT" : "NICHT KONFIGURIERT";
  anthropicStatus.className = `status-tag ${status.anthropicKeyConfigured ? "ok" : "missing"}`;

  const eveStatus = document.getElementById("eveClientIdStatus");
  eveStatus.textContent = status.eveClientIdSource === "override" ? "✓ EIGENE APP" : status.eveClientIdSource === "built-in" ? "✓ STANDARD-APP" : "NICHT KONFIGURIERT";
  eveStatus.className = `status-tag ${status.eveClientIdConfigured ? "ok" : "missing"}`;

  document.getElementById("setupBanner").classList.toggle("hidden", status.eveClientIdConfigured);
  return status;
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  const result = document.getElementById("settingsSaveResult");
  const anthropicKey = document.getElementById("anthropicKeyInput").value;
  const eveClientId = document.getElementById("eveClientIdInput").value;
  result.textContent = "speichere...";
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropicApiKey: anthropicKey, eveClientId }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.getElementById("anthropicKeyInput").value = "";
    document.getElementById("eveClientIdInput").value = "";
    await loadSettingsStatus();
    result.textContent = "✓ gespeichert";
  } catch (err) {
    result.textContent = `Fehler: ${err.message}`;
  }
});

loadSettingsStatus();
loadCharacters();
