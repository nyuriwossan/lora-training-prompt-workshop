"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore — pure ESM core is shared with the browser and Node tests.
import {
  aggregate, buildPrompt, calculateShortages, choiceIndex, generatePlan,
  generateShortfallRows, makeId, parseState, replaceRowPreservingDistribution,
  runDiagnostics, serializeState,
} from "../src/core.mjs";
// @ts-ignore — preset data intentionally stays framework independent.
import { applyPreset, createInitialState, PRESETS } from "../src/presets.mjs";

const STEPS = [
  [1, "生成環境", "環境に合う出力構文を決めます"],
  [2, "学習目的", "LoRAで学ばせる中心を決めます"],
  [3, "学習契約", "固定・主特徴・除外を分けます"],
  [4, "分散属性", "固定させない属性を設計します"],
  [5, "制約と配分", "比率・禁止ペア・シードを設定します"],
  [6, "計画確認", "件数と偏りを生成前に確認します"],
  [7, "プロンプト出力", "一件ずつ生成・コピーします"],
  [8, "採用・再集計", "採用分だけで不足を補います"],
] as const;

const OBJECTIVES = ["人物／顔LoRA", "キャラクター再現LoRA", "表情／目元LoRA", "髪型／髪質LoRA", "衣装LoRA", "ポーズ／構図LoRA", "背景LoRA", "塗り／画風LoRA", "光／質感LoRA", "複合タイプ"];
const STATUS = [
  ["uncreated", "未生成"], ["generated", "生成済み"], ["adopted", "採用"], ["pending", "保留"], ["rejected", "不採用"],
];
const REJECTION_REASONS = ["顔崩れ", "手崩れ", "特徴不足", "特徴過剰", "構図違い", "背景違い", "人物が似すぎ", "不要物混入", "センシティブ判定", "その他"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="section-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}

function Notice({ tone = "info", children }: { tone?: string; children: React.ReactNode }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span aria-hidden="true">{tone === "error" ? "!" : tone === "success" ? "✓" : "i"}</span><div>{children}</div></div>;
}

function Segmented({ value, options, onChange, label }: { value: string; options: Array<string | [string, string]>; onChange: (value: string) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => { const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option]; return <button key={optionValue} type="button" className={value === optionValue ? "selected" : ""} aria-pressed={value === optionValue} onClick={() => onChange(optionValue)}>{optionLabel}</button>; })}</div>;
}

function Stat({ value, label, accent = false }: { value: string | number; label: string; accent?: boolean }) {
  return <div className={`stat ${accent ? "accent" : ""}`}><strong>{value}</strong><span>{label}</span></div>;
}

export default function Home() {
  const [state, setState] = useState<any>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [presetId, setPresetId] = useState("cold_semireal_male");
  const [showDetails, setShowDetails] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState("hairColor");
  const [pasteValues, setPasteValues] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any>(null);
  const [bulkFormat, setBulkFormat] = useState({ negative: false, numbered: false, separator: "blank" });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lora-workshop-project");
      if (saved) setState(parseState(saved));
    } catch { /* Start safely with the bundled preset. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        const next = { ...state, lastSavedAt: new Date().toISOString() };
        localStorage.setItem("lora-workshop-project", serializeState(next));
      } catch { setError("ブラウザの保存容量が不足しています。JSONを書き出してから、古い保存データを整理してください。"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state, hydrated]);

  const choices = useMemo(() => choiceIndex(state.categories), [state.categories]);
  const activeCategories = useMemo(() => state.categories.filter((category: any) => category.enabled), [state.categories]);
  const plannedCounts = useMemo(() => aggregate(state.plan, state.categories), [state.plan, state.categories]);
  const shortages = useMemo(() => calculateShortages(state.plan, state.categories), [state.plan, state.categories]);
  const adoptedCount = state.plan.filter((row: any) => row.status === "adopted").length;
  const diagnostics = useMemo(() => state.plan.length ? runDiagnostics(state) : [], [state]);
  const activeStep = Number(state.activeStep || 1);

  function patchState(patch: any) { setState((current: any) => ({ ...current, ...patch, updatedAt: new Date().toISOString() })); }
  function updateEnvironment(key: string, value: any) { patchState({ environment: { ...state.environment, [key]: value }, plan: [] }); }
  function updateObjective(key: string, value: any) { patchState({ objective: { ...state.objective, [key]: value }, plan: [] }); }
  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
  function goTo(step: number) { patchState({ activeStep: Math.max(1, Math.min(8, step)) }); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function updateContract(group: string, id: string, patch: any) {
    patchState({ contract: { ...state.contract, [group]: state.contract[group].map((item: any) => item.id === id ? { ...item, ...patch } : item) }, plan: [] });
  }
  function addContract(group: string) {
    patchState({ contract: { ...state.contract, [group]: [...state.contract[group], { id: makeId(group), text: "", enabled: true, usagePercent: group === "primary" ? 70 : 100, promptWeight: 1 }] } });
  }
  function removeContract(group: string, id: string) {
    patchState({ contract: { ...state.contract, [group]: state.contract[group].filter((item: any) => item.id !== id) }, plan: [] });
  }

  function updateCategory(categoryId: string, patch: any) {
    patchState({ categories: state.categories.map((category: any) => category.id === categoryId ? { ...category, ...patch } : category), plan: [] });
  }
  function updateChoice(categoryId: string, choiceId: string, patch: any) {
    patchState({ categories: state.categories.map((category: any) => category.id === categoryId ? { ...category, choices: category.choices.map((choice: any) => choice.id === choiceId ? { ...choice, ...patch } : choice) } : category), plan: [] });
  }
  function deleteChoice(categoryId: string, choiceId: string) {
    patchState({ categories: state.categories.map((category: any) => category.id === categoryId ? { ...category, choices: category.choices.filter((choice: any) => choice.id !== choiceId) } : category), plan: [] });
  }
  function addChoice(categoryId: string, labelJa = "新しい候補", promptText = "") {
    const category = state.categories.find((item: any) => item.id === categoryId);
    const choice = { id: makeId(categoryId), labelJa, promptText, enabled: true, targetPercent: category.choices.length ? 0 : 100, minCount: 0, maxCount: null, promptWeight: 1, intensityLevel: "standard", intensityTags: {}, notes: "" };
    updateCategory(categoryId, { choices: [...category.choices, choice] });
  }
  function addPasted(categoryId: string) {
    const lines = (pasteValues[categoryId] || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const category = state.categories.find((item: any) => item.id === categoryId);
    const additions = lines.map((line, index) => {
      const [label, prompt = label] = line.includes("|") ? line.split("|").map((item) => item.trim()) : [line, line];
      return { id: makeId(`${categoryId}_${index}`), labelJa: label, promptText: prompt, enabled: true, targetPercent: 0, minCount: 0, maxCount: null, promptWeight: 1, intensityLevel: "standard", intensityTags: {}, notes: "" };
    });
    updateCategory(categoryId, { choices: [...category.choices, ...additions] });
    setPasteValues((current) => ({ ...current, [categoryId]: "" }));
    flash(`${category.label}へ${additions.length}件追加しました`);
  }
  function equalize(categoryId: string) {
    const category = state.categories.find((item: any) => item.id === categoryId);
    const enabled = category.choices.filter((choice: any) => choice.enabled).length || 1;
    const percent = Number((100 / enabled).toFixed(2));
    updateCategory(categoryId, { choices: category.choices.map((choice: any) => ({ ...choice, targetPercent: choice.enabled ? percent : 0 })) });
  }

  function createPlan() {
    setError("");
    try {
      const result = generatePlan({ categories: state.categories, total: Number(state.objective.count), seed: state.seed, constraints: state.constraints });
      patchState({ plan: result.rows, warnings: result.warnings, diagnostics: [], activeStep: 6 });
      flash(`${result.rows.length}件の学習計画を作成しました`);
    } catch (caught: any) { setError(caught.message || "計画を生成できませんでした。設定を確認してください。"); }
  }

  function setRowStatus(rowId: string, status: string) {
    patchState({ plan: state.plan.map((row: any) => row.id === rowId ? { ...row, status, rejectionReasons: status === "rejected" ? row.rejectionReasons : [] } : row) });
  }
  function patchRow(rowId: string, patch: any) { patchState({ plan: state.plan.map((row: any) => row.id === rowId ? { ...row, ...patch } : row) }); }
  function replaceRow(rowId: string) {
    const result = replaceRowPreservingDistribution(state.plan, rowId, state.categories, state.seed);
    patchState({ plan: result.rows });
    if (result.warning) setError(result.warning); else flash("全体の配分を維持して差し替えました");
  }
  function addShortfalls() {
    const additions = generateShortfallRows(state);
    if (!additions.length) { flash("不足はありません。採用比率は計画を満たしています"); return; }
    patchState({ plan: [...state.plan, ...additions], activeStep: 7 });
    flash(`不足を優先した${additions.length}件を追加しました`);
  }

  async function copyText(text: string, success: string) {
    try { await navigator.clipboard.writeText(text.trim()); flash(success); }
    catch { setError("クリップボードへ書き込めませんでした。ブラウザの権限を確認してください。"); }
  }
  function bulkText() {
    const separator = bulkFormat.separator === "rule" ? "\n\n---\n\n" : bulkFormat.separator === "line" ? "\n" : "\n\n";
    return state.plan.map((row: any) => {
      const built = buildPrompt(row, state);
      const number = bulkFormat.numbered ? `No.${String(row.number).padStart(2, "0")}\n` : "";
      const negative = bulkFormat.negative && built.negative ? `\nNegative: ${built.negative}` : "";
      return `${number}${built.prompt}${negative}`;
    }).join(separator);
  }

  function download(name: string, content: string, type = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  }
  function exportJson() { download("lora-prompt-workshop.json", serializeState(state)); }
  async function importJson(file?: File) {
    if (!file) return;
    try { setImportPreview(parseState(await file.text())); setError(""); }
    catch (caught: any) { setError(caught.message); }
  }
  function confirmImport() { if (importPreview) { setState(importPreview); setImportPreview(null); flash("バックアップを読み込みました"); } }

  const stepContent: Record<number, React.ReactNode> = {
    1: <>
      <SectionTitle eyebrow="STEP 1 / ENVIRONMENT" title="まず、生成環境を合わせる" description="モデルごとに違う重みやネガティブの構文を、ここで出力だけに反映します。学習内容のデータは変わりません。" />
      <div className="panel accent-panel">
        <div><span className="mini-label">STARTER PRESET</span><h3>検証済みの構成から始める</h3><p>入力済みの設定へプリセットを適用すると、学習契約を置き換えます。</p></div>
        <div className="preset-row"><select value={presetId} onChange={(event) => setPresetId(event.target.value)} aria-label="プリセット">{PRESETS.map((preset: any) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button className="button primary" type="button" onClick={() => { if (state.plan.length && !confirm("現在の計画を消してプリセットを適用しますか？")) return; setState(applyPreset(state, presetId)); flash("プリセットを適用しました"); }}>適用する</button></div>
      </div>
      <div className="form-grid">
        <Field label="利用環境"><select value={state.environment.platform} onChange={(e) => updateEnvironment("platform", e.target.value)}><option>PIXAIアプリ版</option><option>PIXAIブラウザ版</option><option>その他</option><option>カスタム</option></select></Field>
        <Field label="生成モデル系統"><select value={state.environment.modelFamily} onChange={(e) => updateEnvironment("modelFamily", e.target.value)}><option>SDXL系</option><option>DiT.1系</option><option>DiT.2系</option><option>その他</option><option>不明</option></select></Field>
        <Field label="ネガティブプロンプト"><select value={state.environment.negativeMode} onChange={(e) => updateEnvironment("negativeMode", e.target.value)}><option value="available">使用可能</option><option value="unavailable">使用不可</option><option value="unknown">不明</option></select></Field>
        <Field label="重み構文"><select value={state.environment.weightMode} onChange={(e) => updateEnvironment("weightMode", e.target.value)}><option value="numeric">数値重み対応</option><option value="parentheses">括弧強調対応</option><option value="none">重み付け不可</option><option value="unknown">不明</option></select></Field>
        <Field label="プロンプト形式"><select value={state.environment.promptFormat} onChange={(e) => updateEnvironment("promptFormat", e.target.value)}><option value="tags">カンマ区切りタグ</option><option value="natural">自然文</option><option value="mixed">混合形式</option></select></Field>
        <Field label="センシティブ語句チェック"><Segmented value={state.environment.sensitiveCheck ? "有効" : "無効"} options={["有効", "無効"]} label="センシティブ語句チェック" onChange={(value) => updateEnvironment("sensitiveCheck", value === "有効")} /></Field>
      </div>
      <Notice>環境や仕様変更によって実際の挙動が異なる場合があります。すべての項目は手動で上書きできます。</Notice>
    </>,
    2: <>
      <SectionTitle eyebrow="STEP 2 / PURPOSE" title="LoRAの役割を一つに絞る" description="主目的は一つ。副目的は必要な場合だけ選び、常に同時に学習させる特徴を増やしすぎないようにします。" />
      <Field label="主目的"><div className="choice-grid">{OBJECTIVES.map((item) => <button type="button" key={item} className={`choice-tile ${state.objective.primary === item ? "selected" : ""}`} aria-pressed={state.objective.primary === item} onClick={() => updateObjective("primary", item)}><span>{item}</span><small>{item === "人物／顔LoRA" ? "顔立ちと人物特徴" : item === "塗り／画風LoRA" ? "描画表現と線・色" : "学習対象として設定"}</small></button>)}</div></Field>
      <div className="form-grid top-gap"><Field label="副目的（任意）"><select value={state.objective.secondary} onChange={(e) => updateObjective("secondary", e.target.value)}><option value="">設定しない</option>{OBJECTIVES.filter((item) => item !== state.objective.primary).map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="生成予定本数" hint="MVPでは1〜200件"><input type="number" min="1" max="200" value={state.objective.count} onChange={(e) => updateObjective("count", Math.max(1, Math.min(200, Number(e.target.value))))} /></Field></div>
      {(state.objective.primary === "複合タイプ" || state.objective.secondary) && <Notice tone="warning">複数の特徴が常に同時に存在すると、それぞれを個別に制御できず、一まとまりの特徴として学習される可能性があります。</Notice>}
    </>,
    3: <>
      <SectionTitle eyebrow="STEP 3 / LEARNING CONTRACT" title="覚えさせるもの、自由にするもの" description="使用率とプロンプト内の強さを分けて設定します。必須特徴は原則全件、主特徴は指定した割合だけ入ります。" />
      <ContractEditor title="必須特徴" description="原則として全プロンプトに含める核" group="required" items={state.contract.required} onAdd={() => addContract("required")} onUpdate={updateContract} onRemove={removeContract} />
      <ContractEditor title="主特徴" description="高い割合で含めるが、全件には固定しない特徴" group="primary" items={state.contract.primary} onAdd={() => addContract("primary")} onUpdate={updateContract} onRemove={removeContract} usage />
      <ContractEditor title="ネガティブ専用" description="対応環境のネガティブ欄だけへ出力" group="negative" items={state.contract.negative} onAdd={() => addContract("negative")} onUpdate={updateContract} onRemove={removeContract} simple />
      <ContractEditor title="ポジティブ側の必須制約" description="single character など、通常プロンプトへ入れる制約" group="constraints" items={state.contract.constraints} onAdd={() => addContract("constraints")} onUpdate={updateContract} onRemove={removeContract} simple />
      {[...state.contract.required, ...state.contract.primary].some((item: any) => Number(item.promptWeight) > 1.3) && <Notice tone="warning">強い重みです。モデルによっては特徴の過剰表現や生成崩れが起こる可能性があります。</Notice>}
    </>,
    4: <>
      <SectionTitle eyebrow="STEP 4 / VARIATION" title="固定させたくない属性を散らす" description="カテゴリごとに候補・目標比率・最低／最大件数・強度を設定します。無効なカテゴリは生成と診断から外れます。" />
      <div className="category-toolbar"><p><strong>{activeCategories.length}</strong>カテゴリを使用中</p><button className="button subtle" type="button" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>{showDetails ? "詳細カテゴリを閉じる" : "詳細カテゴリを表示"}</button></div>
      <div className="category-list">{state.categories.filter((category: any) => !category.detail || showDetails).map((category: any) => <CategoryEditor key={category.id} category={category} expanded={expandedCategory === category.id} onExpand={() => setExpandedCategory(expandedCategory === category.id ? "" : category.id)} onToggle={(enabled: boolean) => updateCategory(category.id, { enabled })} onChoice={updateChoice} onDelete={deleteChoice} onAdd={addChoice} onEqualize={equalize} pasteValue={pasteValues[category.id] || ""} onPasteValue={(value: string) => setPasteValues((current) => ({ ...current, [category.id]: value }))} onAddPasted={addPasted} />)}</div>
    </>,
    5: <>
      <SectionTitle eyebrow="STEP 5 / DISTRIBUTION" title="配分を、乱数より先に決める" description="同じシードなら同じ計画を再現します。禁止条件を守りながら、カテゴリごとの件数を先に確定します。" />
      <div className="panel"><h3>配分方法</h3><Segmented value={state.constraints.distributionMode} options={[["equal", "均等"], ["ratio", "指定比率"], ["axis", "主軸多め"], ["random", "完全ランダム"], ["shortage", "不足優先"]]} label="配分方法" onChange={(value) => patchState({ constraints: { ...state.constraints, distributionMode: value } })} />{state.constraints.distributionMode === "random" && <Notice tone="warning">完全ランダムでは偏りが生じる可能性があります。学習セットの設計には均等または指定比率を推奨します。</Notice>}</div>
      <div className="form-grid top-gap"><Field label="乱数シード"><div className="input-action"><input value={state.seed} onChange={(e) => patchState({ seed: e.target.value, plan: [] })} /><button type="button" className="button subtle" onClick={() => patchState({ seed: `lora-${Date.now().toString(36)}`, plan: [] })}>再生成</button></div></Field><Field label="生成本数"><input type="number" min="1" max="200" value={state.objective.count} onChange={(e) => updateObjective("count", Number(e.target.value))} /></Field></div>
      <div className="panel top-gap"><div className="panel-header"><div><span className="mini-label">PAIR CONSTRAINTS</span><h3>禁止ペア</h3></div><button type="button" className="button subtle" onClick={() => patchState({ constraints: { ...state.constraints, forbiddenPairs: [...state.constraints.forbiddenPairs, { id: makeId("pair"), a: "", b: "" }] } })}>＋ ペアを追加</button></div>{state.constraints.forbiddenPairs.map((pair: any) => <div className="pair-row" key={pair.id}><select value={pair.a} onChange={(e) => patchState({ constraints: { ...state.constraints, forbiddenPairs: state.constraints.forbiddenPairs.map((item: any) => item.id === pair.id ? { ...item, a: e.target.value } : item) } })}><option value="">候補を選択</option>{Object.values(choices).map((choice: any) => <option value={choice.id} key={choice.id}>{choice.categoryLabel} / {choice.labelJa}</option>)}</select><span>×</span><select value={pair.b} onChange={(e) => patchState({ constraints: { ...state.constraints, forbiddenPairs: state.constraints.forbiddenPairs.map((item: any) => item.id === pair.id ? { ...item, b: e.target.value } : item) } })}><option value="">候補を選択</option>{Object.values(choices).map((choice: any) => <option value={choice.id} key={choice.id}>{choice.categoryLabel} / {choice.labelJa}</option>)}</select><button type="button" className="icon-button danger" aria-label="禁止ペアを削除" onClick={() => patchState({ constraints: { ...state.constraints, forbiddenPairs: state.constraints.forbiddenPairs.filter((item: any) => item.id !== pair.id) } })}>×</button></div>)}</div>
      <div className="panel top-gap"><h3>最大連続回数</h3><div className="form-grid compact">{activeCategories.slice(0, 8).map((category: any) => <Field key={category.id} label={category.label}><input type="number" min="1" max="10" value={state.constraints.maxConsecutive[category.id] || 2} onChange={(e) => patchState({ constraints: { ...state.constraints, maxConsecutive: { ...state.constraints.maxConsecutive, [category.id]: Number(e.target.value) } } })} /></Field>)}</div></div>
      <button className="button primary large wide top-gap" type="button" onClick={createPlan}>学習計画を生成する <span>→</span></button>
    </>,
    6: <>
      <SectionTitle eyebrow="STEP 6 / PLAN REVIEW" title="生成前に、セット全体を見る" description="一枚の良さではなく、全体の件数・連続・組み合わせを確認します。気になる項目は前のステップで調整できます。" />
      {!state.plan.length ? <EmptyPlan onCreate={createPlan} /> : <><div className="stats-grid"><Stat value={state.plan.length} label="計画プロンプト" accent /><Stat value={activeCategories.length} label="分散カテゴリ" /><Stat value={state.warnings.length} label="未解決の制約" /><Stat value={state.seed.slice(0, 10)} label="シード" /></div>{state.warnings.map((warning: string) => <Notice key={warning} tone="warning">{warning}</Notice>)}<DistributionTable state={state} counts={plannedCounts} /><div className="diagnostics"><h3>偏り診断</h3>{diagnostics.map((item: any, index: number) => <Notice key={`${item.text}-${index}`} tone={item.level}>{item.text}</Notice>)}</div><div className="action-row"><button className="button subtle" type="button" onClick={() => goTo(5)}>配分を調整</button><button className="button primary" type="button" onClick={() => goTo(7)}>プロンプトを見る →</button></div></>}
    </>,
    7: <>
      <SectionTitle eyebrow="STEP 7 / PROMPTS" title="純粋な本文だけをコピーする" description="番号・見出し・属性・メモはコピー対象に入りません。カードは構造化データから毎回再構築されます。" />
      {!state.plan.length ? <EmptyPlan onCreate={createPlan} /> : <><div className="bulk-bar"><div><strong>{state.plan.length}件のプロンプト</strong><span>採用 {adoptedCount} ・ 生成済み {state.plan.filter((row: any) => row.status === "generated").length}</span></div><button className="button subtle" type="button" onClick={() => copyText(bulkText(), "全プロンプトをコピーしました")}>一括コピー</button><button className="button subtle" type="button" onClick={() => download("lora-prompts.txt", bulkText(), "text/plain")}>TXT出力</button></div><details className="bulk-options"><summary>一括出力の形式</summary><div className="form-grid compact"><Field label="内容"><select value={bulkFormat.negative ? "with" : "prompt"} onChange={(e) => setBulkFormat({ ...bulkFormat, negative: e.target.value === "with" })}><option value="prompt">プロンプトのみ</option><option value="with">プロンプト＋ネガティブ</option></select></Field><Field label="番号"><select value={bulkFormat.numbered ? "yes" : "no"} onChange={(e) => setBulkFormat({ ...bulkFormat, numbered: e.target.value === "yes" })}><option value="no">番号なし</option><option value="yes">番号付き</option></select></Field><Field label="区切り"><select value={bulkFormat.separator} onChange={(e) => setBulkFormat({ ...bulkFormat, separator: e.target.value })}><option value="blank">空行</option><option value="rule">---</option><option value="line">一行ずつ</option></select></Field></div></details><div className="prompt-list">{state.plan.map((row: any) => <PromptCard key={row.id} row={row} state={state} choices={choices} onCopy={copyText} onStatus={setRowStatus} onPatch={patchRow} onReplace={replaceRow} />)}</div></>}
    </>,
    8: <>
      <SectionTitle eyebrow="STEP 8 / CURATION" title="採用画像だけで、配分を測り直す" description="保留と不採用は集計から外します。不足した属性を優先し、元の番号の続きへ追加プロンプトを作ります。" />
      {!state.plan.length ? <EmptyPlan onCreate={createPlan} /> : <><div className="stats-grid"><Stat value={state.plan.length} label="計画・追加合計" /><Stat value={adoptedCount} label="採用画像" accent /><Stat value={state.plan.filter((row: any) => row.status === "pending").length} label="保留" /><Stat value={shortages.reduce((sum: number, item: any) => sum + item.shortage, 0)} label="属性不足の合計" /></div><ShortageTable shortages={shortages} /><button type="button" className="button primary large wide top-gap" onClick={addShortfalls}>不足分だけ追加生成する <span>＋</span></button><div className="rejection-summary"><h3>不採用理由</h3>{REJECTION_REASONS.map((reason) => { const count = state.plan.filter((row: any) => row.rejectionReasons?.includes(reason)).length; return <div key={reason}><span>{reason}</span><strong>{count}</strong></div>; })}</div></>}
    </>,
  };

  return <main>
    <header className="app-header"><div className="brand"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><p>LoRA Training Prompt Workshop</p><h1>LoRA学習プロンプト工房</h1></div></div><div className="header-actions"><label className="project-name"><span>プロジェクト</span><input value={state.projectName} onChange={(e) => patchState({ projectName: e.target.value })} /></label><button type="button" className="button subtle" onClick={exportJson}>JSON保存</button><button type="button" className="button subtle" onClick={() => fileInput.current?.click()}>読込</button><input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(e) => importJson(e.target.files?.[0])} /></div></header>
    <div className="step-shell"><nav className="step-nav" aria-label="作業ステップ">{STEPS.map(([number, label]) => <button type="button" key={number} className={activeStep === number ? "active" : activeStep > number ? "complete" : ""} aria-current={activeStep === number ? "step" : undefined} onClick={() => goTo(number)}><span>{activeStep > number ? "✓" : number}</span><b>{label}</b></button>)}</nav><div className="progress-line"><span style={{ width: `${(activeStep / 8) * 100}%` }} /></div></div>
    <div className="workspace"><aside className="context-rail"><span className="mini-label">DATASET FIRST</span><h2>一枚ではなく、<br />セット全体を設計する。</h2><p>覚えさせたい特徴と、固定させたくない特徴を分けて、不要な相関を減らします。</p><div className="rail-stats"><div><strong>{state.objective.count}</strong><span>予定枚数</span></div><div><strong>{activeCategories.length}</strong><span>分散属性</span></div><div><strong>{adoptedCount}</strong><span>採用</span></div></div><div className="rail-note"><span>今の作業</span><strong>{STEPS[activeStep - 1][1]}</strong><p>{STEPS[activeStep - 1][2]}</p></div><div className="privacy-note">入力内容は端末内だけに保存され、外部へ送信されません。</div></aside><section className="main-panel">{error && <Notice tone="error"><strong>設定を確認してください</strong><br />{error}<button className="text-button" type="button" onClick={() => setError("")}>閉じる</button></Notice>}{stepContent[activeStep]}</section></div>
    <footer className="mobile-footer"><button type="button" className="button subtle" disabled={activeStep === 1} onClick={() => goTo(activeStep - 1)}>← 戻る</button><div><span>{activeStep} / 8</span><strong>{STEPS[activeStep - 1][1]}</strong></div><button type="button" className="button primary" disabled={activeStep === 8} onClick={() => goTo(activeStep + 1)}>次へ →</button></footer>
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    {importPreview && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><span className="mini-label">IMPORT PREVIEW</span><h2 id="import-title">このプロジェクトへ置き換えますか？</h2><dl><div><dt>プロジェクト名</dt><dd>{importPreview.projectName}</dd></div><div><dt>保存バージョン</dt><dd>{importPreview.schemaVersion}</dd></div><div><dt>プロンプト件数</dt><dd>{importPreview.plan?.length || 0}件</dd></div></dl><Notice tone="warning">現在の入力内容は置き換わります。必要なら先にJSON保存してください。</Notice><div className="action-row"><button className="button subtle" type="button" onClick={() => setImportPreview(null)}>キャンセル</button><button className="button primary" type="button" onClick={confirmImport}>置き換えて読込</button></div></section></div>}
  </main>;
}

function ContractEditor({ title, description, group, items, onAdd, onUpdate, onRemove, usage = false, simple = false }: any) {
  return <section className="panel contract-panel"><div className="panel-header"><div><span className="mini-label">{group.toUpperCase()}</span><h3>{title}</h3><p>{description}</p></div><button type="button" className="button subtle" onClick={onAdd}>＋ 追加</button></div><div className="contract-list">{items.map((item: any) => <div className="contract-row" key={item.id}><input type="checkbox" checked={item.enabled !== false} onChange={(e) => onUpdate(group, item.id, { enabled: e.target.checked })} aria-label={`${item.text || title}を有効にする`} /><input className="grow" value={item.text} placeholder="英語プロンプト" onChange={(e) => onUpdate(group, item.id, { text: e.target.value })} />{!simple && <div className={`contract-metrics ${usage ? "" : "single"}`}>{usage && <label className="contract-field"><span>使用率</span><div className="unit-input"><input type="number" min="0" max="100" value={item.usagePercent} onChange={(e) => onUpdate(group, item.id, { usagePercent: Number(e.target.value) })} /><span className="input-unit" aria-hidden="true">%</span></div></label>}<label className="contract-field"><span>重み</span><input type="number" min="0.5" max="1.5" step="0.05" value={item.promptWeight} onChange={(e) => onUpdate(group, item.id, { promptWeight: Number(e.target.value) })} /></label></div>}<button type="button" className="icon-button danger" aria-label={`${item.text || "項目"}を削除`} onClick={() => onRemove(group, item.id)}>×</button></div>)}</div></section>;
}

function CategoryEditor({ category, expanded, onExpand, onToggle, onChoice, onDelete, onAdd, onEqualize, pasteValue, onPasteValue, onAddPasted }: any) {
  const enabledChoices = category.choices.filter((choice: any) => choice.enabled);
  const total = enabledChoices.reduce((sum: number, choice: any) => sum + Number(choice.targetPercent || 0), 0);
  return <section className={`category-card ${category.enabled ? "enabled" : ""}`}><header><button className="category-expand" type="button" aria-expanded={expanded} onClick={onExpand}><span className="category-icon" aria-hidden="true">{category.detail ? "+" : category.label.slice(0, 1)}</span><span><strong>{category.label}</strong><small>{enabledChoices.length}候補 ・ 合計 {total.toFixed(1)}%</small></span><b aria-hidden="true">⌄</b></button><label className="switch"><input type="checkbox" checked={category.enabled} onChange={(e) => onToggle(e.target.checked)} /><span /><b>{category.enabled ? "使用" : "不使用"}</b></label></header>{expanded && <div className="category-body"><div className="category-actions"><button type="button" className="button subtle" onClick={() => onAdd(category.id)}>＋ 候補追加</button><button type="button" className="button subtle" onClick={() => onEqualize(category.id)}>均等配分</button><span className={Math.abs(total - 100) < 0.1 ? "ratio-ok" : "ratio-warning"}>合計 {total.toFixed(1)}% {Math.abs(total - 100) < 0.1 ? "✓" : "— 生成時に重みとして正規化"}</span></div><div className="candidate-head"><span>有効</span><span>表示名 / 英語プロンプト</span><span>比率</span><span>最低</span><span>最大</span><span>強度</span><span>重み</span><span /></div>{category.choices.map((choice: any) => <div className="candidate-row" key={choice.id}><input type="checkbox" checked={choice.enabled} onChange={(e) => onChoice(category.id, choice.id, { enabled: e.target.checked })} aria-label={`${choice.labelJa}を有効にする`} /><div className="candidate-text"><input value={choice.labelJa} onChange={(e) => onChoice(category.id, choice.id, { labelJa: e.target.value })} aria-label="日本語表示名" /><input value={choice.promptText} onChange={(e) => onChoice(category.id, choice.id, { promptText: e.target.value })} aria-label="英語プロンプト" /><details className="intensity-editor"><summary>強度別タグを設定</summary>{[["weak", "弱い"], ["standard", "標準"], ["strong", "強い"]].map(([level, label]) => <label key={level}><span>{label}</span><input value={choice.intensityTags?.[level] || ""} placeholder={choice.promptText} onChange={(e) => onChoice(category.id, choice.id, { intensityTags: { ...(choice.intensityTags || {}), [level]: e.target.value } })} /></label>)}</details></div><label><span>比率</span><div><input type="number" min="0" max="100" step="0.1" value={choice.targetPercent} onChange={(e) => onChoice(category.id, choice.id, { targetPercent: Number(e.target.value) })} /><b>%</b></div></label><label><span>最低</span><input type="number" min="0" value={choice.minCount} onChange={(e) => onChoice(category.id, choice.id, { minCount: Number(e.target.value) })} /></label><label><span>最大</span><input type="number" min="0" placeholder="—" value={choice.maxCount ?? ""} onChange={(e) => onChoice(category.id, choice.id, { maxCount: e.target.value === "" ? null : Number(e.target.value) })} /></label><label><span>強度</span><select value={choice.intensityLevel || "standard"} onChange={(e) => onChoice(category.id, choice.id, { intensityLevel: e.target.value })}><option value="weak">弱い</option><option value="slightlyWeak">やや弱い</option><option value="standard">標準</option><option value="slightlyStrong">やや強い</option><option value="strong">強い</option><option value="custom">カスタム</option></select></label><label><span>重み</span><input type="number" min="0.5" max="1.5" step="0.05" value={choice.promptWeight} onChange={(e) => onChoice(category.id, choice.id, { promptWeight: Number(e.target.value) })} /></label><button type="button" className="icon-button danger" aria-label={`${choice.labelJa}を削除`} onClick={() => onDelete(category.id, choice.id)}>×</button></div>)}<details className="paste-box"><summary>複数行を貼り付ける</summary><p>1行に1件。「日本語名 | English prompt」または英語だけで入力できます。</p><textarea value={pasteValue} onChange={(e) => onPasteValue(e.target.value)} placeholder={'赤髪 | red hair\n金髪 | blonde hair'} /><button type="button" className="button primary" onClick={() => onAddPasted(category.id)}>候補へ追加</button></details></div>}</section>;
}

function EmptyPlan({ onCreate }: { onCreate: () => void }) { return <div className="empty-state"><div aria-hidden="true"><span /><span /><span /></div><h3>まだ学習計画がありません</h3><p>候補の件数と制約を計算し、シード付きで再現できる計画を作ります。</p><button className="button primary large" type="button" onClick={onCreate}>今の設定で計画を生成</button></div>; }

function DistributionTable({ state, counts }: any) {
  return <div className="table-card"><div className="table-title"><div><span className="mini-label">DISTRIBUTION MAP</span><h3>計画上の属性使用件数</h3></div><span>全 {state.plan.length}件</span></div>{state.categories.filter((category: any) => category.enabled).map((category: any) => <div className="distribution-group" key={category.id}><strong>{category.label}</strong><div>{category.choices.filter((choice: any) => choice.enabled).map((choice: any) => { const count = counts[category.id]?.[choice.id] || 0; return <span key={choice.id}><b>{choice.labelJa}</b><i><em style={{ width: `${state.plan.length ? count / state.plan.length * 100 : 0}%` }} /></i><strong>{count}</strong></span>; })}</div></div>)}</div>;
}

function PromptCard({ row, state, choices, onCopy, onStatus, onPatch, onReplace }: any) {
  const built = buildPrompt(row, state);
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  return <article className={`prompt-card status-${row.status}`}><header><div><span className="number">No.{String(row.number).padStart(2, "0")}</span><span className="status-chip">{STATUS.find(([value]) => value === row.status)?.[1]}</span>{row.locked && <span className="locked-chip">固定中</span>}</div><div className="card-actions"><button type="button" className="icon-button" aria-label={row.locked ? "固定を解除" : "カードを固定"} aria-pressed={row.locked} onClick={() => onPatch(row.id, { locked: !row.locked })}>{row.locked ? "◆" : "◇"}</button><button type="button" className="button subtle" disabled={row.locked} onClick={() => onReplace(row.id)}>配分を保って差し替え</button></div></header><div className="prompt-block"><div><span>Prompt</span>{built.sensitive.length > 0 && <b className="sensitive-badge">注意語 {built.sensitive.length}</b>}</div><code>{built.prompt}</code><button type="button" className="button copy" onClick={() => onCopy(built.prompt, `No.${String(row.number).padStart(2, "0")}のプロンプトをコピーしました`)}>プロンプトをコピー</button></div>{built.negative && <div className="negative-block"><span>Negative prompt</span><code>{built.negative}</code><button type="button" className="button subtle" onClick={() => onCopy(built.negative, `No.${String(row.number).padStart(2, "0")}のネガティブをコピーしました`)}>ネガティブをコピー</button></div>}{built.sensitive.length > 0 && <div className="sensitive-list">{built.sensitive.map((item: any) => <span key={item.term}><b>{item.term}</b> → {item.replacement}</span>)}</div>}<div className="status-selector" role="group" aria-label={`No.${row.number}の状態`}>{STATUS.map(([value, label]) => <button type="button" key={value} aria-pressed={row.status === value} className={row.status === value ? "selected" : ""} onClick={() => { onStatus(row.id, value); if (value === "rejected") setReasonsOpen(true); }}>{label}</button>)}</div>{row.status === "rejected" && <div className="rejection-box"><button className="disclosure" type="button" aria-expanded={reasonsOpen} onClick={() => setReasonsOpen(!reasonsOpen)}>不採用理由を記録 <span>⌄</span></button>{reasonsOpen && <div className="reason-grid">{REJECTION_REASONS.map((reason) => <label key={reason}><input type="checkbox" checked={row.rejectionReasons.includes(reason)} onChange={(e) => onPatch(row.id, { rejectionReasons: e.target.checked ? [...row.rejectionReasons, reason] : row.rejectionReasons.filter((item: string) => item !== reason) })} /><span>{reason}</span></label>)}</div>}</div>}<button className="disclosure" type="button" aria-expanded={attributesOpen} onClick={() => setAttributesOpen(!attributesOpen)}>属性とメモ <span>⌄</span></button>{attributesOpen && <div className="attribute-area"><div>{Object.entries(row.attributes).map(([categoryId, choiceId]: any) => choices[choiceId] && <span key={categoryId}><b>{choices[choiceId].categoryLabel}</b>{choices[choiceId].labelJa}</span>)}</div><label><span>メモ</span><textarea value={row.note} onChange={(e) => onPatch(row.id, { note: e.target.value })} placeholder="生成後の確認や修正点を記録" /></label></div>}</article>;
}

function ShortageTable({ shortages }: any) {
  const active = shortages.filter((item: any) => item.planned > 0);
  return <div className="shortage-table"><div className="shortage-head"><span>属性</span><span>計画</span><span>採用</span><span>不足</span></div>{active.map((item: any) => <div key={`${item.categoryId}-${item.choiceId}`} className={item.shortage > 0 ? "has-shortage" : ""}><span><small>{item.categoryLabel}</small><strong>{item.choiceLabel}</strong></span><span>{item.planned}</span><span>{item.adopted}</span><span>{item.shortage > 0 ? `−${item.shortage}` : "✓"}</span></div>)}</div>;
}
