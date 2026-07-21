import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregate, allocateCounts, buildPrompt, calculateShortages, detectSensitive, generatePlan,
  generateShortfallRows, parseState, replaceRowPreservingDistribution, runDiagnostics, serializeState,
} from "../src/core.mjs";

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
  assert.equal(parseState(serializeState(state)).schemaVersion, "0.1.0");
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
