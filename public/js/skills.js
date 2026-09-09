import { api } from "./api.js";
import { state } from "./state.js";
import { animateStats, errorBlock, num, skeleton } from "./format.js";
import { t } from "./i18n.js";
import { portraitImg } from "./images.js";

const FOCUS_STORAGE_KEY = "bremenInc.skillFocus";
const FOCI = ["trading", "hauling", "production"];

function loadStoredFocus() {
  try {
    const stored = localStorage.getItem(FOCUS_STORAGE_KEY);
    return FOCI.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function saveStoredFocus(focus) {
  try {
    if (focus) localStorage.setItem(FOCUS_STORAGE_KEY, focus);
    else localStorage.removeItem(FOCUS_STORAGE_KEY);
  } catch {
    // localStorage nicht verfuegbar - Auswahl gilt dann nur fuer die aktuelle Seitenladung.
  }
}

// Modul-weiter State statt state.js, da die Fokus-Wahl rein UI-seitig ist
// und nicht mit dem Character-Wechsel zusammenhaengt.
let currentFocus = loadStoredFocus();

function renderFocusSelector() {
  const buttons = FOCI.map((f) => `<button type="button" class="focus-btn ${f === currentFocus ? "focus-btn-active" : ""}" data-focus="${f}">${t(`skills.focus.${f}`)}</button>`).join("");
  return `
    <div class="focus-selector">
      <p class="panel-desc">${t("skills.focusIntro")}</p>
      <div class="focus-btn-row">${buttons}</div>
    </div>`;
}

// Feste, nach Profit-Wirkung sortierte Schrittliste vom Backend
// (buildFocusedSkillPlan) - im Gegensatz zu den rein beschreibenden
// Kategorien unten wird hier explizit priorisiert statt es dem Spieler zu
// ueberlassen.
function renderFocusedPlan(plan) {
  if (!plan) return "";
  if (plan.steps.length === 0) {
    return `
      <div class="category-block plan-block">
        <h3 class="section-label">${plan.title}</h3>
        <p class="panel-desc">${plan.intro}</p>
        <div class="recommendation-banner">${t("skills.planAllDone")}</div>
      </div>`;
  }
  const stepsHtml = plan.steps
    .map(
      (s) => `
      <div class="plan-step">
        <span class="plan-step-order">${s.order}</span>
        <div class="plan-step-body">
          <div class="plan-step-head">
            <span class="plan-step-name">${s.skillName}</span>
            <span class="plan-step-level">${t("skills.planLevelArrow", { current: s.currentLevel, target: s.targetLevel })}</span>
          </div>
          <p class="plan-step-reason">${s.reason}</p>
        </div>
      </div>`,
    )
    .join("");
  return `
    <div class="category-block plan-block">
      <h3 class="section-label">${plan.title}</h3>
      <p class="panel-desc">${plan.intro}</p>
      <p class="muted small-text">${t("skills.planProgress", { done: plan.completedCount, total: plan.totalCount })}</p>
      <div class="plan-steps">${stepsHtml}</div>
    </div>`;
}

function wireFocusSelector(root) {
  root.querySelectorAll("[data-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.focus;
      currentFocus = currentFocus === f ? null : f;
      saveStoredFocus(currentFocus);
      loadSkills();
    });
  });
}

function renderProfileStrip(characterId) {
  const character = state.characters.find((c) => c.characterId === characterId);
  if (!character) return "";
  return `<div class="tab-profile-strip">${portraitImg(characterId, 36, "overview-portrait")}<span class="tab-profile-strip-name" title="${character.characterName}">${character.characterName}</span></div>`;
}

function renderOrderSlots(orderSlots) {
  const pctFilled = Math.min(100, (orderSlots.totalSlots / orderSlots.maxPossibleSlots) * 100);
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
    ? `<div class="recommendation-banner">${t("skills.nextTrainingTarget", { skill: `<b>${orderSlots.recommendation.skillName}</b>`, gain: `<b>${orderSlots.recommendation.gain}</b>` })}</div>`
    : `<div class="recommendation-banner">${t("skills.allMaxed")}</div>`;

  return `
    <h3 class="section-label">${t("skills.orderCapacity")}</h3>
    <div class="slot-summary">
      <div class="stat">
        <span class="stat-value">${orderSlots.totalSlots} / ${orderSlots.maxPossibleSlots}</span>
        <span class="stat-label">${t("skills.orderSlotsUsed")}</span>
      </div>
      <div class="slot-bar-track"><div class="slot-bar-fill" style="width:${pctFilled}%"></div></div>
    </div>
    <div class="skill-grid">${cards}</div>
    ${recommendation}
  `;
}

function renderSkillCategory(cat) {
  const lines = cat.items
    .map((i) => {
      const pips = "●".repeat(i.currentLevel) + "○".repeat(Math.max(0, 5 - i.currentLevel));
      return `
        <div class="skill-line">
          <div class="skill-line-head">
            <span class="skill-line-name">${i.skillName}</span>
            <span class="skill-line-level" title="Level ${i.currentLevel}">${pips}</span>
          </div>
          <p class="skill-line-desc">${i.description}</p>
          ${i.nextLevelEffect ? `<p class="skill-line-next">→ ${i.nextLevelEffect}</p>` : ""}
        </div>`;
    })
    .join("");

  return `
    <div class="category-block">
      <h3 class="section-label">${cat.title}</h3>
      <p class="panel-desc">${cat.summary}</p>
      <div class="skill-line-grid">${lines}</div>
      ${cat.recommendation ? `<div class="recommendation-banner">▸ ${cat.recommendation}</div>` : ""}
    </div>`;
}

export async function loadSkills() {
  const el = document.getElementById("skillsContent");
  if (!state.selectedCharacterId) {
    el.innerHTML = `<div class="empty">${t("common.noCharacterConnected")}</div>`;
    return;
  }
  el.innerHTML = skeleton(4);
  try {
    const data = await api.getSkills(state.selectedCharacterId, currentFocus);
    const rows = data.skills
      .slice(0, 50)
      .map((s) => `<tr><td>${s.name}</td><td>${s.active_skill_level}</td><td>${num(s.skillpoints_in_skill)}</td></tr>`)
      .join("");
    const queue = data.queue
      .slice(0, 10)
      .map((q) => `<li>${q.skill_id} &rarr; Level ${q.finished_level}</li>`)
      .join("");

    const categories = data.tradingSkills.categories.map(renderSkillCategory).join("");

    el.innerHTML = `
      ${renderProfileStrip(state.selectedCharacterId)}
      <div class="stat-row">
        <div class="stat"><span class="stat-value" data-count="${data.totalSp}">0</span><span class="stat-label">${t("skills.totalSp")}</span></div>
        <div class="stat"><span class="stat-value" data-count="${data.unallocatedSp}">0</span><span class="stat-label">${t("skills.unallocatedSp")}</span></div>
        <div class="stat"><span class="stat-value" data-count="${data.queue.length}">0</span><span class="stat-label">${t("skills.inQueue")}</span></div>
      </div>
      ${renderFocusSelector()}
      ${renderFocusedPlan(data.focusedPlan)}
      ${renderOrderSlots(data.tradingSkills.orderSlots)}
      ${categories}
      <h3 class="section-label">${t("skills.topSkills")}</h3>
      <table><thead><tr><th>${t("skills.colSkill")}</th><th>${t("skills.colLevel")}</th><th>${t("skills.colSp")}</th></tr></thead><tbody>${rows}</tbody></table>
      ${queue ? `<h3 class="section-label">${t("skills.queue")}</h3><ul>${queue}</ul>` : ""}
    `;
    animateStats(el);
    wireFocusSelector(el);
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}
