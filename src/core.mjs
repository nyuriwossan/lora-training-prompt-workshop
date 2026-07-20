export const SCHEMA_VERSION = "0.1.0";

export const CATEGORY_DEFINITIONS = [
  ["hairColor", "髪色"], ["hairStyle", "髪型"], ["eyeColor", "目の色"],
  ["eyeShape", "目の形・開き方"], ["expression", "表情"], ["mouth", "口元"],
  ["gaze", "視線"], ["faceDirection", "顔の向き"], ["bodyDirection", "体の向き"],
  ["distance", "距離・画角"], ["composition", "構図"], ["outfit", "服装"],
  ["background", "背景"], ["lighting", "照明"],
];

export const DETAIL_CATEGORY_DEFINITIONS = [
  ["hairLength", "髪の長さ"], ["bangs", "前髪"], ["parting", "分け目"],
  ["eyebrows", "眉"], ["posture", "姿勢"], ["cameraAngle", "カメラアングル"],
  ["skinTone", "肌色"], ["ageImpression", "年齢感"], ["faceShape", "顔型"],
  ["hands", "手の有無"], ["lightDirection", "光の方向"], ["textureIntensity", "質感強度"],
];

export const SENSITIVE_TERMS = [
  ["bust portrait", "head-and-shoulders portrait"],
  ["bust-up", "upper-body portrait"],
  ["adult man", "man in his twenties"],
  ["adult male", "male character in his twenties"],
  ["bust", "upper-body"],
  ["adult", "character in their twenties"],
];

export function makeId(prefix = "item") {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${cryptoId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function allocateCounts(choices, total) {
  const enabled = choices.filter((choice) => choice.enabled !== false && choice.promptText?.trim());
  if (!Number.isInteger(total) || total < 1) throw new Error("生成本数は1以上の整数にしてください。");
  if (!enabled.length) throw new Error("有効な候補がありません。候補を追加するか、有効に切り替えてください。");
  const normalized = enabled.map((choice) => {
    const minimum = Math.max(0, Number(choice.minCount) || 0);
    const maximum = choice.maxCount === null || choice.maxCount === "" || choice.maxCount === undefined
      ? total : Number(choice.maxCount);
    if (maximum < minimum) throw new Error(`「${choice.labelJa || choice.promptText}」の最大件数が最低件数より小さくなっています。`);
    return { ...choice, minimum, maximum: Math.min(total, maximum), weight: Math.max(0, Number(choice.targetPercent) || 0) };
  });
  if (normalized.reduce((sum, item) => sum + item.minimum, 0) > total) {
    throw new Error("最低使用件数の合計が生成本数を超えています。最低件数を減らしてください。");
  }
  if (normalized.reduce((sum, item) => sum + item.maximum, 0) < total) {
    throw new Error("最大使用件数の合計が生成本数に届きません。最大件数を増やしてください。");
  }
  const weightTotal = normalized.reduce((sum, item) => sum + item.weight, 0) || normalized.length;
  const rows = normalized.map((item) => {
    const raw = total * (item.weight || (weightTotal === normalized.length ? 1 : 0)) / weightTotal;
    return { ...item, raw, count: Math.min(item.maximum, Math.max(item.minimum, Math.floor(raw))) };
  });
  let assigned = rows.reduce((sum, item) => sum + item.count, 0);
  while (assigned < total) {
    const candidate = rows
      .filter((item) => item.count < item.maximum)
      .sort((a, b) => (b.raw - b.count) - (a.raw - a.count) || String(a.id).localeCompare(String(b.id)))[0];
    if (!candidate) throw new Error("件数制約を満たせません。最低・最大件数を見直してください。");
    candidate.count += 1;
    assigned += 1;
  }
  while (assigned > total) {
    const candidate = rows
      .filter((item) => item.count > item.minimum)
      .sort((a, b) => (a.raw - a.count) - (b.raw - b.count) || String(a.id).localeCompare(String(b.id)))[0];
    if (!candidate) throw new Error("件数制約を満たせません。最低・最大件数を見直してください。");
    candidate.count -= 1;
    assigned -= 1;
  }
  return Object.fromEntries(rows.map((item) => [item.id, item.count]));
}

function buildAssignment(category, total, random) {
  const counts = allocateCounts(category.choices, total);
  const values = category.choices.flatMap((choice) => Array(counts[choice.id] || 0).fill(choice.id));
  return shuffle(values, random);
}

function longestRun(rows, categoryId) {
  let longest = 0;
  let run = 0;
  let previous;
  for (const row of rows) {
    const current = row.attributes[categoryId];
    run = current && current === previous ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = current;
  }
  return longest;
}

function rowHasForbiddenPair(row, forbiddenPairs) {
  const ids = new Set(Object.values(row.attributes));
  return forbiddenPairs.some((pair) => ids.has(pair.a) && ids.has(pair.b));
}

function scorePlan(rows, constraints) {
  let score = rows.reduce((sum, row) => sum + (rowHasForbiddenPair(row, constraints.forbiddenPairs || []) ? 1000 : 0), 0);
  for (const [categoryId, maxValue] of Object.entries(constraints.maxConsecutive || {})) {
    const limit = Math.max(1, Number(maxValue) || 2);
    score += Math.max(0, longestRun(rows, categoryId) - limit) * 40;
  }
  const seen = new Set();
  for (const row of rows) {
    const signature = Object.values(row.attributes).join("|");
    if (seen.has(signature)) score += 20;
    seen.add(signature);
  }
  return score;
}

export function generatePlan({ categories, total, seed, constraints = {}, startNumber = 1 }) {
  const active = categories.filter((category) => category.enabled && category.choices.some((choice) => choice.enabled !== false && choice.promptText?.trim()));
  if (!active.length) throw new Error("使用する分散カテゴリを1つ以上有効にしてください。");
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const random = seededRandom(`${seed}:${attempt}`);
    const assignments = Object.fromEntries(active.map((category) => [category.id, buildAssignment(category, total, random)]));
    const rows = Array.from({ length: total }, (_, index) => ({
      id: `prompt_${startNumber + index}_${hashSeed(`${seed}:${startNumber + index}`)}`,
      number: startNumber + index,
      attributes: Object.fromEntries(active.map((category) => [category.id, assignments[category.id][index]])),
      status: "uncreated",
      rejectionReasons: [],
      note: "",
      locked: false,
    }));
    const score = scorePlan(rows, constraints);
    if (score < bestScore) { best = rows; bestScore = score; }
    if (score === 0) break;
  }
  const warnings = [];
  if (bestScore >= 1000) warnings.push("禁止ペアを完全には解消できませんでした。候補または制約を見直してください。");
  if (bestScore > 0 && bestScore < 1000) warnings.push("連続・重複条件を一部だけ満たせませんでした。可能な範囲で偏りを抑えています。");
  return { rows: best || [], warnings };
}

export function choiceIndex(categories) {
  return Object.fromEntries(categories.flatMap((category) => category.choices.map((choice) => [choice.id, { ...choice, categoryId: category.id, categoryLabel: category.label }])));
}

export function formatWeighted(text, weight, mode) {
  const numericWeight = Number(weight) || 1;
  if (!text?.trim()) return "";
  if (mode === "numeric" && Math.abs(numericWeight - 1) > 0.001) return `(${text.trim()}:${numericWeight.toFixed(2)})`;
  if (mode === "parentheses" && numericWeight > 1.15) return `((${text.trim()}))`;
  if (mode === "parentheses" && numericWeight > 1.02) return `(${text.trim()})`;
  return text.trim();
}

export function detectSensitive(text) {
  const lower = String(text).toLowerCase();
  return SENSITIVE_TERMS.filter(([term]) => new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(lower))
    .map(([term, replacement]) => ({ term, replacement }));
}

export function buildPrompt(row, state) {
  const index = choiceIndex(state.categories);
  const enabledCategoryIds = new Set(state.categories.filter((category) => category.enabled).map((category) => category.id));
  const tagGroups = [];
  const add = (text, weight = 1) => {
    const formatted = formatWeighted(text, weight, state.environment.weightMode);
    if (formatted) tagGroups.push(formatted);
  };
  state.contract.required.filter((item) => item.enabled !== false).forEach((item) => add(item.text, item.promptWeight));
  state.contract.primary.filter((item) => item.enabled !== false).forEach((item) => {
    const chance = hashSeed(`${state.seed}:${row.number}:${item.id}`) % 100;
    if (chance < Number(item.usagePercent || 0)) add(item.text, item.promptWeight);
  });
  for (const categoryId of state.outputOrder) {
    if (!enabledCategoryIds.has(categoryId)) continue;
    const item = index[row.attributes[categoryId]];
    if (item) add(item.intensityTags?.[item.intensityLevel] || item.promptText, item.promptWeight);
  }
  const unique = [];
  const seen = new Set();
  for (const tag of tagGroups) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(tag); }
  }
  const prompt = unique.join(", ");
  const negative = state.environment.negativeMode === "available"
    ? state.contract.negative.filter((item) => item.enabled !== false).map((item) => item.text.trim()).filter(Boolean).join(", ") : "";
  return { prompt, negative, sensitive: state.environment.sensitiveCheck ? detectSensitive(`${prompt}, ${negative}`) : [] };
}

export function aggregate(rows, categories, status = null) {
  const selected = status ? rows.filter((row) => row.status === status) : rows;
  return Object.fromEntries(categories.filter((category) => category.enabled).map((category) => [category.id,
    Object.fromEntries(category.choices.map((choice) => [choice.id, selected.filter((row) => row.attributes[category.id] === choice.id).length]))
  ]));
}

export function calculateShortages(rows, categories) {
  const planned = aggregate(rows, categories);
  const adopted = aggregate(rows, categories, "adopted");
  return categories.filter((category) => category.enabled).flatMap((category) => category.choices.filter((choice) => choice.enabled !== false).map((choice) => ({
    categoryId: category.id,
    categoryLabel: category.label,
    choiceId: choice.id,
    choiceLabel: choice.labelJa || choice.promptText,
    planned: planned[category.id]?.[choice.id] || 0,
    adopted: adopted[category.id]?.[choice.id] || 0,
    shortage: Math.max(0, (planned[category.id]?.[choice.id] || 0) - (adopted[category.id]?.[choice.id] || 0)),
  })));
}

export function generateShortfallRows(state) {
  const shortages = calculateShortages(state.plan, state.categories);
  const byCategory = Object.groupBy
    ? Object.groupBy(shortages, (item) => item.categoryId)
    : shortages.reduce((map, item) => ((map[item.categoryId] ||= []).push(item), map), {});
  const count = Math.max(0, ...Object.values(byCategory).map((items) => items.reduce((sum, item) => sum + item.shortage, 0)));
  if (!count) return [];
  const random = seededRandom(`${state.seed}:shortfall:${state.plan.length}`);
  const start = Math.max(0, ...state.plan.map((row) => row.number)) + 1;
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `prompt_${start + index}_${hashSeed(`${state.seed}:short:${start + index}`)}`,
    number: start + index,
    attributes: {}, status: "uncreated", rejectionReasons: [], note: "", locked: false,
  }));
  for (const category of state.categories.filter((item) => item.enabled)) {
    const deficits = (byCategory[category.id] || []).flatMap((item) => Array(item.shortage).fill(item.choiceId));
    const fallbacks = category.choices.filter((choice) => choice.enabled !== false).map((choice) => choice.id);
    const assigned = shuffle(deficits, random);
    rows.forEach((row, index) => { row.attributes[category.id] = assigned[index] || fallbacks[Math.floor(random() * fallbacks.length)]; });
  }
  return rows;
}

export function replaceRowPreservingDistribution(rows, rowId, categories, seed) {
  const sourceIndex = rows.findIndex((row) => row.id === rowId);
  if (sourceIndex < 0 || rows[sourceIndex].locked) return { rows, warning: "固定中のカードは差し替えできません。" };
  const copy = rows.map((row) => ({ ...row, attributes: { ...row.attributes } }));
  const random = seededRandom(`${seed}:replace:${rowId}:${Date.now()}`);
  const active = shuffle(categories.filter((category) => category.enabled), random);
  let changed = 0;
  for (const category of active) {
    const candidateIndices = copy.map((_, index) => index).filter((index) => index !== sourceIndex && !copy[index].locked && copy[index].attributes[category.id] !== copy[sourceIndex].attributes[category.id]);
    if (!candidateIndices.length) continue;
    const targetIndex = candidateIndices[Math.floor(random() * candidateIndices.length)];
    [copy[sourceIndex].attributes[category.id], copy[targetIndex].attributes[category.id]] = [copy[targetIndex].attributes[category.id], copy[sourceIndex].attributes[category.id]];
    changed += 1;
  }
  return { rows: copy, warning: changed ? "" : "比率を維持したまま変更できる組み合わせがありませんでした。" };
}

export function runDiagnostics(state) {
  const warnings = [];
  const counts = aggregate(state.plan, state.categories);
  for (const category of state.categories.filter((item) => item.enabled)) {
    const categoryCounts = counts[category.id] || {};
    const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) || 1;
    for (const choice of category.choices.filter((item) => item.enabled !== false)) {
      const count = categoryCounts[choice.id] || 0;
      if (count === 0) warnings.push({ level: "warning", text: `${category.label}「${choice.labelJa}」が一度も使われていません。` });
      if (count / total > 0.6 && category.choices.filter((item) => item.enabled !== false).length > 2) warnings.push({ level: "warning", text: `${category.label}が「${choice.labelJa}」に偏っています（${Math.round(count / total * 100)}%）。` });
    }
    const diversity = Object.values(categoryCounts).filter((count) => count > 0).length;
    if (diversity < Math.min(3, category.choices.filter((item) => item.enabled !== false).length)) warnings.push({ level: "info", text: `${category.label}の種類が少なめです。固定化を避けるなら候補を増やしてください。` });
  }
  const sensitive = state.plan.flatMap((row) => buildPrompt(row, state).sensitive.map((item) => item.term));
  if (sensitive.length) warnings.push({ level: "warning", text: `環境依存の注意語を検出しました: ${[...new Set(sensitive)].join(", ")}` });
  if (state.contract.required.length === 0) warnings.push({ level: "warning", text: "必須特徴が空です。LoRAに覚えさせたい核を追加してください。" });
  if (state.environment.negativeMode !== "available" && state.contract.negative.some((item) => item.enabled !== false)) warnings.push({ level: "info", text: "選択中の環境ではネガティブプロンプトを使用しません。除外項目は生成後に確認してください。" });
  if (!warnings.length) warnings.push({ level: "success", text: "自動診断できる範囲では、大きな偏りや設定矛盾は見つかりませんでした。" });
  return warnings;
}

export function serializeState(state) {
  return JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), diagnostics: runDiagnostics(state) }, null, 2);
}

export function parseState(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error("JSONの形式が正しくありません。ファイル内容を確認してください。"); }
  if (!parsed || typeof parsed !== "object" || !parsed.schemaVersion || !Array.isArray(parsed.categories)) {
    throw new Error("LoRA学習プロンプト工房の保存データとして必要な項目がありません。");
  }
  return parsed;
}
