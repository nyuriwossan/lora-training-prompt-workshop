import { SCHEMA_VERSION } from "./core.mjs";
import { FACE_CATEGORY_ORDER, applyFaceTypeToCategories, makeDefaultCategories } from "./face-data.mjs";

const feature = (id, text, usagePercent = 100, promptWeight = 1) => ({
  id,
  text,
  enabled: true,
  usagePercent,
  promptWeight,
});

export const PRESETS = [
  {
    id: "cold_semireal_male",
    name: "冷たい知性とツヤ感のあるセミリアル男性",
    objective: "顔LoRA",
    secondary: "光／質感LoRA",
    count: 30,
    required: [
      feature("req_1", "handsome young man"),
      feature("req_2", "refined delicate facial features"),
      feature("req_3", "glossy semi-real portrait", 100, 1.15),
      feature("req_4", "smooth painterly rendering"),
      feature("req_5", "crisp clean linework"),
    ],
    primary: [
      feature("main_1", "cold intellectual atmosphere", 70, 1.1),
      feature("main_2", "luminous facial highlights", 80, 1.15),
      feature("main_3", "soft controlled facial sheen", 65, 1.1),
      feature("main_4", "silky reflective hair", 75, 1.05),
    ],
  },
  {
    id: "semireal_male",
    name: "セミリアル男性顔LoRA",
    objective: "顔LoRA",
    secondary: "絵柄／塗りLoRA",
    count: 30,
    required: [feature("req_1", "handsome young man"), feature("req_2", "semi-real portrait")],
    primary: [feature("main_1", "refined facial features", 80)],
  },
  {
    id: "beautiful_girl",
    name: "美少女顔LoRA",
    objective: "顔LoRA",
    secondary: "",
    count: 30,
    required: [feature("req_1", "beautiful young woman"), feature("req_2", "delicate facial features")],
    primary: [feature("main_1", "clear expressive eyes", 80)],
  },
  {
    id: "character",
    name: "固定キャラクターLoRA",
    objective: "キャラクターLoRA",
    secondary: "",
    count: 40,
    faceLoraType: "fixed-character",
    required: [feature("req_1", "original character")],
    primary: [feature("main_1", "distinctive facial features", 90)],
  },
  {
    id: "style",
    name: "絵柄／塗りLoRA",
    objective: "絵柄／塗りLoRA",
    secondary: "",
    count: 40,
    required: [feature("req_1", "smooth painterly rendering"), feature("req_2", "crisp clean linework")],
    primary: [feature("main_1", "controlled color transitions", 85)],
  },
  {
    id: "outfit",
    name: "衣装LoRA",
    objective: "衣装LoRA",
    secondary: "ポーズ／構図LoRA",
    count: 40,
    required: [feature("req_1", "detailed outfit design")],
    primary: [feature("main_1", "clear garment construction", 90)],
  },
  {
    id: "pose",
    name: "ポーズ／構図LoRA",
    objective: "ポーズ／構図LoRA",
    secondary: "",
    count: 40,
    required: [feature("req_1", "dynamic natural pose")],
    primary: [feature("main_1", "clear body silhouette", 90)],
  },
  {
    id: "background",
    name: "背景LoRA",
    objective: "背景LoRA",
    secondary: "光／質感LoRA",
    count: 40,
    required: [feature("req_1", "detailed environment")],
    primary: [feature("main_1", "coherent atmospheric perspective", 80)],
  },
];

export function makeCategories(faceLoraType = "general") {
  return applyFaceTypeToCategories(makeDefaultCategories(), faceLoraType);
}

export function createInitialState(presetId = "cold_semireal_male") {
  const preset = PRESETS.find((item) => item.id === presetId) || PRESETS[0];
  const now = new Date().toISOString();
  const faceLoraType = preset.faceLoraType || "general";
  return {
    schemaVersion: SCHEMA_VERSION,
    projectName: "冷たい知性のセミリアル男性 LoRA",
    createdAt: now,
    updatedAt: now,
    activeStep: 1,
    environment: {
      platform: "PIXAIブラウザ版",
      modelFamily: "SDXL系",
      negativeMode: "available",
      weightMode: "numeric",
      promptFormat: "tags",
      sensitiveCheck: true,
    },
    objective: { primary: preset.objective, secondary: preset.secondary, count: preset.count },
    faceLoraType,
    contract: {
      required: structuredClone(preset.required),
      primary: structuredClone(preset.primary),
      negative: [
        feature("neg_1", "earrings"),
        feature("neg_2", "necklace"),
        feature("neg_3", "multiple people"),
        feature("neg_4", "text"),
        feature("neg_5", "watermark"),
      ],
      constraints: [feature("pos_1", "single character")],
      review: ["不要なアクセサリーが混入していない", "顔立ちが他画像と似すぎていない", "学習対象が髪や服で隠れていない"],
    },
    categories: makeCategories(faceLoraType),
    constraints: {
      distributionMode: "ratio",
      forbiddenPairs: [],
      maxConsecutive: { faceDirection: 2, hairColor: 2, gaze: 2 },
      uniqueGroups: [["hairColor", "hairStyle"], ["outfit", "background"]],
      contradictionMode: "auto",
    },
    phrasePolicy: {
      sourceTriggerWords: "",
      captionExclusions: "",
      forbiddenPositive: "",
      learningTargetMemo: "顔立ち、塗り、質感、雰囲気など、新LoRAに覚えさせたい概念を記録します。",
    },
    captionSettings: {
      enabled: false,
      triggerWord: "",
      includeCategoryIds: ["hairColor", "hairLength", "hairStyle", "eyeColor", "outfit", "distance", "expression", "background"],
    },
    faceSettings: {
      aspectRatio: "2:3",
      faceShapeAssist: "指定しない",
      neckShoulderAssist: "指定しない",
    },
    seed: "lora-workshop-001",
    outputOrder: [...FACE_CATEGORY_ORDER, "bodyDirection", "composition", "posture", "skinTone", "ageImpression", "hands", "lightDirection", "textureIntensity"],
    plan: [],
    warnings: [],
    diagnostics: [],
    lastSavedAt: null,
  };
}

export function applyPreset(state, presetId) {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) return state;
  const faceLoraType = preset.faceLoraType || (preset.objective === "顔LoRA" ? "general" : state.faceLoraType || "custom");
  return {
    ...state,
    objective: { primary: preset.objective, secondary: preset.secondary, count: preset.count },
    faceLoraType,
    categories: applyFaceTypeToCategories(state.categories, faceLoraType),
    contract: {
      ...state.contract,
      required: structuredClone(preset.required),
      primary: structuredClone(preset.primary),
    },
    plan: [],
    warnings: [],
  };
}
