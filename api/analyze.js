export default async function handler(req, res) {
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
    return sendError(res, 405, "POST 요청만 허용됩니다.");
  }

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (!API_KEY) {
    return sendError(
      res,
      500,
      "GEMINI_API_KEY가 설정되어 있지 않습니다."
    );
  }

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendError(
        res,
        400,
        "요청 JSON을 읽을 수 없습니다."
      );
    }
  }

  const image =
    body?.image ||
    body?.imageBase64 ||
    body?.base64;

  if (!image) {
    return sendError(
      res,
      400,
      "분석할 이미지가 없습니다."
    );
  }

  let mimeType =
    body?.mimeType ||
    body?.mime_type ||
    "image/jpeg";

  let base64Data = String(image);

  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(
      /^data:([^;]+);base64,(.*)$/s
    );

    if (!match) {
      return sendError(
        res,
        400,
        "이미지 데이터 형식이 올바르지 않습니다."
      );
    }

    mimeType = match[1];
    base64Data = match[2];
  }

  base64Data = base64Data
    .replace(/^data:[^,]+,/, "")
    .replace(/\s/g, "");

  /*
   * ----------------------------------------------------------
   * 모델
   * ----------------------------------------------------------
   */

  const MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.6-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
      API_KEY
    )}`;

  /*
   * ----------------------------------------------------------
   * 핵심 프롬프트
   * ----------------------------------------------------------
   */

  const prompt = `
You are an OCR extraction system.

Look at the supplied Korean strategy-game battle screenshot.

Return ONLY ONE JSON OBJECT.
Do not explain anything.
Do not discuss the game.
Do not ask questions.
Do not write English.
Do not write markdown.
Do not write code fences.

The JSON must have exactly this general structure:

{
  "result": "승리",
  "attacker": {
    "player": "공격자닉네임",
    "clan": "공격자맹",
    "deck": [
      {
        "name": "장수",
        "level": 50,
        "promotion": 2,
        "cur": 0,
        "max": 10000
      },
      {
        "name": "장수",
        "level": 50,
        "promotion": 2,
        "cur": 0,
        "max": 10000
      },
      {
        "name": "장수",
        "level": 50,
        "promotion": 2,
        "cur": 0,
        "max": 10000
      }
    ]
  },
  "defender": {
    "player": "방어자닉네임",
    "clan": "방어자맹",
    "deck": [
      {
        "name": "장수",
        "level": 50,
        "promotion": 3,
        "cur": 0,
        "max": 10000
      },
      {
        "name": "장수",
        "level": 50,
        "promotion": 3,
        "cur": 0,
        "max": 10000
      },
      {
        "name": "장수",
        "level": 50,
        "promotion": 3,
        "cur": 0,
        "max": 10000
      }
    ]
  }
}

IMPORTANT:

LEFT SIDE OF IMAGE = ATTACKER.

RIGHT SIDE OF IMAGE = DEFENDER.

Read the player nickname at the top of each side.

Read the clan name separately.

The six generals must be returned:
3 attackers + 3 defenders.

promotion is extremely important.

promotion means the RED promotion number displayed on the general card.

Do NOT calculate promotion from level.

Do NOT guess promotion.

If the card visibly has red "3", return 3.
If visibly "2", return 2.
If visibly "1", return 1.

If promotion cannot be read, return -1.

For troop values:

0 / 14,777
means:
cur = 0
max = 14777

26,736 / 30,000
means:
cur = 26736
max = 30000

Remove commas from numbers.

If a value cannot be read:
numbers = -1
text = ""

Again:
OUTPUT JSON ONLY.
`;

  /*
   * ----------------------------------------------------------
   * Gemini 요청
   *
   * 자동 재시도 없음.
   * 1회 클릭 = 1회 요청.
   * ----------------------------------------------------------
   */

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
      maxOutputTokens: 2048
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
    return sendError(
      res,
      500,
      "Gemini API 연결 실패",
      {
        detail:
          error?.message ||
          String(error)
      }
    );
  }

  const rawResponse =
    await response.text();

  /*
   * ----------------------------------------------------------
   * Gemini HTTP 오류
   * ----------------------------------------------------------
   */

  if (!response.ok) {
    let errorData = null;

    try {
      errorData =
        JSON.parse(rawResponse);
    } catch {}

    return sendError(
      res,
      response.status,
      "Gemini API 요청 실패",
      {
        detail:
          errorData?.error?.message ||
          rawResponse,

        model: MODEL
      }
    );
  }

  /*
   * ----------------------------------------------------------
   * Gemini 응답 JSON
   * ----------------------------------------------------------
   */

  let gemini;

  try {
    gemini =
      JSON.parse(rawResponse);
  } catch {
    return sendError(
      res,
      500,
      "Gemini 서버 응답을 읽을 수 없습니다."
    );
  }

  const candidate =
    gemini?.candidates?.[0];

  if (!candidate) {
    return sendError(
      res,
      500,
      "Gemini 분석 결과가 없습니다.",
      {
        raw: gemini
      }
    );
  }

  const finishReason =
    candidate?.finishReason || "";

  const parts =
    candidate?.content?.parts || [];

  const text =
    parts
      .map(part =>
        typeof part?.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();

  if (!text) {
    return sendError(
      res,
      500,
      "Gemini가 빈 응답을 반환했습니다.",
      {
        finishReason
      }
    );
  }

  /*
   * ----------------------------------------------------------
   * JSON 추출
   *
   * Gemini가 혹시 앞뒤에 글을 붙여도
   * JSON 부분만 찾아낸다.
   * ----------------------------------------------------------
   */

  const result =
    extractJSON(text);

  if (!result) {
    return sendError(
      res,
      500,
      "Gemini가 JSON을 반환하지 않았습니다.",
      {
        finishReason,
        raw: text.slice(0, 10000)
      }
    );
  }

  /*
   * ----------------------------------------------------------
   * 기본 검증
   * ----------------------------------------------------------
   */

  const validation =
    validateBattle(result);

  if (!validation.ok) {
    return sendError(
      res,
      500,
      "AI 분석 결과가 올바르지 않습니다.",
      {
        reason: validation.reason,
        result
      }
    );
  }

  /*
   * ----------------------------------------------------------
   * 정규화
   * ----------------------------------------------------------
   */

  const normalized =
    normalizeBattle(result);

  /*
   * ----------------------------------------------------------
   * 성공
   * ----------------------------------------------------------
   */

  return res.status(200).json({
    ok: true,
    model: MODEL,
    finishReason,
    result: normalized
  });
}


/*
 * ============================================================
 * JSON 추출
 * ============================================================
 */

function extractJSON(text) {
  let value = text.trim();

  /*
   * ```json ... ``` 제거
   */

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  /*
   * 1차: 전체 JSON
   */

  try {
    return JSON.parse(value);
  } catch {}

  /*
   * 2차:
   * 첫 { 부터 마지막 }까지 잘라서 시도
   */

  const first =
    value.indexOf("{");

  const last =
    value.lastIndexOf("}");

  if (
    first !== -1 &&
    last !== -1 &&
    last > first
  ) {
    const candidate =
      value.slice(
        first,
        last + 1
      );

    try {
      return JSON.parse(
        candidate
      );
    } catch {}
  }

  return null;
}


/*
 * ============================================================
 * 검증
 * ============================================================
 */

function validateBattle(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return {
      ok: false,
      reason: "결과가 객체가 아닙니다."
    };
  }

  if (
    !data.attacker ||
    !data.defender
  ) {
    return {
      ok: false,
      reason:
        "공격자 또는 방어자 데이터가 없습니다."
    };
  }

  if (
    typeof data.attacker.player !==
    "string"
  ) {
    return {
      ok: false,
      reason:
        "공격자 닉네임이 없습니다."
    };
  }

  if (
    typeof data.defender.player !==
    "string"
  ) {
    return {
      ok: false,
      reason:
        "방어자 닉네임이 없습니다."
    };
  }

  if (
    !Array.isArray(
      data.attacker.deck
    ) ||
    data.attacker.deck.length !== 3
  ) {
    return {
      ok: false,
      reason:
        "공격자 덱 3명이 필요합니다."
    };
  }

  if (
    !Array.isArray(
      data.defender.deck
    ) ||
    data.defender.deck.length !== 3
  ) {
    return {
      ok: false,
      reason:
        "방어자 덱 3명이 필요합니다."
    };
  }

  return {
    ok: true
  };
}


/*
 * ============================================================
 * 숫자 정규화
 * ============================================================
 */

function numberValue(value) {
  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return -1;
  }

  return n;
}


/*
 * ============================================================
 * 장수 정규화
 * ============================================================
 */

function normalizeUnit(unit) {
  return {
    name:
      typeof unit?.name === "string"
        ? unit.name.trim()
        : "",

    level:
      numberValue(unit?.level),

    promotion:
      numberValue(
        unit?.promotion
      ),

    cur:
      numberValue(unit?.cur),

    max:
      numberValue(unit?.max)
  };
}


/*
 * ============================================================
 * 진영 정규화
 * ============================================================
 */

function normalizeSide(side) {
  return {
    player:
      typeof side?.player === "string"
        ? side.player.trim()
        : "",

    clan:
      typeof side?.clan === "string"
        ? side.clan.trim()
        : "",

    deck:
      Array.isArray(side?.deck)
        ? side.deck
            .slice(0, 3)
            .map(normalizeUnit)
        : []
  };
}


/*
 * ============================================================
 * 전체 정규화
 * ============================================================
 */

function normalizeBattle(data) {
  return {
    result:
      typeof data?.result === "string"
        ? data.result.trim()
        : "",

    attacker:
      normalizeSide(
        data.attacker
      ),

    defender:
      normalizeSide(
        data.defender
      )
  };
}


/*
 * ============================================================
 * ERROR
 * ============================================================
 */

function sendError(
  res,
  status,
  message,
  extra = {}
) {
  return res
    .status(status)
    .json({
      ok: false,
      error: message,
      ...extra
    });
}
