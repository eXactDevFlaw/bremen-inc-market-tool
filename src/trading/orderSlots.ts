// Market-Order-Slots in EVE: Basis 5, plus Trade/Retail/Wholesale/Tycoon je Level.
// Voll trainiert (alle Skills Level 5) ergibt 305 Slots - das ist der bekannte Maximalwert.
const BASE_SLOTS = 5;

const ORDER_SLOT_SKILLS: { name: string; perLevel: number }[] = [
  { name: "Trade", perLevel: 4 },
  { name: "Retail", perLevel: 8 },
  { name: "Wholesale", perLevel: 16 },
  { name: "Tycoon", perLevel: 32 },
];

export interface OrderSlotSkillInfo {
  skillName: string;
  currentLevel: number;
  slotsPerLevel: number;
  slotsGranted: number;
  nextLevelGain: number;
}

export interface OrderSlotAnalysis {
  totalSlots: number;
  maxPossibleSlots: number;
  skills: OrderSlotSkillInfo[];
  recommendation: { skillName: string; gain: number } | null;
}

export function computeOrderSlotAnalysis(skillLevelsByName: Map<string, number>): OrderSlotAnalysis {
  let total = BASE_SLOTS;
  let max = BASE_SLOTS;
  const skills: OrderSlotSkillInfo[] = ORDER_SLOT_SKILLS.map(({ name, perLevel }) => {
    const level = skillLevelsByName.get(name) ?? 0;
    const granted = level * perLevel;
    total += granted;
    max += 5 * perLevel;
    return {
      skillName: name,
      currentLevel: level,
      slotsPerLevel: perLevel,
      slotsGranted: granted,
      nextLevelGain: level < 5 ? perLevel : 0,
    };
  });

  // Natuerliche Trainingsreihenfolge: das erste noch nicht maximierte Skill in der Kette.
  const next = skills.find((s) => s.currentLevel < 5);
  const recommendation = next ? { skillName: next.skillName, gain: next.nextLevelGain } : null;

  return { totalSlots: total, maxPossibleSlots: max, skills, recommendation };
}
