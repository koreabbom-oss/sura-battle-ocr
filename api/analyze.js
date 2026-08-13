// api/analyze.js
// 수라 전투부대 - 전투 이미지 AI 분석 API
//
// Vercel Serverless Function
// POST /api/analyze
//
// body:
// {
//   "image": "data:image/jpeg;base64,..."
// }
//
// 또는
// {
//   "imageBase64": "...",
//   "mimeType": "image/jpeg"
// }

export default async function handler(req, res) {
  // ------------------------------------------------------------
  // 기본 설정
  // ------------------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "POST 요청만 사용할 수 있습니다."
    });
  }

  // ------------------------------------------------------------
  // API KEY
  // ------------------------------------------------------------

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      ok: false,
      error:
        "GEMINI_API_KEY가 Vercel 환경변수에 등록되어 있지 않습니다."
    });
  }

  // ------------------------------------------------------------
  // 이미지 가져오기
  // ------------------------------------------------------------

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const imageInput =
    body?.image ||
    body?.imageBase64 ||
    body?.base64 ||
    null;

  if (!imageInput) {
    return res.status(400).json({
      ok: false,
      error: "분석할 이미지가 없습니다."
    });
  }

  let mimeType =
    body?.mimeType ||
    body?.mime_type ||
    "image/jpeg";

  let base64Data = imageInput;

  // data:image/jpeg;base64,XXXX 형태
  if (typeof imageInput === "string" && imageInput.startsWith("data:")) {
    const match = imageInput.match(
      /^data:([^;]+);base64,(.*)$/s
    );

    if (!match) {
      return res.status(400).json({
        ok: false,
        error: "이미지 data URL 형식이 올바르지 않습니다."
      });
    }

    mimeType = match[1] || mimeType;
    base64Data = match[2];
  }

  if (!base64Data || base64Data.length < 100) {
    return res.status(400).json({
      ok: false,
      error: "이미지 데이터가 비어 있거나 너무 작습니다."
    });
  }

  // 혹시 URL 인코딩이 되어 있다면 제거
  base64Data = String(base64Data)
    .replace(/^data:[^,]+,/, "")
    .replace(/\s/g, "");

  // ------------------------------------------------------------
  // Gemini Prompt
  // ------------------------------------------------------------

  const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을 판독하는 데이터 추출 AI다.

이 이미지는 전투 결과 화면이다.

가장 중요한 규칙은 다음과 같다.

[절대 규칙]

1. 이미지에 실제로 보이는 정보만 입력한다.
2. 보이지 않는 정보는 추측하지 않는다.
3. 장수의 이름을 추측하지 않는다.
4. 승급 숫자를 절대 추측하지 않는다.
5. 이미지의 장수 카드 아래에 표시된 빨간색 승급 숫자를 정확히 읽는다.
6. 승급 숫자가 보이지 않으면 null을 사용한다.
7. 레벨과 승급은 서로 다른 값이다.
8. 레벨 50이라고 해서 승급을 임의로 0, 1, 2, 3으로 만들면 안 된다.
9. 병력 현재값과 최대값도 이미지에 보이는 숫자를 그대로 읽는다.
10. 공격자와 방어자를 절대 뒤바꾸지 않는다.
11. 공격자 닉네임과 방어자 닉네임을 반드시 각각 읽는다.
12. 공격자 맹과 방어자 맹도 각각 읽는다.
13. 공격자 데이터와 방어자 데이터는 반드시 동시에 반환한다.
14. 한쪽만 분석하고 다른 쪽을 생략하면 안 된다.
15. 결과가 승리/패배/무승부인지 이미지에서 정확히 읽는다.

[특히 중요한 것]

전투 결과 이미지의 위쪽을 먼저 확인한다.

왼쪽:
공격자 닉네임
공격자 맹
공격자 병력
공격자 장수 3명

오른쪽:
방어자 닉네임
방어자 맹
방어자 병력
방어자 장수 3명

장수 카드마다 다음 정보를 읽는다.

- 장수 이름
- 레벨
- 빨간색 승급 숫자
- 현재 병력
- 최대 병력

예:

장량
레벨 50
승급 2
병력 0 / 10,000

이면

{
  "name": "장량",
  "level": 50,
  "promotion": 2,
  "troops_current": 0,
  "troops_max": 10000
}

이다.

중요:
"레벨 50"과 "승급 2"는 완전히 다른 정보다.

승급 숫자가 카드 이미지에 빨간색으로 3개 표시되어 있으면 promotion은 3이다.

빨간색 승급 표시가 2개라면 promotion은 2이다.

절대로 AI가 게임 지식으로 승급 숫자를 추론하지 않는다.

[출력]

반드시 아래 JSON 구조 하나만 반환한다.

{
  "battle_result": "승리",
  "attacker": {
    "player": "",
    "clan": "",
    "troops_current": 0,
    "troops_max": 0,
    "deck": [
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      },
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      },
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      }
    ]
  },
  "defender": {
    "player": "",
    "clan": "",
    "troops_current": 0,
    "troops_max": 0,
    "deck": [
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      },
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      },
      {
        "name": "",
        "level": 0,
        "promotion": null,
        "troops_current": 0,
        "troops_max": 0
      }
    ]
  }
}

[중요]

JSON 외에 설명을 절대로 작성하지 않는다.

마크다운 코드블록을 사용하지 않는다.

"분석 결과입니다" 같은 문장을 작성하지 않는다.

오직 JSON만 출력한다.

정보를 읽을 수 없는 경우 추측하지 말고 null을 사용한다.

공격자와 방어자 모두 반드시 반환한다.
`;

  // ------------------------------------------------------------
  // Gemini API
  // ------------------------------------------------------------

  const MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.6-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],

    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2500
    }
  };

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Gemini API에 연결하지 못했습니다.",
      detail: error?.message || String(error)
    });
  }

  // ------------------------------------------------------------
  // Gemini HTTP 오류
  // ------------------------------------------------------------

  const rawText = await response.text();

  if (!response.ok) {
    let errorData = null;

    try {
      errorData = JSON.parse(rawText);
    } catch {
      errorData = rawText;
    }

    return res.status(response.status).json({
      ok: false,
      error: "Gemini API 요청 실패",
      http_status: response.status,
      model: MODEL,
      detail: errorData
    });
  }

  // ------------------------------------------------------------
  // Gemini 응답 JSON 파싱
  // ------------------------------------------------------------

  let geminiData;

  try {
    geminiData = JSON.parse(rawText);
  } catch {
    return res.status(500).json({
      ok: false,
      error: "Gemini API 응답 자체가 JSON이 아닙니다.",
      raw: rawText.slice(0, 5000)
    });
  }

  // ------------------------------------------------------------
  // Candidate 추출
  // ------------------------------------------------------------

  const candidate =
    geminiData?.candidates?.[0];

  if (!candidate) {
    return res.status(500).json({
      ok: false,
      error: "Gemini가 분석 결과를 반환하지 않았습니다.",
      raw: geminiData
    });
  }

  const finishReason =
    candidate?.finishReason ||
    candidate?.finish_reason ||
    null;

  // ------------------------------------------------------------
  // 텍스트 추출
  // ------------------------------------------------------------

  const parts =
    candidate?.content?.parts || [];

  let text = parts
    .map((part) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    return res.status(500).json({
      ok: false,
      error: "Gemini가 분석 텍스트를 반환하지 않았습니다.",
      finishReason,
      candidate
    });
  }

  // ------------------------------------------------------------
  // JSON 정리
  // ------------------------------------------------------------

  text = cleanGeminiJson(text);

  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    // ----------------------------------------------------------
    // JSON이 중간에서 잘린 경우
    // ----------------------------------------------------------

    return res.status(500).json({
      ok: false,
      error:
        "Gemini가 완성되지 않은 JSON을 반환했습니다.",
      finishReason,
      parseError: error?.message || String(error),
      raw: text.slice(0, 12000)
    });
  }

  // ------------------------------------------------------------
  // 결과 검증
  // ------------------------------------------------------------

  const validation = validateBattleResult(result);

  if (!validation.ok) {
    return res.status(500).json({
      ok: false,
      error: "AI 분석 결과의 필수 데이터가 올바르지 않습니다.",
      reason: validation.reason,
      result
    });
  }

  // ------------------------------------------------------------
  // 숫자 정규화
  // ------------------------------------------------------------

  result = normalizeBattleResult(result);

  // ------------------------------------------------------------
  // 성공
  // ------------------------------------------------------------

  return res.status(200).json({
    ok: true,
    model: MODEL,
    finishReason,
    result
  });
}


// ============================================================
// JSON 정리
// ============================================================

function cleanGeminiJson(text) {
  let value = String(text).trim();

  // ```json ... ``` 제거
  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 앞쪽 설명 제거
  const firstBrace = value.indexOf("{");

  if (firstBrace > 0) {
    value = value.slice(firstBrace);
  }

  // 뒤쪽 쓰레기 제거
  const lastBrace = value.lastIndexOf("}");

  if (lastBrace >= 0 && lastBrace < value.length - 1) {
    value = value.slice(0, lastBrace + 1);
  }

  return value.trim();
}


// ============================================================
// 결과 검증
// ============================================================

function validateBattleResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      reason: "결과가 객체가 아닙니다."
    };
  }

  if (!result.attacker || typeof result.attacker !== "object") {
    return {
      ok: false,
      reason: "공격자 데이터가 없습니다."
    };
  }

  if (!result.defender || typeof result.defender !== "object") {
    return {
      ok: false,
      reason: "방어자 데이터가 없습니다."
    };
  }

  if (!Array.isArray(result.attacker.deck)) {
    return {
      ok: false,
      reason: "공격자 덱 데이터가 없습니다."
    };
  }

  if (!Array.isArray(result.defender.deck)) {
    return {
      ok: false,
      reason: "방어자 덱 데이터가 없습니다."
    };
  }

  // 게임상 3장 덱이므로 3장 이상이면 앞의 3장만 사용
  if (result.attacker.deck.length < 3) {
    return {
      ok: false,
      reason: "공격자 장수 3명을 모두 읽지 못했습니다."
    };
  }

  if (result.defender.deck.length < 3) {
    return {
      ok: false,
      reason: "방어자 장수 3명을 모두 읽지 못했습니다."
    };
  }

  if (!result.attacker.player) {
    return {
      ok: false,
      reason: "공격자 닉네임을 읽지 못했습니다."
    };
  }

  if (!result.defender.player) {
    return {
      ok: false,
      reason: "방어자 닉네임을 읽지 못했습니다."
    };
  }

  return {
    ok: true
  };
}


// ============================================================
// 숫자 정규화
// ============================================================

function normalizeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  if (!cleaned) {
    return fallback;
  }

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function normalizePromotion(value) {
  // 승급은 특히 중요하므로 추측하지 않는다.
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = normalizeNumber(value, null);

  if (number === null) {
    return null;
  }

  // 게임 UI상 승급 숫자는 일반적으로 작은 정수.
  // 이상한 값이 나오면 그대로 신뢰하지 않고 null 처리.
  if (!Number.isInteger(number) || number < 0 || number > 20) {
    return null;
  }

  return number;
}


function normalizeDeck(deck) {
  if (!Array.isArray(deck)) {
    return [];
  }

  return deck
    .slice(0, 3)
    .map((unit) => ({
      name:
        unit?.name === null ||
        unit?.name === undefined
          ? ""
          : String(unit.name).trim(),

      level: normalizeNumber(unit?.level, null),

      // 중요:
      // AI가 임의로 넣은 값이라도 숫자 형식만 통과.
      promotion: normalizePromotion(
        unit?.promotion
      ),

      troops_current: normalizeNumber(
        unit?.troops_current,
        null
      ),

      troops_max: normalizeNumber(
        unit?.troops_max,
        null
      )
    }));
}


function normalizeSide(side) {
  return {
    player:
      side?.player === null ||
      side?.player === undefined
        ? ""
        : String(side.player).trim(),

    clan:
      side?.clan === null ||
      side?.clan === undefined
        ? ""
        : String(side.clan).trim(),

    troops_current: normalizeNumber(
      side?.troops_current,
      null
    ),

    troops_max: normalizeNumber(
      side?.troops_max,
      null
    ),

    deck: normalizeDeck(side?.deck)
  };
}


function normalizeBattleResult(result) {
  return {
    battle_result:
      result?.battle_result
        ? String(result.battle_result).trim()
        : "",

    attacker: normalizeSide(
      result?.attacker
    ),

    defender: normalizeSide(
      result?.defender
    )
  };
}
