export const OBJECTIVES = [
  "顔LoRA",
  "キャラクターLoRA",
  "絵柄／塗りLoRA",
  "衣装LoRA",
  "ポーズ／構図LoRA",
  "背景LoRA",
  "小物LoRA",
  "光／質感LoRA",
  "複合タイプ",
];

export const OBJECTIVE_MIGRATIONS = {
  "人物／顔LoRA": "顔LoRA",
  "キャラクター再現LoRA": "キャラクターLoRA",
  "塗り／画風LoRA": "絵柄／塗りLoRA",
  "髪型／髪質LoRA": "顔LoRA",
  "表情／目元LoRA": "顔LoRA",
};

export const FACE_LORA_TYPES = [
  ["general", "汎用顔LoRA"],
  ["fixed-character", "固定キャラクターLoRA"],
  ["style-blend", "絵柄／顔立ちブレンドLoRA"],
  ["custom", "カスタム"],
];

export const CATEGORY_DEFINITIONS = [
  ["distance", "構図・顔の占有率"],
  ["faceDirection", "顔の左右角度"],
  ["headTilt", "顔の上下角度"],
  ["gaze", "視線"],
  ["cameraPosition", "カメラ位置"],
  ["hairColor", "髪色"],
  ["hairLength", "髪の長さ"],
  ["hairStyle", "髪型・基本形"],
  ["bangs", "前髪"],
  ["hairTexture", "髪の質感・状態"],
  ["eyeColor", "目の色"],
  ["eyeShape", "目の形・開き方"],
  ["expression", "表情"],
  ["mouth", "口元"],
  ["eyebrows", "眉"],
  ["outfit", "服装"],
  ["background", "背景"],
  ["lighting", "光源"],
];

export const DETAIL_CATEGORY_DEFINITIONS = [
  ["hairColorDetail", "特殊髪色"],
  ["faceShapeAssist", "顔型補助"],
  ["neckShoulderAssist", "首・肩補助"],
  ["bodyDirection", "体の向き"],
  ["composition", "構図補助"],
  ["parting", "分け目（旧項目）"],
  ["posture", "姿勢"],
  ["skinTone", "肌色"],
  ["ageImpression", "年齢感"],
  ["hands", "手の有無"],
  ["lightDirection", "光の方向"],
  ["textureIntensity", "質感強度"],
];

export const FACE_CATEGORY_ORDER = CATEGORY_DEFINITIONS.map(([id]) => id);

const item = (labelJa, promptText, options = {}) => ({ labelJa, promptText, ...options });

export const CANDIDATE_SETS = {
  distance: [
    item("顔中心の超アップ", "extreme close portrait, face occupying most of the frame, full facial features visible", { enabled: false, targetPercent: 0 }),
    item("顔アップ", "close portrait, full head visible, face occupying about half of the frame, shoulders partially visible", { targetPercent: 15, recommended: true }),
    item("頭と肩", "head-and-shoulders portrait, full head and both shoulders visible, moderate camera distance", { targetPercent: 40, recommended: true }),
    item("胸上", "portrait framed from the upper chest upward, full head, shoulders, and upper chest visible", { targetPercent: 30, recommended: true }),
    item("上半身", "upper-body portrait, upper torso visible, moderate camera distance", { targetPercent: 15, recommended: true }),
    item("腰上", "waist-up portrait, upper torso and arms visible", { enabled: false, targetPercent: 0 }),
  ],
  faceDirection: [
    item("正面", "front view, face oriented toward the camera, symmetrical facial visibility", { targetPercent: 25, recommended: true, direction: "front" }),
    item("左30度", "head turned slightly to the left, left three-quarter view, nose pointing slightly left, asymmetrical facial visibility", { targetPercent: 8, recommended: true, direction: "left" }),
    item("左45度", "head turned about 45 degrees to the left, left three-quarter view, face viewed from the left side, nose pointing left, one ear more visible than the other", { targetPercent: 8, recommended: true, direction: "left" }),
    item("左横顔", "full left profile, side profile facing left, nose pointing left, only one eye clearly visible", { targetPercent: 10, recommended: true, direction: "left-profile" }),
    item("右30度", "head turned slightly to the right, right three-quarter view, nose pointing slightly right, asymmetrical facial visibility", { targetPercent: 8, recommended: true, direction: "right" }),
    item("右45度", "head turned about 45 degrees to the right, right three-quarter view, face viewed from the right side, nose pointing right, one ear more visible than the other", { targetPercent: 8, recommended: true, direction: "right" }),
    item("右横顔", "full right profile, side profile facing right, nose pointing right, only one eye clearly visible", { targetPercent: 10, recommended: true, direction: "right-profile" }),
    item("後ろから振り向き", "rear three-quarter view, body turned away from the viewer, looking back over the shoulder, face partially visible in profile", { targetPercent: 5, recommended: true, direction: "rear" }),
  ],
  headTilt: [
    item("水平", "neutral head angle", { targetPercent: 50, recommended: true }),
    item("少し俯く", "chin slightly lowered, head tilted slightly downward", { targetPercent: 15, recommended: true }),
    item("強く俯く", "head bowed, chin clearly lowered, face partly viewed from above", { targetPercent: 10 }),
    item("少し顎を上げる", "chin slightly raised, head tilted slightly upward", { targetPercent: 15, recommended: true }),
    item("強く見上げる", "chin raised, head tilted upward, face partly viewed from below", { targetPercent: 10 }),
  ],
  gaze: [
    item("カメラを見る", "looking at viewer", { recommended: true }),
    item("正面方向を見る", "looking straight ahead", { recommended: true }),
    item("左を見る", "looking to the left", { direction: "left", recommended: true }),
    item("右を見る", "looking to the right", { direction: "right", recommended: true }),
    item("上を見る", "looking upward"),
    item("下を見る", "looking downward"),
    item("横目", "sideways glance"),
    item("伏し目", "downcast eyes", { recommended: true }),
    item("遠くを見る", "looking into the distance"),
    item("目を閉じる", "eyes closed"),
  ],
  cameraPosition: [
    item("アイレベル", "eye-level camera", { recommended: true }),
    item("少し上から", "slightly high-angle view", { recommended: true }),
    item("高い位置から", "high-angle view"),
    item("少し下から", "slightly low-angle view", { recommended: true }),
    item("低い位置から", "low-angle view"),
    item("斜め上から", "viewed diagonally from above"),
    item("斜め下から", "viewed diagonally from below"),
  ],
  hairColor: [
    item("黒", "black hair", { recommended: true }),
    item("ダークブラウン", "dark brown hair", { recommended: true }),
    item("茶", "brown hair", { recommended: true }),
    item("栗色", "chestnut hair"),
    item("金", "blond hair", { recommended: true }),
    item("アッシュブロンド", "ash blond hair"),
    item("銀", "silver hair", { recommended: true }),
    item("白", "white hair"),
    item("灰", "gray hair"),
    item("赤", "red hair"),
    item("オレンジ", "orange hair"),
    item("ピンク", "pink hair"),
    item("紫", "purple hair"),
    item("青", "blue hair"),
    item("紺", "navy blue hair"),
    item("緑", "green hair"),
    item("ミント", "mint green hair"),
    item("青緑", "teal hair"),
  ],
  hairLength: [
    item("ベリーショート", "very short hair", { recommended: true, family: "short" }),
    item("ショート", "short hair", { recommended: true, family: "short" }),
    item("ミディアム", "medium-length hair", { recommended: true }),
    item("セミロング", "semi-long hair", { recommended: true, family: "long" }),
    item("ロング", "long hair", { recommended: true, family: "long" }),
  ],
  hairStyle: [
    item("センターパート", "center-parted hair", { recommended: true }),
    item("サイドパート", "side-parted hair", { recommended: true }),
    item("マッシュ", "mushroom haircut"),
    item("ウルフ", "wolf cut"),
    item("レイヤー", "layered hair", { recommended: true }),
    item("ボブ", "bob cut", { recommended: true }),
    item("ストレート", "straight hair", { recommended: true }),
    item("ウェーブ", "wavy hair", { recommended: true }),
    item("カール", "curly hair"),
    item("オールバック", "swept-back hair"),
    item("ポニーテール", "ponytail"),
    item("ハーフアップ", "half-up hair"),
    item("一つ結び", "single tied hair"),
  ],
  bangs: [
    item("前髪あり", "bangs", { recommended: true }),
    item("前髪なし", "no bangs, forehead visible", { recommended: true, family: "none" }),
    item("長い前髪", "long bangs"),
    item("目にかかる前髪", "bangs covering the eyes"),
    item("片目を隠す前髪", "hair covering one eye"),
    item("両目の間に垂れる前髪", "bangs between the eyes"),
    item("かき上げ前髪", "swept-up bangs"),
    item("シースルーバング", "see-through bangs"),
  ],
  hairTexture: [
    item("無造作", "tousled hair", { recommended: true }),
    item("ふんわり", "fluffy hair", { recommended: true }),
    item("さらさら", "silky hair", { recommended: true }),
    item("濡れ髪", "wet hair"),
    item("乱れ髪", "messy hair"),
    item("外ハネ", "outward-flipped hair"),
    item("内巻き", "inward-curled hair"),
    item("束感", "defined hair strands"),
    item("顔まわりの後れ毛", "loose strands framing the face"),
  ],
  eyeColor: [
    item("黒", "black eyes", { recommended: true }),
    item("ダークブラウン", "dark brown eyes", { recommended: true }),
    item("茶", "brown eyes", { recommended: true }),
    item("ヘーゼル", "hazel eyes"),
    item("琥珀", "amber eyes"),
    item("金", "golden eyes"),
    item("灰", "gray eyes", { recommended: true }),
    item("青灰", "blue-gray eyes", { recommended: true }),
    item("青", "blue eyes"),
    item("水色", "light blue eyes"),
    item("緑", "green eyes"),
    item("淡い緑", "pale green eyes"),
    item("赤", "red eyes"),
    item("ピンク", "pink eyes"),
    item("紫", "purple eyes"),
  ],
  eyeShape: [
    item("自然に開いた目", "naturally open eyes", { recommended: true }),
    item("切れ長の目", "narrow eyes", { recommended: true }),
    item("丸い目", "round eyes"),
    item("半目", "half-lidded eyes"),
    item("たれ目", "droopy eyes"),
    item("つり目", "upturned eyes"),
  ],
  expression: [
    item("無表情", "expressionless", { recommended: true, family: "neutral" }),
    item("真顔", "serious expression", { recommended: true }),
    item("穏やか", "gentle expression", { recommended: true }),
    item("微笑み", "subtle smile", { recommended: true }),
    item("眠そう", "sleepy expression"),
    item("退屈そう", "bored expression"),
    item("疲れた表情", "tired expression"),
    item("困り顔", "troubled expression"),
    item("照れ", "blushing expression"),
    item("恥ずかしそう", "shy expression"),
    item("悲しそう", "sad expression"),
    item("泣きそう", "tearful expression"),
    item("不機嫌", "displeased expression"),
    item("睨む", "glaring"),
    item("挑発的", "provocative expression"),
    item("意味深な笑み", "enigmatic smile"),
    item("目を細める", "squinting"),
  ],
  mouth: [
    item("閉じた口", "closed mouth", { recommended: true, family: "closed" }),
    item("少し開いた口", "slightly open mouth", { recommended: true, family: "open" }),
    item("口を閉じた微笑み", "closed-mouth smile", { recommended: true, family: "closed" }),
    item("唇を軽く結ぶ", "gently pressed lips"),
    item("片側だけ上げた笑み", "one-sided smile"),
  ],
  eyebrows: [
    item("自然な眉", "natural eyebrows", { recommended: true }),
    item("力を抜いた眉", "relaxed eyebrows", { recommended: true }),
    item("少し眉を寄せる", "slightly furrowed brows"),
    item("片眉を上げる", "one eyebrow raised"),
    item("眉尻を下げる", "downturned eyebrows"),
  ],
  outfit: [
    item("白シャツ", "plain white shirt", { recommended: true }),
    item("黒シャツ", "plain black shirt", { recommended: true }),
    item("Tシャツ", "plain T-shirt", { recommended: true }),
    item("タートルネック", "simple turtleneck", { recommended: true }),
    item("ニット", "plain knitwear", { recommended: true }),
    item("パーカー", "simple hoodie"),
    item("カーディガン", "plain cardigan"),
    item("ジャケット", "simple jacket"),
    item("レザージャケット", "leather jacket"),
    item("スーツ", "plain suit"),
    item("制服風ジャケット", "uniform-style jacket"),
    item("ハイネック衣装", "high-neck outfit"),
    item("歴史衣装", "historical costume"),
    item("シンプルな服", "simple clothing", { recommended: true }),
  ],
  background: [
    item("白背景", "plain white background", { recommended: true, family: "plain" }),
    item("灰背景", "plain gray background", { recommended: true, family: "plain" }),
    item("ベージュ背景", "plain beige background", { recommended: true, family: "plain" }),
    item("暗い無地背景", "plain dark background", { recommended: true, family: "plain" }),
    item("窓辺", "by a window"),
    item("寝室", "bedroom background"),
    item("リビング", "living room background"),
    item("書斎", "study room background"),
    item("カフェ", "cafe background"),
    item("屋外", "outdoor background"),
    item("ぼかした室内", "blurred indoor background", { recommended: true }),
    item("ぼかした街並み", "blurred city background"),
  ],
  lighting: [
    item("柔らかな自然光", "soft natural light", { recommended: true }),
    item("窓光", "window light", { recommended: true }),
    item("曇天光", "overcast light", { recommended: true }),
    item("朝日", "morning sunlight"),
    item("夕方の光", "evening light"),
    item("暖色の室内灯", "warm indoor light"),
    item("寒色の室内灯", "cool indoor light"),
    item("横からの光", "side lighting", { recommended: true }),
    item("逆光", "backlighting"),
    item("スタジオ光", "studio lighting", { recommended: true }),
    item("低照度", "low-key lighting"),
  ],
  hairColorDetail: [
    item("インナーカラー", "inner-colored hair"),
    item("グラデーション", "gradient hair"),
    item("毛先だけ別色", "colored hair tips"),
    item("メッシュ", "hair highlights"),
    item("ツートーン", "two-tone hair"),
  ],
  faceShapeAssist: [
    item("指定しない", "", { recommended: true }),
    item("自然な顔比率", "natural facial proportions"),
    item("やや横幅のある顔", "slightly wide face"),
    item("コンパクトな顔", "compact face"),
    item("柔らかい顎", "soft jawline"),
    item("丸みのある顎", "rounded jawline"),
    item("シャープな顎", "sharp jawline"),
    item("面長", "long face"),
    item("丸顔", "round face"),
    item("卵型", "oval face"),
  ],
  neckShoulderAssist: [
    item("指定しない", "", { recommended: true }),
    item("自然な首の長さ", "natural neck length"),
    item("平均的な首の比率", "average neck proportions"),
    item("肩まで入れる", "shoulders included in frame"),
    item("両肩を見せる", "both shoulders visible"),
  ],
  bodyDirection: [item("体は正面", "body facing forward"), item("上半身を少しひねる", "torso turned slightly"), item("体は横向き", "side-facing body")],
  composition: [item("中央構図", "centered composition"), item("オフセンター", "off-center composition"), item("左右対称", "symmetrical composition"), item("余白多め", "generous negative space")],
  parting: [item("中央分け", "center part"), item("横分け", "side part")],
  posture: [item("自然な姿勢", "relaxed posture"), item("背筋を伸ばす", "upright posture")],
  skinTone: [item("明るい肌", "fair skin"), item("自然な肌色", "natural skin tone")],
  ageImpression: [item("20代前半", "man in his early twenties"), item("20代後半", "man in his late twenties")],
  hands: [item("手を含めない", "hands out of frame"), item("片手を含む", "one hand visible")],
  lightDirection: [item("正面光", "frontal light"), item("左からの光", "light from the left"), item("右からの光", "light from the right")],
  textureIntensity: [item("控えめなツヤ", "subtle facial sheen"), item("標準のツヤ", "luminous facial highlights"), item("強いツヤ", "pronounced glossy facial highlights")],
};

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function makeChoice(categoryId, source, index, total) {
  return {
    id: source.id || `${categoryId}_${slug(source.promptText || source.labelJa) || index + 1}`,
    labelJa: source.labelJa,
    promptText: source.promptText,
    enabled: source.enabled !== false,
    targetPercent: source.targetPercent ?? Number((100 / Math.max(1, total)).toFixed(2)),
    minCount: 0,
    maxCount: null,
    promptWeight: 1,
    intensityLevel: "standard",
    intensityTags: {},
    notes: source.notes || "",
    recommended: source.recommended === true,
    direction: source.direction,
    family: source.family,
    includeInPrompt: true,
    includeInCaption: true,
    learningTarget: false,
  };
}

export function makeDefaultCategories() {
  const definitions = [...CATEGORY_DEFINITIONS.map((item) => [...item, false]), ...DETAIL_CATEGORY_DEFINITIONS.map((item) => [...item, true])];
  return definitions.map(([id, label, detail]) => {
    const source = CANDIDATE_SETS[id] || [];
    const mode = detail ? "disabled" : "distributed";
    const choices = source.map((choice, index) => makeChoice(id, choice, index, source.length));
    return {
      id,
      label,
      enabled: mode !== "disabled",
      mode,
      fixedChoiceId: choices.find((choice) => choice.enabled)?.id || choices[0]?.id || "",
      detail,
      choices,
    };
  });
}

export function applyFaceTypeToCategories(categories, faceLoraType) {
  if (faceLoraType === "custom") return categories;
  const fixedIds = new Set(faceLoraType === "fixed-character" ? ["hairColor", "hairLength", "hairStyle", "eyeColor"] : []);
  const disabledIds = new Set(["hairColorDetail", "faceShapeAssist", "neckShoulderAssist", "bodyDirection", "composition", "parting", "posture", "skinTone", "ageImpression", "hands", "lightDirection", "textureIntensity"]);
  return categories.map((category) => {
    const mode = disabledIds.has(category.id) ? "disabled" : fixedIds.has(category.id) ? "fixed" : "distributed";
    const fixedChoiceId = category.fixedChoiceId || category.choices.find((choice) => choice.enabled !== false)?.id || category.choices[0]?.id || "";
    return { ...category, mode, enabled: mode !== "disabled", fixedChoiceId };
  });
}
