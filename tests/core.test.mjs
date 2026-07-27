import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SCHEMA_VERSION, aggregate, allocateCounts, applyUserPreset, buildPrompt, calculateShortages,
  categoryMode, createUserPreset, detectSensitive, generatePlan, generateShortfallRows,
  migrateState, normalizePhrase, parseState, parseUserPresets, replaceRowPreservingDistribution,
  runDiagnostics, serializeState, serializeUserPresets,
} from "../src/core.mjs";
import { createInitialState, makeCategories } from "../src/presets.mjs";

const choices = (amount = 3) => Array.from({ length: amount }, (_, index) => ({
  id: `c${index}`, labelJa: `候補${index}`, promptText: `choice ${index}`, enabled: true,
  targetPercent: 1, minCount: 0, maxCount: null, promptWeight: 1,
}));
const categories = [{ id: "hairColor", label: "髪色", enabled: true, choices: choices() }];

test("均等配分は差が1以内で合計が一致する", () => {
  const result = allocateCounts(choices(), 10);
  const values = Object.values(result);
  assert.equal(values.reduce((a, b) => a + b, 0), 10);
  assert.ok(Math.max(...values) - Math.min(...values) <= 1);
});

test("最大剰余方式で指定比率を整数化する", () => {
  const weighted = choices().map((item, index) => ({ ...item, targetPercent: [50, 30, 20][index] }));
  assert.deepEqual(allocateCounts(weighted, 7), { c0: 4, c1: 2, c2: 1 });
});

test("最低件数と最大件数を守る", () => {
  const constrained = choices().map((item, index) => index === 0 ? { ...item, minCount: 4, maxCount: 4 } : item);
  assert.equal(allocateCounts(constrained, 8).c0, 4);
});

test("矛盾する最低件数を拒否する", () => {
  assert.throws(() => allocateCounts(choices(2).map((item) => ({ ...item, minCount: 4 })), 5), /最低使用件数/);
});

test("同じシードは同じ計画になる", () => {
  const a = generatePlan({ categories, total: 10, seed: "same" });
  const b = generatePlan({ categories, total: 10, seed: "same" });
  assert.deepEqual(a.rows.map((row) => row.attributes), b.rows.map((row) => row.attributes));
});

test("異なるシードは異なる並びになる", () => {
  const a = generatePlan({ categories, total: 12, seed: "a" });
  const b = generatePlan({ categories, total: 12, seed: "b" });
  assert.notDeepEqual(a.rows.map((row) => row.attributes), b.rows.map((row) => row.attributes));
});

test("禁止ペアを可能な候補構成では回避する", () => {
  const cats = [
    { id: "a", label: "A", enabled: true, choices: choices(2) },
    { id: "b", label: "B", enabled: true, choices: choices(2).map((item, i) => ({ ...item, id: `d${i}` })) },
  ];
  const result = generatePlan({ categories: cats, total: 8, seed: "pairs", constraints: { forbiddenPairs: [{ a: "c0", b: "d0" }] } });
  assert.equal(result.rows.some((row) => row.attributes.a === "c0" && row.attributes.b === "d0"), false);
});

const state = {
  schemaVersion: "0.1.0", seed: "prompt", categories, outputOrder: ["hairColor"], plan: [],
  environment: { weightMode: "numeric", negativeMode: "available", sensitiveCheck: true },
  contract: {
    required: [{ id: "r", text: "hero", enabled: true, promptWeight: 1.2 }],
    primary: [{ id: "p", text: "calm", enabled: true, usagePercent: 100, promptWeight: 1 }],
    negative: [{ id: "n", text: "text", enabled: true }],
  },
};

test("プロンプトは番号や見出しを含めず、重みを整形する", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const result = buildPrompt(row, state);
  assert.equal(result.prompt, "(hero:1.20), calm, choice 0");
  assert.equal(result.prompt.includes("No.01"), false);
  assert.equal(result.negative, "text");
});

test("ネガティブ非対応ではネガティブを返さない", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  assert.equal(buildPrompt(row, { ...state, environment: { ...state.environment, negativeMode: "unavailable" } }).negative, "");
});

test("環境依存の注意語を検出する", () => {
  assert.deepEqual(detectSensitive("adult man, bust portrait").map((item) => item.term), ["bust portrait", "adult man", "bust", "adult"]);
});

test("採用だけで不足を再集計する", () => {
  const rows = generatePlan({ categories, total: 6, seed: "adopt" }).rows.map((row, index) => ({ ...row, status: index < 2 ? "adopted" : index < 4 ? "pending" : "rejected" }));
  const shortage = calculateShortages(rows, categories);
  assert.equal(shortage.reduce((sum, item) => sum + item.adopted, 0), 2);
  assert.equal(shortage.reduce((sum, item) => sum + item.shortage, 0), 4);
});

test("不足分生成は続き番号で追加する", () => {
  const rows = generatePlan({ categories, total: 6, seed: "short" }).rows.map((row, index) => ({ ...row, status: index < 3 ? "adopted" : "rejected" }));
  const extra = generateShortfallRows({ ...state, categories, plan: rows });
  assert.equal(extra[0].number, 7);
  assert.ok(extra.length > 0);
});

test("差し替え後も属性件数を維持する", () => {
  const rows = generatePlan({ categories, total: 6, seed: "replace" }).rows;
  const before = rows.map((row) => row.attributes.hairColor).sort();
  const after = replaceRowPreservingDistribution(rows, rows[0].id, categories, "replace").rows.map((row) => row.attributes.hairColor).sort();
  assert.deepEqual(after, before);
});

test("保存データを復元し、不正JSONを拒否する", () => {
  const json = serializeState({ ...state, projectName: "test" });
  assert.equal(parseState(json).projectName, "test");
  assert.throws(() => parseState("{"), /JSON/);
});

test("無効カテゴリをプロンプトへ出力しない", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const disabled = { ...state, categories: [{ ...categories[0], enabled: false }] };
  assert.equal(buildPrompt(row, disabled).prompt.includes("choice 0"), false);
});

test("空文字列をプロンプトへ出力しない", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const withEmpty = { ...state, contract: { ...state.contract, required: [...state.contract.required, { id: "empty", text: "", enabled: true }] } };
  assert.equal(buildPrompt(row, withEmpty).prompt.includes(", ,"), false);
});

test("同一タグの不要な重複を除去する", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const duplicate = { ...state, contract: { ...state.contract, primary: [{ id: "dup", text: "hero", enabled: true, usagePercent: 100, promptWeight: 1.2 }] } };
  assert.equal(buildPrompt(row, duplicate).prompt.match(/hero/g)?.length, 1);
});

test("括弧強調形式を正しく出力する", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const result = buildPrompt(row, { ...state, environment: { ...state.environment, weightMode: "parentheses" } });
  assert.match(result.prompt, /^\(\(hero\)\)/);
});

test("重み非対応環境では構文を除去する", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const result = buildPrompt(row, { ...state, environment: { ...state.environment, weightMode: "none" } });
  assert.match(result.prompt, /^hero,/);
});

test("使用率0の主特徴は出力しない", () => {
  const row = { number: 1, attributes: { hairColor: "c0" } };
  const zero = { ...state, contract: { ...state.contract, primary: [{ ...state.contract.primary[0], usagePercent: 0 }] } };
  assert.equal(buildPrompt(row, zero).prompt.includes("calm"), false);
});

test("注意語の置換候補は意味データと対で返る", () => {
  assert.deepEqual(detectSensitive("bust-up")[0], { term: "bust-up", replacement: "upper-body portrait" });
});

test("集計対象を採用だけに限定できる", () => {
  const rows = generatePlan({ categories, total: 6, seed: "status-a" }).rows.map((row, i) => ({ ...row, status: i < 2 ? "adopted" : "generated" }));
  assert.equal(Object.values(aggregate(rows, categories, "adopted").hairColor).reduce((a, b) => a + b, 0), 2);
});

test("保留は採用集計へ含めない", () => {
  const rows = generatePlan({ categories, total: 3, seed: "status-b" }).rows.map((row) => ({ ...row, status: "pending" }));
  assert.equal(Object.values(aggregate(rows, categories, "adopted").hairColor).reduce((a, b) => a + b, 0), 0);
});

test("不採用は採用集計へ含めない", () => {
  const rows = generatePlan({ categories, total: 3, seed: "status-c" }).rows.map((row) => ({ ...row, status: "rejected" }));
  assert.equal(Object.values(aggregate(rows, categories, "adopted").hairColor).reduce((a, b) => a + b, 0), 0);
});

test("不足件数は計画件数から採用件数を引く", () => {
  const rows = generatePlan({ categories, total: 3, seed: "status-d" }).rows.map((row, index) => ({ ...row, status: index === 0 ? "adopted" : "rejected" }));
  assert.equal(calculateShortages(rows, categories).reduce((sum, item) => sum + item.shortage, 0), 2);
});

test("不足分生成は不足している候補を優先する", () => {
  const rows = generatePlan({ categories, total: 6, seed: "priority" }).rows;
  const target = rows[0].attributes.hairColor;
  const marked = rows.map((row) => ({ ...row, status: row.attributes.hairColor === target ? "rejected" : "adopted" }));
  const extra = generateShortfallRows({ ...state, categories, plan: marked });
  assert.ok(extra.some((row) => row.attributes.hairColor === target));
});

test("不足分の追加番号は連番になる", () => {
  const rows = generatePlan({ categories, total: 6, seed: "sequence" }).rows.map((row) => ({ ...row, status: "rejected" }));
  const numbers = generateShortfallRows({ ...state, categories, plan: rows }).map((row) => row.number);
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => 7 + index));
});

test("採用状態を保存・復元できる", () => {
  const saved = parseState(serializeState({ ...state, plan: [{ id: "x", number: 1, attributes: {}, status: "adopted", rejectionReasons: [], note: "", locked: false }] }));
  assert.equal(saved.plan[0].status, "adopted");
});

test("不採用理由を保存・復元できる", () => {
  const saved = parseState(serializeState({ ...state, plan: [{ id: "x", number: 1, attributes: {}, status: "rejected", rejectionReasons: ["顔崩れ"], note: "", locked: false }] }));
  assert.deepEqual(saved.plan[0].rejectionReasons, ["顔崩れ"]);
});

test("メモを保存・復元できる", () => {
  const saved = parseState(serializeState({ ...state, plan: [{ id: "x", number: 1, attributes: {}, status: "pending", rejectionReasons: [], note: "再確認", locked: false }] }));
  assert.equal(saved.plan[0].note, "再確認");
});

test("シードを保存・復元できる", () => {
  assert.equal(parseState(serializeState({ ...state, seed: "restore-seed" })).seed, "restore-seed");
});

test("必要項目がないJSONを安全に拒否する", () => {
  assert.throws(() => parseState('{"schemaVersion":"0.1.0"}'), /必要な項目/);
});

test("保存データにバージョン情報を含める", () => {
  assert.equal(parseState(serializeState(state)).schemaVersion, SCHEMA_VERSION);
});

test("均等・主軸・完全ランダムの配分モードを切り替えられる", () => {
  const weighted = [{ ...categories[0], choices: categories[0].choices.map((item, index) => ({ ...item, targetPercent: index === 0 ? 90 : 5 })) }];
  const equal = generatePlan({ categories: weighted, total: 12, seed: "modes", constraints: { distributionMode: "equal" } }).rows;
  const axis = generatePlan({ categories: weighted, total: 12, seed: "modes", constraints: { distributionMode: "axis" } }).rows;
  const random = generatePlan({ categories: weighted, total: 12, seed: "modes", constraints: { distributionMode: "random" } }).rows;
  assert.ok(Math.max(...Object.values(aggregate(equal, weighted).hairColor)) <= 4);
  assert.ok(Object.values(aggregate(axis, weighted).hairColor)[0] > Object.values(aggregate(axis, weighted).hairColor)[1]);
  assert.equal(random.length, 12);
});

test("最大件数の合計が不足する矛盾を拒否する", () => {
  assert.throws(() => allocateCounts(choices(2).map((item) => ({ ...item, maxCount: 1 })), 5), /最大使用件数/);
});

test("最大連続回数を可能な範囲で抑える", () => {
  const result = generatePlan({ categories, total: 12, seed: "runs", constraints: { maxConsecutive: { hairColor: 2 } } });
  let run = 1; let longest = 1;
  result.rows.slice(1).forEach((row, index) => { run = row.attributes.hairColor === result.rows[index].attributes.hairColor ? run + 1 : 1; longest = Math.max(longest, run); });
  assert.ok(longest <= 2);
});

test("解消不能な禁止条件でも有限時間で結果と警告を返す", () => {
  const single = [{ id: "only", label: "固定", enabled: true, choices: [{ ...choices(1)[0], id: "one" }] }, { id: "only2", label: "固定2", enabled: true, choices: [{ ...choices(1)[0], id: "two" }] }];
  const result = generatePlan({ categories: single, total: 3, seed: "impossible", constraints: { forbiddenPairs: [{ a: "one", b: "two" }] } });
  assert.equal(result.rows.length, 3); assert.ok(result.warnings.length > 0);
});

test("必須特徴の欠落を診断する", () => {
  const plan = generatePlan({ categories, total: 3, seed: "diag-a" }).rows;
  assert.ok(runDiagnostics({ ...state, plan, contract: { ...state.contract, required: [] } }).some((item) => item.text.includes("必須特徴")));
});

test("ネガティブ非対応環境との矛盾を診断する", () => {
  const plan = generatePlan({ categories, total: 3, seed: "diag-b" }).rows;
  assert.ok(runDiagnostics({ ...state, plan, environment: { ...state.environment, negativeMode: "unavailable" } }).some((item) => item.text.includes("ネガティブ")));
});

test("個別コピーは構築済み本文だけを渡す", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /onCopy\(built\.prompt/); assert.doesNotMatch(source, /onCopy\(`No\./);
});

test("選択・折りたたみ状態をARIAで公開する", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-pressed/); assert.match(source, /aria-expanded/); assert.match(source, /aria-live="polite"/);
});

test("スマートフォン、44px操作領域、フォーカス表示をCSSで保証する", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 800px\)/); assert.match(css, /min-height: 44px/); assert.match(css, /:focus-visible/); assert.doesNotMatch(css, /outline:\s*none/);
});

test("主特徴の使用率と重みを独立フィールドとしてレスポンシブ表示する", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /contract-metrics/);
  assert.match(source, /className="contract-field"><span>使用率<\/span><div className="unit-input">/);
  assert.match(source, /className="input-unit"[^>]*>%<\/span>/);
  assert.match(source, /className="contract-field"><span>重み<\/span><input/);
  assert.match(css, /\.contract-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.contract-field\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/s);
  assert.match(css, /\.unit-input input\s*\{[^}]*padding-right:\s*2\.25rem/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.contract-metrics\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

function singleCategoryState(category, patch = {}) {
  const base = createInitialState();
  return {
    ...base,
    ...patch,
    categories: [category],
    outputOrder: [category.id],
    contract: { ...base.contract, required: [], primary: [], constraints: [] },
  };
}

test("日本語の黒髪候補はblack hairを出力する", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const black = hair.choices.find((choice) => choice.labelJa === "黒");
  const category = { ...hair, mode: "fixed", fixedChoiceId: black.id, choices: hair.choices.map((choice) => ({ ...choice, enabled: choice.id === black.id })) };
  const plan = generatePlan({ categories: [category], total: 2, seed: "black" }).rows;
  assert.match(buildPrompt(plan[0], singleCategoryState(category)).prompt, /black hair/);
});

test("固定カテゴリは全件同じ候補になる", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const black = hair.choices.find((choice) => choice.labelJa === "黒");
  const fixed = { ...hair, mode: "fixed", fixedChoiceId: black.id };
  const rows = generatePlan({ categories: [fixed], total: 12, seed: "fixed" }).rows;
  assert.deepEqual([...new Set(rows.map((row) => row.attributes.hairColor))], [black.id]);
});

test("分散カテゴリは指定候補を整数配分する", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const selected = hair.choices.slice(0, 2).map((choice) => ({ ...choice, enabled: true, targetPercent: 50 }));
  const distributed = { ...hair, mode: "distributed", choices: [...selected, ...hair.choices.slice(2).map((choice) => ({ ...choice, enabled: false }))] };
  const rows = generatePlan({ categories: [distributed], total: 10, seed: "distributed" }).rows;
  assert.deepEqual(Object.values(aggregate(rows, [distributed]).hairColor).filter(Boolean).sort((a, b) => a - b), [5, 5]);
});

test("未使用カテゴリはプロンプトへタグを出さない", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const black = hair.choices.find((choice) => choice.labelJa === "黒");
  const disabled = { ...hair, mode: "disabled", enabled: false };
  const result = buildPrompt({ number: 1, attributes: { hairColor: black.id } }, singleCategoryState(disabled));
  assert.equal(result.prompt.includes("black hair"), false);
  assert.equal(categoryMode(disabled), "disabled");
});

test("左45度と右45度は別テンプレートとして保持する", () => {
  const category = makeCategories().find((item) => item.id === "faceDirection");
  const left = category.choices.find((choice) => choice.labelJa === "左45度");
  const right = category.choices.find((choice) => choice.labelJa === "右45度");
  assert.notEqual(left.id, right.id);
  assert.match(left.promptText, /left/);
  assert.match(right.promptText, /right/);
});

test("左右横顔は別候補として保持する", () => {
  const category = makeCategories().find((item) => item.id === "faceDirection");
  const left = category.choices.find((choice) => choice.labelJa === "左横顔");
  const right = category.choices.find((choice) => choice.labelJa === "右横顔");
  assert.notEqual(left.id, right.id);
  assert.match(left.promptText, /full left profile/);
  assert.match(right.promptText, /full right profile/);
});

test("横顔では正面系タグを自動除去する", () => {
  const category = makeCategories().find((item) => item.id === "faceDirection");
  const profile = category.choices.find((choice) => choice.labelJa === "左横顔");
  const fixed = { ...category, mode: "fixed", fixedChoiceId: profile.id };
  const face = singleCategoryState(fixed);
  face.contract.required = [{ id: "front", text: "front view, both eyes visible", enabled: true, promptWeight: 1 }];
  const result = buildPrompt({ number: 1, attributes: { faceDirection: profile.id } }, face);
  assert.match(result.prompt, /full left profile/);
  assert.doesNotMatch(result.prompt, /front view|both eyes visible/);
  assert.ok(result.adjustments.length > 0);
});

test("振り向きテンプレートは後ろ向き要素を含む", () => {
  const category = makeCategories().find((item) => item.id === "faceDirection");
  const rear = category.choices.find((choice) => choice.labelJa === "後ろから振り向き");
  assert.match(rear.promptText, /rear three-quarter view/);
  assert.match(rear.promptText, /body turned away/);
});

test("目を閉じる場合はlooking at viewerを除去する", () => {
  const gaze = makeCategories().find((item) => item.id === "gaze");
  const closed = gaze.choices.find((choice) => choice.labelJa === "目を閉じる");
  const fixed = { ...gaze, mode: "fixed", fixedChoiceId: closed.id };
  const face = singleCategoryState(fixed);
  face.contract.required = [{ id: "look", text: "looking at viewer", enabled: true, promptWeight: 1 }];
  const result = buildPrompt({ number: 1, attributes: { gaze: closed.id } }, face);
  assert.match(result.prompt, /eyes closed/);
  assert.doesNotMatch(result.prompt, /looking at viewer/);
});

test("超アップと腰上を同時出力しない", () => {
  const base = createInitialState();
  const custom = { ...base, categories: [], outputOrder: [], contract: { ...base.contract, required: [{ id: "crop", text: "extreme close portrait, waist-up portrait", enabled: true, promptWeight: 1 }], primary: [], constraints: [] } };
  const result = buildPrompt({ number: 1, attributes: {} }, custom);
  assert.match(result.prompt, /extreme close portrait/);
  assert.doesNotMatch(result.prompt, /waist-up portrait/);
});

test("短髪とロングヘアを同時出力しない", () => {
  const base = createInitialState();
  const custom = { ...base, categories: [], outputOrder: [], contract: { ...base.contract, required: [{ id: "hair", text: "short hair, long hair", enabled: true, promptWeight: 1 }], primary: [], constraints: [] } };
  const result = buildPrompt({ number: 1, attributes: {} }, custom);
  assert.match(result.prompt, /short hair/);
  assert.doesNotMatch(result.prompt, /long hair/);
});

test("60件指定時は整数化後も合計60件になる", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const counts = allocateCounts(hair.choices, 60);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 60);
});

test("固定カテゴリは偏り警告の対象外になる", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const black = hair.choices[0];
  const fixed = { ...hair, mode: "fixed", fixedChoiceId: black.id };
  const plan = Array.from({ length: 10 }, (_, index) => ({ id: `r${index}`, number: index + 1, attributes: { hairColor: black.id }, status: "uncreated", rejectionReasons: [], note: "", locked: false }));
  const result = runDiagnostics({ ...singleCategoryState(fixed), plan, objective: { primary: "キャラクターLoRA", secondary: "", count: 10 } });
  assert.equal(result.some((warning) => warning.text.includes("髪色") && warning.text.includes("偏")), false);
});

test("顔角度の左右配分は設定比率から大きく逸脱しない", () => {
  const direction = makeCategories().find((category) => category.id === "faceDirection");
  const rows = generatePlan({ categories: [direction], total: 60, seed: "left-right", constraints: { maxConsecutive: { faceDirection: 2 } } }).rows;
  const index = Object.fromEntries(direction.choices.map((choice) => [choice.id, choice]));
  const left = rows.filter((row) => index[row.attributes.faceDirection].direction?.startsWith("left")).length;
  const right = rows.filter((row) => index[row.attributes.faceDirection].direction?.startsWith("right")).length;
  assert.ok(Math.abs(left - right) <= 2);
});

test("同じ顔角度が過度に連続しない", () => {
  const direction = makeCategories().find((category) => category.id === "faceDirection");
  const rows = generatePlan({ categories: [direction], total: 60, seed: "angle-runs", constraints: { maxConsecutive: { faceDirection: 2 } } }).rows;
  let longest = 1; let run = 1;
  rows.slice(1).forEach((row, index) => { run = row.attributes.faceDirection === rows[index].attributes.faceDirection ? run + 1 : 1; longest = Math.max(longest, run); });
  assert.ok(longest <= 2);
});

test("自動テンプレートへadult系とbust系を入れない", () => {
  const prompts = makeCategories().flatMap((category) => category.choices.map((choice) => choice.promptText)).join(", ");
  assert.equal(detectSensitive(prompts).length, 0);
});

test("自由入力の注意語は削除せず置換候補を返す", () => {
  const result = detectSensitive("adult male, bust portrait");
  assert.ok(result.some((item) => item.term === "adult male"));
  assert.ok(result.some((item) => item.replacement === "head-and-shoulders portrait"));
});

test("元LoRA発動語は生成Positiveへ残る", () => {
  const base = createInitialState();
  const custom = { ...base, categories: [], outputOrder: [], phrasePolicy: { ...base.phrasePolicy, sourceTriggerWords: "Source Trigger" }, contract: { ...base.contract, required: [], primary: [], constraints: [] } };
  assert.match(buildPrompt({ number: 1, attributes: {} }, custom).prompt, /Source Trigger/);
});

test("キャプション除外語はキャプションだけから消える", () => {
  const hair = makeCategories().find((category) => category.id === "hairColor");
  const black = hair.choices.find((choice) => choice.labelJa === "黒");
  const fixed = { ...hair, mode: "fixed", fixedChoiceId: black.id };
  const custom = singleCategoryState(fixed, { captionSettings: { enabled: true, triggerWord: "newface", includeCategoryIds: ["hairColor"] }, phrasePolicy: { sourceTriggerWords: "", captionExclusions: " BLACK   HAIR ", forbiddenPositive: "", learningTargetMemo: "" } });
  const result = buildPrompt({ number: 1, attributes: { hairColor: black.id } }, custom);
  assert.match(result.prompt, /black hair/);
  assert.equal(result.caption, "newface");
});

test("完全禁止語はPositiveだけから除去する", () => {
  const base = createInitialState();
  const custom = { ...base, categories: [], outputOrder: [], phrasePolicy: { ...base.phrasePolicy, forbiddenPositive: "  Unwanted   Tag " }, contract: { ...base.contract, required: [{ id: "ban", text: "unwanted tag, keeper", enabled: true, promptWeight: 1 }], primary: [], constraints: [] } };
  const result = buildPrompt({ number: 1, attributes: {} }, custom);
  assert.equal(result.prompt, "keeper");
  assert.ok(result.adjustments.some((item) => item.includes("完全禁止語")));
});

test("語句比較は大文字小文字と連続空白を正規化する", () => {
  assert.equal(normalizePhrase("  Black   Hair  "), normalizePhrase("black hair"));
});

test("旧0.1.0 JSONを新形式へ移行し旧候補と採用状態を保持する", () => {
  const old = {
    schemaVersion: "0.1.0",
    objective: { primary: "人物／顔LoRA", secondary: "", count: 3 },
    categories: [{ id: "legacy", label: "旧項目", enabled: true, choices: [{ id: "old-choice", labelJa: "旧候補", promptText: "legacy tag", enabled: true, targetPercent: 100 }] }],
    plan: [{ id: "old-row", number: 1, attributes: { legacy: "old-choice" }, status: "adopted", rejectionReasons: [], note: "保持", locked: false }],
  };
  const migrated = migrateState(old);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.objective.primary, "顔LoRA");
  assert.ok(migrated.categories.some((category) => category.id === "legacy"));
  assert.equal(migrated.plan[0].status, "adopted");
  assert.equal(migrated.plan[0].note, "保持");
});

test("ユーザープリセットを保存・読込でき、計画は持ち込まない", () => {
  const base = createInitialState();
  const preset = createUserPreset({ ...base, faceLoraType: "fixed-character" }, "固定顔");
  const loaded = applyUserPreset({ ...base, plan: [{ id: "x" }] }, preset);
  assert.equal(preset.name, "固定顔");
  assert.equal(loaded.faceLoraType, "fixed-character");
  assert.deepEqual(loaded.plan, []);
});

test("ユーザープリセットJSONをエクスポート・インポートできる", () => {
  const preset = createUserPreset(createInitialState(), "標準顔");
  const restored = parseUserPresets(serializeUserPresets([preset]));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, "標準顔");
});

test("日本語チップUIはARIA、役割、折りたたみ要約、プリセット操作を備える", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /choice-chip-grid/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /category-role-badge/);
  assert.match(source, /候補から分散/);
  assert.match(source, /名前を付けて保存/);
  assert.match(source, /プリセットを削除/);
  assert.match(source, /const summary =/);
});

test("主要チップと役割操作は44px以上で折り返す", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.choice-chip-grid\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.choice-chip-grid button\s*\{[^}]*min-height:\s*56px/s);
  assert.match(css, /\.role-selector button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.status-selector button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
