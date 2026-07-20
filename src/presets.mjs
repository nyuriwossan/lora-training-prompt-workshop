import { CATEGORY_DEFINITIONS, DETAIL_CATEGORY_DEFINITIONS, SCHEMA_VERSION } from "./core.mjs";

const candidateSets = {
  hairColor: [["黒髪", "black hair"], ["青黒髪", "blue-black hair"], ["灰黒髪", "charcoal-gray hair"], ["銀灰髪", "silver-gray hair"], ["灰茶髪", "ash-brown hair"]],
  hairStyle: [["センター分けレイヤー", "center-parted layered hair"], ["短いレイヤー", "short layered hair"], ["オールバック", "swept-back hair"], ["柔らかな無造作髪", "softly tousled hair"], ["中くらいの直毛", "medium-length straight hair"]],
  eyeColor: [["灰色の目", "gray eyes"], ["青灰色の目", "blue-gray eyes"], ["濃茶の目", "dark brown eyes"], ["くすんだ緑の目", "muted green eyes"]],
  eyeShape: [["切れ長の目", "narrow eyes"], ["半目", "half-lidded eyes"], ["開いた目", "fully open eyes"], ["伏せたまぶた", "lowered eyelids"]],
  expression: [["落ち着いた表情", "composed expression"], ["無表情", "neutral expression"], ["かすかな微笑み", "faint smile"], ["少し冷淡", "mildly aloof expression"], ["気だるい表情", "languid expression"]],
  mouth: [["閉じた唇", "closed lips"], ["わずかに開いた唇", "slightly parted lips"], ["軽く結んだ唇", "gently pressed lips"], ["かすかな片笑い", "faint asymmetrical smile"]],
  gaze: [["カメラ目線", "looking at viewer"], ["横を見る", "looking aside"], ["伏し目", "looking downward"], ["見上げる", "looking upward"]],
  faceDirection: [["正面", "front-facing"], ["浅い斜め向き", "slight three-quarter view"], ["斜め向き", "three-quarter view"], ["浅い横顔", "slight profile"]],
  bodyDirection: [["体は正面", "body facing forward"], ["上半身を少しひねる", "torso turned slightly"], ["体は横向き", "side-facing body"]],
  distance: [["顔アップ", "close-up portrait"], ["肩上", "head-and-shoulders portrait"], ["上半身", "upper-body portrait"], ["腰上", "waist-up portrait"]],
  composition: [["中央構図", "centered composition"], ["オフセンター", "off-center composition"], ["左右対称", "symmetrical composition"], ["余白多め", "generous negative space"]],
  outfit: [["白い丸首シャツ", "plain white crew-neck shirt"], ["黒い丸首シャツ", "plain black crew-neck shirt"], ["濃色ニット", "dark knit sweater"], ["シンプルなハイネック", "simple high-neck top"], ["シャツと仕立てたジャケット", "tailored jacket over a plain shirt"]],
  background: [["白背景", "plain white background"], ["淡い灰色背景", "soft gray background"], ["青灰色背景", "muted blue-gray background"], ["暗い背景", "simple dark background"]],
  lighting: [["柔らかな正面光", "soft frontal lighting"], ["拡散スタジオ光", "diffused studio lighting"], ["穏やかな側光", "gentle side lighting"], ["控えめなリムライト", "subtle rim lighting"]],
};

const extraCandidateSets = {
  hairLength: [["短髪", "short hair"], ["中くらい", "medium-length hair"]],
  bangs: [["前髪なし", "forehead visible"], ["流した前髪", "side-swept bangs"]],
  parting: [["中央分け", "center part"], ["横分け", "side part"]],
  eyebrows: [["自然な眉", "relaxed eyebrows"], ["少し寄せた眉", "slightly furrowed brows"]],
  posture: [["自然な姿勢", "relaxed posture"], ["背筋を伸ばす", "upright posture"]],
  cameraAngle: [["目線の高さ", "eye-level view"], ["少し俯瞰", "slight high-angle view"], ["少し煽り", "slight low-angle view"]],
  skinTone: [["明るい肌", "fair skin"], ["自然な肌色", "natural skin tone"]],
  ageImpression: [["20代前半", "man in his early twenties"], ["20代後半", "man in his late twenties"]],
  faceShape: [["細い輪郭", "slender face shape"], ["卵型", "oval face shape"]],
  hands: [["手を含めない", "hands out of frame"], ["片手を含む", "one hand visible"]],
  lightDirection: [["正面光", "frontal light"], ["左からの光", "light from the left"], ["右からの光", "light from the right"]],
  textureIntensity: [["控えめなツヤ", "subtle facial sheen"], ["標準のツヤ", "luminous facial highlights"], ["強いツヤ", "pronounced glossy facial highlights"]],
};

function makeChoice(categoryId, pair, index, total) {
  return {
    id: `${categoryId}_${index + 1}`,
    labelJa: pair[0], promptText: pair[1], enabled: true,
    targetPercent: Number((100 / total).toFixed(2)), minCount: 0, maxCount: null,
    promptWeight: 1, intensityLevel: "standard", intensityTags: {}, notes: "",
  };
}

export function makeCategories() {
  const basic = CATEGORY_DEFINITIONS.map(([id, label]) => {
    const source = candidateSets[id] || [];
    return { id, label, enabled: true, detail: false, choices: source.map((pair, index) => makeChoice(id, pair, index, source.length)) };
  });
  const details = DETAIL_CATEGORY_DEFINITIONS.map(([id, label]) => {
    const source = extraCandidateSets[id] || [];
    return { id, label, enabled: false, detail: true, choices: source.map((pair, index) => makeChoice(id, pair, index, source.length)) };
  });
  return [...basic, ...details];
}

const feature = (id, text, usagePercent = 100, promptWeight = 1) => ({ id, text, enabled: true, usagePercent, promptWeight });

export const PRESETS = [
  { id: "cold_semireal_male", name: "冷たい知性とツヤ感のあるセミリアル男性", objective: "人物／顔LoRA", secondary: "光／質感LoRA", count: 30,
    required: [feature("req_1", "handsome young man"), feature("req_2", "refined delicate facial features"), feature("req_3", "glossy semi-real portrait", 100, 1.15), feature("req_4", "smooth painterly rendering"), feature("req_5", "crisp clean linework")],
    primary: [feature("main_1", "cold intellectual atmosphere", 70, 1.1), feature("main_2", "luminous facial highlights", 80, 1.15), feature("main_3", "soft controlled facial sheen", 65, 1.1), feature("main_4", "silky reflective hair", 75, 1.05)] },
  { id: "semireal_male", name: "セミリアル男性顔LoRA", objective: "人物／顔LoRA", secondary: "塗り／画風LoRA", count: 30, required: [feature("req_1", "handsome young man"), feature("req_2", "semi-real portrait")], primary: [feature("main_1", "refined facial features", 80)] },
  { id: "beautiful_girl", name: "美少女顔LoRA", objective: "人物／顔LoRA", secondary: "表情／目元LoRA", count: 30, required: [feature("req_1", "beautiful young woman"), feature("req_2", "delicate facial features")], primary: [feature("main_1", "clear expressive eyes", 80)] },
  { id: "character", name: "キャラクター再現LoRA", objective: "キャラクター再現LoRA", secondary: "", count: 40, required: [feature("req_1", "original character")], primary: [feature("main_1", "distinctive facial features", 90)] },
  { id: "eyes", name: "目元／表情LoRA", objective: "表情／目元LoRA", secondary: "人物／顔LoRA", count: 30, required: [feature("req_1", "detailed expressive eyes")], primary: [feature("main_1", "clear eye highlights", 75)] },
  { id: "style", name: "塗り／テイストLoRA", objective: "塗り／画風LoRA", secondary: "", count: 40, required: [feature("req_1", "smooth painterly rendering"), feature("req_2", "crisp clean linework")], primary: [feature("main_1", "controlled color transitions", 85)] },
  { id: "skin", name: "肌質／光沢LoRA", objective: "光／質感LoRA", secondary: "人物／顔LoRA", count: 30, required: [feature("req_1", "smooth skin rendering")], primary: [feature("main_1", "luminous facial highlights", 80, 1.15)] },
  { id: "hair", name: "髪質LoRA", objective: "髪型／髪質LoRA", secondary: "光／質感LoRA", count: 30, required: [feature("req_1", "detailed silky hair")], primary: [feature("main_1", "soft reflective hair strands", 80)] },
  { id: "outfit", name: "衣装LoRA", objective: "衣装LoRA", secondary: "ポーズ／構図LoRA", count: 40, required: [feature("req_1", "detailed outfit design")], primary: [feature("main_1", "clear garment construction", 90)] },
  { id: "pose", name: "ポーズLoRA", objective: "ポーズ／構図LoRA", secondary: "", count: 40, required: [feature("req_1", "dynamic natural pose")], primary: [feature("main_1", "clear body silhouette", 90)] },
  { id: "background", name: "背景LoRA", objective: "背景LoRA", secondary: "光／質感LoRA", count: 40, required: [feature("req_1", "detailed environment")], primary: [feature("main_1", "coherent atmospheric perspective", 80)] },
];

export function createInitialState(presetId = "cold_semireal_male") {
  const preset = PRESETS.find((item) => item.id === presetId) || PRESETS[0];
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectName: "冷たい知性のセミリアル男性 LoRA",
    createdAt: now, updatedAt: now,
    activeStep: 1,
    environment: { platform: "PIXAIブラウザ版", modelFamily: "SDXL系", negativeMode: "available", weightMode: "numeric", promptFormat: "tags", sensitiveCheck: true },
    objective: { primary: preset.objective, secondary: preset.secondary, count: preset.count },
    contract: {
      required: structuredClone(preset.required), primary: structuredClone(preset.primary),
      negative: [feature("neg_1", "earrings"), feature("neg_2", "necklace"), feature("neg_3", "multiple people"), feature("neg_4", "text"), feature("neg_5", "watermark")],
      constraints: [feature("pos_1", "bare ears"), feature("pos_2", "single character"), feature("pos_3", "both eyes visible")],
      review: ["不要なアクセサリーが混入していない", "顔立ちが他画像と似すぎていない", "学習対象が髪や服で隠れていない"],
    },
    categories: makeCategories(),
    constraints: { distributionMode: "equal", forbiddenPairs: [{ id: "pair_1", a: "outfit_2", b: "background_4" }], maxConsecutive: { hairColor: 2, faceDirection: 2 }, uniqueGroups: [["hairColor", "hairStyle"], ["outfit", "background"]] },
    seed: "lora-workshop-001",
    outputOrder: ["hairColor", "hairStyle", "eyeColor", "eyeShape", "expression", "mouth", "gaze", "faceDirection", "bodyDirection", "distance", "composition", "cameraAngle", "posture", "outfit", "background", "lighting", "lightDirection", "textureIntensity"],
    plan: [], warnings: [], diagnostics: [], lastSavedAt: null,
  };
}

export function applyPreset(state, presetId) {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) return state;
  return {
    ...state,
    objective: { primary: preset.objective, secondary: preset.secondary, count: preset.count },
    contract: { ...state.contract, required: structuredClone(preset.required), primary: structuredClone(preset.primary) },
    plan: [], warnings: [],
  };
}
