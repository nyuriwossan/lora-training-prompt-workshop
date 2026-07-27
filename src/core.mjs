import {
  CATEGORY_DEFINITIONS,
  DETAIL_CATEGORY_DEFINITIONS,
  FACE_CATEGORY_ORDER,
  OBJECTIVE_MIGRATIONS,
  makeDefaultCategories,
} from "./face-data.mjs";

export { CATEGORY_DEFINITIONS, DETAIL_CATEGORY_DEFINITIONS };
export const SCHEMA_VERSION = "0.2.0";

export const SENSITIVE_TERMS = [
  ["bust portrait", "head-and-shoulders portrait"],
  ["bust-up", "upper-body portrait"],
  ["adult male style", "mature-looking man"],
  ["adult man", "man in his twenties"],
  ["adult male", "male character in his twenties"],
  ["bust", "upper-body portrait"],
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

export function normalizePhrase(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

export function parsePhraseList(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  const seen = new Set();
  return source.map((item) => String(item || "").trim()).filter((item) => {
    const key = normalizePhrase(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function categoryMode(category) {
  if (["fixed", "distributed", "disabled"].includes(category?.mode)) return category.mode;
  return category?.enabled === false ? "disabled" : "distributed";
}

export function categoryIsActive(category) {
  return categoryMode(category) !== "disabled";
}

function usableChoices(category) {
  return (category?.choices || []).filter((choice) => choice.enabled !== false && choice.promptText?.trim());
}

function fixedChoice(category) {
  const usable = usableChoices(category);
  return usable.find((choice) => choice.id === category.fixedChoiceId) || usable[0];
}

export function allocateCounts(choices, total) {
  const enabled = choices.filter((choice) => choice.enabled !== false && choice.promptText?.trim());
  if (!Number.isInteger(total) || total < 1) throw new Error("生成本数は1以上の整数にしてください。");
  if (!enabled.length) throw new Error("有効な候補がありません。候補を追加するか、有効に切り替えてください。");
  const normalized = enabled.map((choice) => {
    const minimum = Math.max(0, Number(choice.minCount) || 0);
    const maximum = choice.maxCount === null || choice.maxCount === "" || choice.maxCount === undefined ? total : Number(choice.maxCount);
    if (maximum < minimum) throw new Error(`「${choice.labelJa || choice.promptText}」の最大件数が最低件数より小さくなっています。`);
    return { ...choice, minimum, maximum: Math.min(total, maximum), weight: Math.max(0, Number(choice.targetPercent) || 0) };
  });
  if (normalized.reduce((sum, item) => sum + item.minimum, 0) > total) throw new Error("最低使用件数の合計が生成本数を超えています。最低件数を減らしてください。");
  if (normalized.reduce((sum, item) => sum + item.maximum, 0) < total) throw new Error("最大使用件数の合計が生成本数に届きません。最大件数を増やしてください。");
  const weightTotal = normalized.reduce((sum, item) => sum + item.weight, 0) || normalized.length;
  const rows = normalized.map((item) => {
    const raw = total * (item.weight || (weightTotal === normalized.length ? 1 : 0)) / weightTotal;
    return { ...item, raw, count: Math.min(item.maximum, Math.max(item.minimum, Math.floor(raw))) };
  });
  let assigned = rows.reduce((sum, item) => sum + item.count, 0);
  while (assigned < total) {
    const candidate = rows.filter((item) => item.count < item.maximum)
      .sort((a, b) => (b.raw - b.count) - (a.raw - a.count) || String(a.id).localeCompare(String(b.id)))[0];
    if (!candidate) throw new Error("件数制約を満たせません。最低・最大件数を見直してください。");
    candidate.count += 1;
    assigned += 1;
  }
  while (assigned > total) {
    const candidate = rows.filter((item) => item.count > item.minimum)
      .sort((a, b) => (a.raw - a.count) - (b.raw - b.count) || String(a.id).localeCompare(String(b.id)))[0];
    if (!candidate) throw new Error("件数制約を満たせません。最低・最大件数を見直してください。");
    candidate.count -= 1;
    assigned -= 1;
  }
  return Object.fromEntries(rows.map((item) => [item.id, item.count]));
}

function buildAssignment(category, total, random, mode = "ratio") {
  if (categoryMode(category) === "fixed") {
    const selected = fixedChoice(category);
    if (!selected) throw new Error(`固定カテゴリ「${category.label}」の候補を選択してください。`);
    return Array(total).fill(selected.id);
  }
  if (mode === "random") {
    const enabled = usableChoices(category);
    return Array.from({ length: total }, () => enabled[Math.floor(random() * enabled.length)].id);
  }
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
  return forbiddenPairs.some((pair) => pair.a && pair.b && ids.has(pair.a) && ids.has(pair.b));
}

function scorePlan(rows, constraints, distributedIds) {
  let score = rows.reduce((sum, row) => sum + (rowHasForbiddenPair(row, constraints.forbiddenPairs || []) ? 1000 : 0), 0);
  for (const [categoryId, maxValue] of Object.entries(constraints.maxConsecutive || {})) {
    if (!distributedIds.has(categoryId)) continue;
    const limit = Math.max(1, Number(maxValue) || 2);
    score += Math.max(0, longestRun(rows, categoryId) - limit) * 40;
  }
  const seen = new Set();
  for (const row of rows) {
    const signature = [...distributedIds].map((categoryId) => row.attributes[categoryId]).join("|");
    if (signature && seen.has(signature)) score += 20;
    seen.add(signature);
  }
  return score;
}

export function generatePlan({ categories, total, seed, constraints = {}, startNumber = 1 }) {
  const mode = constraints.distributionMode || "ratio";
  const prepared = categories.map((category) => ({
    ...category,
    choices: category.choices.map((choice, index) => ({
      ...choice,
      targetPercent: categoryMode(category) !== "distributed" ? choice.targetPercent
        : mode === "equal" ? 1
          : mode === "axis" ? (index === 0 ? 50 : Math.max(1, Number(choice.targetPercent) || 1))
            : choice.targetPercent,
    })),
  }));
  const active = prepared.filter((category) => categoryIsActive(category) && (categoryMode(category) === "fixed" ? fixedChoice(category) : usableChoices(category).length));
  if (!active.length) throw new Error("使用するカテゴリを1つ以上有効にしてください。");
  const distributedIds = new Set(active.filter((category) => categoryMode(category) === "distributed").map((category) => category.id));
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const random = seededRandom(`${seed}:${attempt}`);
    const assignments = Object.fromEntries(active.map((category) => [category.id, buildAssignment(category, total, random, mode)]));
    const rows = Array.from({ length: total }, (_, index) => ({
      id: `prompt_${startNumber + index}_${hashSeed(`${seed}:${startNumber + index}`)}`,
      number: startNumber + index,
      attributes: Object.fromEntries(active.map((category) => [category.id, assignments[category.id][index]])),
      status: "uncreated",
      rejectionReasons: [],
      note: "",
      locked: false,
      adjustmentLog: [],
    }));
    const score = scorePlan(rows, constraints, distributedIds);
    if (score < bestScore) {
      best = rows;
      bestScore = score;
    }
    if (score === 0) break;
  }
  const warnings = [];
  if (bestScore >= 1000) warnings.push("禁止ペアを完全には解消できませんでした。候補または制約を見直してください。");
  if (bestScore > 0 && bestScore < 1000) warnings.push("連続・重複条件を一部だけ満たせませんでした。可能な範囲で偏りを抑えています。");
  return { rows: best || [], warnings };
}

export function choiceIndex(categories) {
  return Object.fromEntries(categories.flatMap((category) => category.choices.map((choice) => [choice.id, {
    ...choice,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryMode: categoryMode(category),
  }])));
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

function splitPromptText(text) {
  return String(text || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function removePromptConflicts(entries) {
  let kept = [...entries];
  const adjustments = [];
  const has = (...patterns) => kept.some((entry) => patterns.some((pattern) => normalizePhrase(entry.text).includes(pattern)));
  const remove = (patterns, reason) => {
    const removed = kept.filter((entry) => patterns.some((pattern) => normalizePhrase(entry.text).includes(pattern)));
    if (!removed.length) return;
    kept = kept.filter((entry) => !removed.includes(entry));
    adjustments.push(`${reason}: ${removed.map((entry) => entry.text).join(" / ")}を除外`);
  };

  const leftProfile = has("full left profile", "side profile facing left");
  const rightProfile = has("full right profile", "side profile facing right");
  const rear = has("rear three-quarter view", "body turned away from the viewer");
  if (leftProfile || rightProfile || rear) {
    remove(["front view", "face oriented toward the camera", "symmetrical facial visibility", "both eyes visible", "both ears visible"], "角度矛盾を調整");
  }
  if (leftProfile) remove(["looking to the right", "looking at viewer"], "左横顔と視線の矛盾を調整");
  if (rightProfile) remove(["looking to the left", "looking at viewer"], "右横顔と視線の矛盾を調整");
  if (rear) remove(["looking straight ahead", "looking at viewer"], "振り向きと正面指定の矛盾を調整");
  if (has("eyes closed")) remove(["looking at viewer"], "閉じた目と視線の矛盾を調整");
  if (has("downcast eyes") && has("head tilted upward", "chin raised")) remove(["looking upward"], "伏し目と見上げの矛盾を調整");
  if (has("extreme close portrait", "face occupying most of the frame")) {
    remove(["waist-up portrait", "upper-body portrait", "upper torso visible", "arms visible"], "構図の矛盾を調整");
  }
  if (has("very short hair", "short hair")) remove(["semi-long hair", "long hair", "waist-length hair"], "髪の長さの矛盾を調整");
  if (has("no bangs", "forehead visible")) remove(["bangs covering the eyes", "hair covering one eye", "bangs between the eyes", "long bangs"], "前髪の矛盾を調整");
  if (has("closed mouth", "closed-mouth smile")) remove(["open mouth", "wide-open mouth"], "口元の矛盾を調整");
  if (has("expressionless", "neutral expression")) remove(["laughing", "wide smile"], "表情の矛盾を調整");
  if (has("plain white background", "plain gray background", "plain beige background", "plain dark background")) {
    remove(["bedroom background", "living room background", "study room background", "cafe background"], "背景の矛盾を調整");
  }
  return { entries: kept, adjustments };
}

function removeByPhraseList(entries, values) {
  const forbidden = new Set(parsePhraseList(values).map(normalizePhrase));
  if (!forbidden.size) return { entries, removed: [] };
  const removed = entries.filter((entry) => forbidden.has(normalizePhrase(entry.text)));
  return { entries: entries.filter((entry) => !removed.includes(entry)), removed };
}

function categoryOrder(state) {
  const requested = Array.isArray(state.outputOrder) ? state.outputOrder : [];
  return [...new Set([...requested, ...FACE_CATEGORY_ORDER, ...(state.categories || []).map((category) => category.id)])];
}

function categoryPromptEntries(row, state, index) {
  const activeIds = new Set(state.categories.filter(categoryIsActive).map((category) => category.id));
  const entries = [];
  for (const categoryId of categoryOrder(state)) {
    if (!activeIds.has(categoryId)) continue;
    const selected = index[row.attributes?.[categoryId]];
    if (!selected || selected.includeInPrompt === false) continue;
    const text = selected.intensityTags?.[selected.intensityLevel] || selected.promptText;
    splitPromptText(text).forEach((fragment) => entries.push({ text: fragment, weight: selected.promptWeight, source: categoryId }));
  }
  return entries;
}

export function buildCaption(row, state) {
  const settings = state.captionSettings || {};
  if (settings.enabled === false) return "";
  const index = choiceIndex(state.categories || []);
  const includeIds = new Set(settings.includeCategoryIds || ["hairColor", "hairLength", "hairStyle", "eyeColor", "outfit", "distance", "expression", "background"]);
  const entries = [];
  parsePhraseList(settings.triggerWord || "").forEach((text) => entries.push({ text }));
  for (const categoryId of categoryOrder(state)) {
    if (!includeIds.has(categoryId)) continue;
    const selected = index[row.attributes?.[categoryId]];
    if (!selected || selected.includeInCaption === false || !selected.promptText?.trim()) continue;
    splitPromptText(selected.promptText).forEach((text) => entries.push({ text }));
  }
  const excluded = new Set(parsePhraseList(state.phrasePolicy?.captionExclusions).map(normalizePhrase));
  const seen = new Set();
  return entries.map((entry) => entry.text.trim()).filter((text) => {
    const key = normalizePhrase(text);
    if (!key || excluded.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ");
}

export function buildPrompt(row, state) {
  const index = choiceIndex(state.categories || []);
  let entries = [];
  const add = (text, weight = 1, source = "contract") => {
    splitPromptText(text).forEach((fragment) => entries.push({ text: fragment, weight, source }));
  };
  parsePhraseList(state.phrasePolicy?.sourceTriggerWords).forEach((text) => add(text, 1, "sourceTrigger"));
  (state.contract?.required || []).filter((item) => item.enabled !== false).forEach((item) => add(item.text, item.promptWeight, "required"));
  (state.contract?.primary || []).filter((item) => item.enabled !== false).forEach((item) => {
    const chance = hashSeed(`${state.seed}:${row.number}:${item.id}`) % 100;
    if (chance < Number(item.usagePercent || 0)) add(item.text, item.promptWeight, "primary");
  });
  (state.contract?.constraints || []).filter((item) => item.enabled !== false).forEach((item) => add(item.text, item.promptWeight, "constraint"));
  entries.push(...categoryPromptEntries(row, state, index));

  const detectedConflicts = removePromptConflicts(entries);
  const conflictResult = state.constraints?.contradictionMode === "warn"
    ? { entries, adjustments: detectedConflicts.adjustments.map((item) => `未解決の矛盾: ${item}`) }
    : detectedConflicts;
  const forbiddenResult = removeByPhraseList(conflictResult.entries, state.phrasePolicy?.forbiddenPositive);
  const adjustments = [...conflictResult.adjustments];
  if (forbiddenResult.removed.length) adjustments.push(`完全禁止語をPositiveから除外: ${forbiddenResult.removed.map((entry) => entry.text).join(" / ")}`);
  const unique = [];
  const seen = new Set();
  for (const entry of forbiddenResult.entries) {
    const key = normalizePhrase(entry.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(formatWeighted(entry.text, entry.weight, state.environment?.weightMode));
  }
  const prompt = unique.filter(Boolean).join(", ");
  const negative = state.environment?.negativeMode === "available"
    ? (state.contract?.negative || []).filter((item) => item.enabled !== false).map((item) => item.text.trim()).filter(Boolean).join(", ")
    : "";
  return {
    prompt,
    negative,
    caption: buildCaption(row, state),
    adjustments,
    sensitive: state.environment?.sensitiveCheck ? detectSensitive(`${prompt}, ${negative}`) : [],
  };
}

export function aggregate(rows, categories, status = null) {
  const selected = status ? rows.filter((row) => row.status === status) : rows;
  return Object.fromEntries(categories.filter(categoryIsActive).map((category) => [category.id,
    Object.fromEntries(category.choices.map((choice) => [choice.id, selected.filter((row) => row.attributes[category.id] === choice.id).length]))
  ]));
}

export function calculateShortages(rows, categories) {
  const planned = aggregate(rows, categories);
  const adopted = aggregate(rows, categories, "adopted");
  return categories.filter(categoryIsActive).flatMap((category) => category.choices.filter((choice) => choice.enabled !== false).map((choice) => ({
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
    attributes: {},
    status: "uncreated",
    rejectionReasons: [],
    note: "",
    locked: false,
    adjustmentLog: [],
  }));
  for (const category of state.categories.filter(categoryIsActive)) {
    const mode = categoryMode(category);
    if (mode === "fixed") {
      const selected = fixedChoice(category);
      rows.forEach((row) => { if (selected) row.attributes[category.id] = selected.id; });
      continue;
    }
    const deficits = (byCategory[category.id] || []).flatMap((item) => Array(item.shortage).fill(item.choiceId));
    const fallbacks = usableChoices(category).map((choice) => choice.id);
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
  const active = shuffle(categories.filter((category) => categoryMode(category) === "distributed"), random);
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

function labelCounts(state, counts, categoryId, matcher) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return 0;
  return category.choices.filter((choice) => matcher.test(choice.labelJa || "")).reduce((sum, choice) => sum + (counts[categoryId]?.[choice.id] || 0), 0);
}

export function runDiagnostics(state) {
  const warnings = [];
  const plan = Array.isArray(state.plan) ? state.plan : [];
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const counts = aggregate(plan, categories);
  for (const category of categories.filter((item) => categoryMode(item) === "distributed")) {
    const categoryCounts = counts[category.id] || {};
    const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) || 1;
    const enabled = usableChoices(category);
    for (const choice of enabled) {
      const count = categoryCounts[choice.id] || 0;
      if (plan.length && count === 0) warnings.push({ level: "warning", text: `${category.label}「${choice.labelJa}」が一度も使われていません。` });
      if (count / total > 0.6 && enabled.length > 2) warnings.push({ level: "warning", text: `${category.label}が「${choice.labelJa}」に偏っています（${Math.round(count / total * 100)}%）。` });
    }
    const diversity = Object.values(categoryCounts).filter((count) => count > 0).length;
    if (plan.length && diversity < Math.min(3, enabled.length)) warnings.push({ level: "info", text: `${category.label}の種類が少なめです。固定化を避けるなら候補を増やしてください。` });
  }

  if (state.objective?.primary === "顔LoRA" && plan.length) {
    const total = plan.length;
    const front = labelCounts(state, counts, "faceDirection", /正面/);
    const leftProfile = labelCounts(state, counts, "faceDirection", /左横顔/);
    const rightProfile = labelCounts(state, counts, "faceDirection", /右横顔/);
    const left = labelCounts(state, counts, "faceDirection", /左/);
    const right = labelCounts(state, counts, "faceDirection", /右/);
    const close = labelCounts(state, counts, "distance", /超アップ|顔アップ/);
    if (front / total > 0.5) warnings.push({ level: "warning", text: `正面画像が全体の50％を超えています（${Math.round(front / total * 100)}%）。` });
    if (leftProfile === 0 || rightProfile === 0) warnings.push({ level: "warning", text: "左横顔または右横顔が含まれていません。" });
    if (Math.abs(left - right) > Math.max(2, total * 0.25)) warnings.push({ level: "warning", text: `顔の左右角度に差があります（左${left}件・右${right}件）。` });
    if (close / total > 0.5) warnings.push({ level: "warning", text: "頭と肩より近い構図が多く、顔の占有率が高くなりすぎる可能性があります。" });
    warnings.push({ level: "info", text: "顔角度・構図の診断はプロンプト計画に基づくもので、実際の生成画像を保証するものではありません。" });
  }

  const built = plan.map((row) => buildPrompt(row, state));
  const sensitive = built.flatMap((item) => item.sensitive.map((entry) => entry.term));
  if (sensitive.length) warnings.push({ level: "warning", text: `環境依存の注意語を検出しました: ${[...new Set(sensitive)].join(", ")}` });
  const adjustments = built.flatMap((item) => item.adjustments);
  if (adjustments.length) warnings.push({ level: "info", text: `矛盾を自動調整しました: ${[...new Set(adjustments)].slice(0, 4).join(" / ")}` });
  if (!(state.contract?.required || []).length) warnings.push({ level: "warning", text: "必須特徴が空です。LoRAに覚えさせたい核を追加してください。" });
  if (state.environment?.negativeMode !== "available" && (state.contract?.negative || []).some((item) => item.enabled !== false)) warnings.push({ level: "info", text: "選択中の環境ではネガティブプロンプトを使用しません。除外項目は生成後に確認してください。" });
  if (!warnings.length) warnings.push({ level: "success", text: "自動診断できる範囲では、大きな偏りや設定矛盾は見つかりませんでした。" });
  return warnings;
}

function mergeChoices(saved = [], defaults = []) {
  const promptKeys = new Set(saved.map((choice) => normalizePhrase(choice.promptText)).filter(Boolean));
  const labelKeys = new Set(saved.map((choice) => normalizePhrase(choice.labelJa)).filter(Boolean));
  return [
    ...saved.map((choice) => ({
      enabled: true,
      targetPercent: 0,
      minCount: 0,
      maxCount: null,
      promptWeight: 1,
      intensityLevel: "standard",
      intensityTags: {},
      notes: "",
      includeInPrompt: true,
      includeInCaption: true,
      learningTarget: false,
      ...choice,
    })),
    ...defaults.filter((choice) => !promptKeys.has(normalizePhrase(choice.promptText)) && !labelKeys.has(normalizePhrase(choice.labelJa))),
  ];
}

export function migrateState(parsed) {
  const defaults = makeDefaultCategories();
  const savedCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
  const savedById = new Map(savedCategories.map((category) => [category.id, category]));
  const categories = defaults.map((fallback) => {
    const saved = savedById.get(fallback.id);
    if (!saved) return fallback;
    const mode = ["fixed", "distributed", "disabled"].includes(saved.mode) ? saved.mode : saved.enabled === false ? "disabled" : "distributed";
    const choices = mergeChoices(saved.choices, fallback.choices);
    return {
      ...fallback,
      ...saved,
      label: fallback.label,
      detail: fallback.detail,
      choices,
      mode,
      enabled: mode !== "disabled",
      fixedChoiceId: saved.fixedChoiceId || choices.find((choice) => choice.enabled !== false)?.id || "",
    };
  });
  const known = new Set(defaults.map((category) => category.id));
  categories.push(...savedCategories.filter((category) => !known.has(category.id)).map((category) => {
    const mode = categoryMode(category);
    return { ...category, mode, enabled: mode !== "disabled", choices: mergeChoices(category.choices, []) };
  }));

  const objective = {
    primary: OBJECTIVE_MIGRATIONS[parsed.objective?.primary] || parsed.objective?.primary || "顔LoRA",
    secondary: OBJECTIVE_MIGRATIONS[parsed.objective?.secondary] || parsed.objective?.secondary || "",
    count: Number(parsed.objective?.count) || 30,
  };
  const defaultOutputOrder = [...FACE_CATEGORY_ORDER, "bodyDirection", "composition", "posture", "skinTone", "ageImpression", "hands", "lightDirection", "textureIntensity"];
  return {
    ...parsed,
    schemaVersion: SCHEMA_VERSION,
    activeStep: Math.max(1, Math.min(8, Number(parsed.activeStep) || 1)),
    objective,
    faceLoraType: parsed.faceLoraType || "general",
    categories,
    outputOrder: [...new Set([...(parsed.outputOrder || []), ...defaultOutputOrder])],
    contract: {
      required: [],
      primary: [],
      negative: [],
      constraints: [],
      review: [],
      ...(parsed.contract || {}),
    },
    constraints: {
      distributionMode: "ratio",
      forbiddenPairs: [],
      maxConsecutive: {},
      uniqueGroups: [],
      contradictionMode: "auto",
      ...(parsed.constraints || {}),
    },
    phrasePolicy: {
      sourceTriggerWords: "",
      captionExclusions: "",
      forbiddenPositive: "",
      learningTargetMemo: "",
      ...(parsed.phrasePolicy || {}),
    },
    captionSettings: {
      enabled: false,
      triggerWord: "",
      includeCategoryIds: ["hairColor", "hairLength", "hairStyle", "eyeColor", "outfit", "distance", "expression", "background"],
      ...(parsed.captionSettings || {}),
    },
    faceSettings: {
      aspectRatio: "2:3",
      faceShapeAssist: "指定しない",
      neckShoulderAssist: "指定しない",
      ...(parsed.faceSettings || {}),
    },
    plan: Array.isArray(parsed.plan) ? parsed.plan.map((row) => ({ adjustmentLog: [], ...row })) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
  };
}

export function serializeState(state) {
  const migrated = migrateState(state);
  return JSON.stringify({ ...migrated, updatedAt: new Date().toISOString(), diagnostics: runDiagnostics(migrated) }, null, 2);
}

export function parseState(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("JSONの形式が正しくありません。ファイル内容を確認してください。");
  }
  if (!parsed || typeof parsed !== "object" || !parsed.schemaVersion || !Array.isArray(parsed.categories)) {
    throw new Error("LoRA学習プロンプト工房の保存データとして必要な項目がありません。");
  }
  return migrateState(parsed);
}

const PRESET_FIELDS = [
  "environment",
  "objective",
  "faceLoraType",
  "contract",
  "categories",
  "constraints",
  "seed",
  "outputOrder",
  "phrasePolicy",
  "captionSettings",
  "faceSettings",
];

export function createUserPreset(state, name, id = makeId("preset")) {
  const settings = Object.fromEntries(PRESET_FIELDS.map((key) => [key, structuredClone(state[key])]));
  return {
    id,
    name: String(name || "名称未設定プリセット").trim() || "名称未設定プリセット",
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings,
  };
}

export function applyUserPreset(state, preset) {
  if (!preset?.settings) throw new Error("プリセットの設定データがありません。");
  return migrateState({
    ...state,
    ...structuredClone(preset.settings),
    schemaVersion: SCHEMA_VERSION,
    plan: [],
    warnings: [],
    updatedAt: new Date().toISOString(),
  });
}

export function serializeUserPresets(presets) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, kind: "lora-workshop-user-presets", presets }, null, 2);
}

export function parseUserPresets(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("プリセットJSONの形式が正しくありません。");
  }
  if (!parsed || parsed.kind !== "lora-workshop-user-presets" || !Array.isArray(parsed.presets)) {
    throw new Error("LoRA学習プロンプト工房のプリセットJSONではありません。");
  }
  return parsed.presets.filter((preset) => preset?.id && preset?.settings).map((preset) => ({ ...preset, schemaVersion: SCHEMA_VERSION }));
}
