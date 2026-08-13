// ============================================================
// 수라 전투부대
// api/analyze.js
//
// 전투 스크린샷 → Gemini → 구조화된 전투 데이터
// ============================================================

export default async function handler(req, res) {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

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
    return sendError(
      res,
      405,
      "POST 요청만 허용됩니다."
    );
  }

  // ----------------------------------------------------------
  // API KEY
  // ----------------------------------------------------------

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (!API_KEY) {
    return sendError(
      res,
      500,
      "GEMINI_API_KEY가 Vercel 환경변수에 없습니다."
    );
  }

  // ----------------------------------------------------------
  // BODY
  // ----------------------------------------------------------

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

  if (!body || typeof body !== "object") {
    return sendError(
      res,
      400,
      "요청 데이터가 없습니다."
    );
  }

  // ----------------------------------------------------------
  // IMAGE
  // ----------------------------------------------------------

  const imageInput =
    body.image ||
    body.imageBase64 ||
    body.base64 ||
    null;

  if (!imageInput) {
    return sendError(
      res,
      400,
      "분석할 이미지가 없습니다."
    );
  }

  let mimeType =
    body.mimeType ||
    body.mime_type ||
    "image/jpeg";

  let base64Data =
    String(imageInput);

  // data:image/jpeg;base64,...
  if (base64Data.startsWith("data:")) {
    const match =
      base64Data.match(
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

  if (base64Data.length < 100) {
    return sendError(
      res,
      400,
      "이미지 데이터가 너무 작습니다."
    );
  }

  // ----------------------------------------------------------
  // MODEL
  // ----------------------------------------------------------

  const MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.6-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      MODEL
    )}:generateContent?key=${encodeURIComponent(
      API_KEY
    )}`;

  // ----------------------------------------------------------
  // JSON SCHEMA
  //
  // 아주 단순하게 유지한다.
  // ----------------------------------------------------------

  const BATTLE_SCHEMA = {
    type: "object",

    properties: {
      battle_result: {
        type: "string"
      },

      attacker: {
        type: "object",

        properties: {
          player: {
            type: "string"
          },

          clan: {
            type: "string"
          },

          troops_current: {
            type: "integer"
          },

          troops_max: {
            type: "integer"
          },

          deck: {
            type: "array",

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string"
                },

                level: {
                  type: "integer"
                },

                promotion: {
                  type: "integer"
                },

                troops_current: {
                  type: "integer"
                },

                troops_max: {
                  type: "integer"
                }
              },

              required: [
                "name",
                "level",
                "promotion",
                "troops_current",
                "troops_max"
              ]
            }
          }
        },

        required: [
          "player",
          "clan",
          "troops_current",
          "troops_max",
          "deck"
        ]
      },

      defender: {
        type: "object",

        properties: {
          player: {
            type: "string"
          },

          clan: {
            type: "string"
          },

          troops_current: {
            type: "integer"
          },

          troops_max: {
            type: "integer"
          },

          deck: {
            type: "array",

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string"
                },

                level: {
                  type: "integer"
                },

                promotion: {
                  type: "integer"
                },

                troops_current: {
                  type: "integer"
                },

                troops_max: {
                  type: "integer"
                }
              },

              required: [
                "name",
                "level",
                "promotion",
                "troops_current",
                "troops_max"
              ]
            }
          }
        },

        required: [
          "player",
          "clan",
          "troops_current",
          "troops_max",
          "deck"
        ]
      }
    },

    required: [
      "battle_result",
      "attacker",
      "defender"
    ]
  };

  // ----------------------------------------------------------
  // PROMPT
  //
  // 최대한 짧게 한다.
  // ----------------------------------------------------------

  const prompt = `
이 이미지는 삼국지 전략 게임의 전투 결과 화면이다.

이미지에서 실제로 보이는 값만 판독한다.
추측하지 않는다.

[공격자]
화면 왼쪽의 닉네임, 맹, 전체 병력,
장수 3명을 읽는다.

[방어자]
화면 오른쪽의 닉네임, 맹, 전체 병력,
장수 3명을 읽는다.

각 장수는 다음을 읽는다.

- name: 장수 이름
- level: 레벨
- promotion: 카드에 실제로 보이는 빨간색 승급 숫자
- troops_current: 현재 병력
- troops_max: 최대 병력

승급 숫자가 매우 중요하다.

레벨을 보고 승급을 추측하지 않는다.

빨간 승급 표시가 실제로 1개면 1,
2개면 2,
3개면 3이다.

읽을 수 없으면 promotion은 -1이다.

닉네임과 맹 이름은 이미지에 보이는 그대로 입력한다.

공격자와 방어자를 절대 뒤바꾸지 않는다.

공격자와 방어자 모두 반드시 반환한다.

장수는 각각 정확히 3명이다.

전체 병력 예:
0 / 14,777 → 0, 14777
26,736 / 30,000 → 26736, 30000

오직 지정된 JSON만 반환한다.
`;

  // ----------------------------------------------------------
  // GEMINI REQUEST
  //
  // 중요:
  // responseFormat 사용하지 않는다.
  //
  // generateContent의 generationConfig에서
  // responseMimeType / responseSchema 사용.
  // ----------------------------------------------------------

  const requestBody = {
    contents: [
      {
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
      responseSchema: BATTLE_SCHEMA,
      maxOutputTokens: 1600
    }
  };

  // ----------------------------------------------------------
  // GEMINI REQUEST
  //
  // 503 / 429 등은 최대 3회 재시도
  // ----------------------------------------------------------

  const MAX_RETRIES = 3;

  let response = null;
  let lastError = null;

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      response = await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(
            requestBody
          )
        }
      );

      // 성공
      if (response.ok) {
        break;
      }

      const retryable =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      // 재시도 불가능
      if (
        !retryable ||
        attempt >= MAX_RETRIES
      ) {
        break;
      }

      // 응답 버리기
      try {
        await response.text();
      } catch {}

      const delay =
        Math.min(
          1000 *
            Math.pow(
              2,
              attempt
            ),
          8000
        );

      await sleep(delay);

    } catch (error) {
      lastError =
        error?.message ||
        String(error);

      if (
        attempt >= MAX_RETRIES
      ) {
        return sendError(
          res,
          500,
          "Gemini API 연결 실패",
          {
            detail: lastError
          }
        );
      }

      const delay =
        Math.min(
          1000 *
            Math.pow(
              2,
              attempt
            ),
          8000
        );

      await sleep(delay);
    }
  }

  // ----------------------------------------------------------
  // HTTP ERROR
  // ----------------------------------------------------------

  if (
    !response ||
    !response.ok
  ) {
    let rawError = "";

    try {
      rawError =
        await response.text();
    } catch {}

    let errorData;

    try {
      errorData =
        JSON.parse(rawError);
    } catch {
      errorData = null;
    }

    const googleMessage =
      errorData?.error?.message ||
      rawError ||
      lastError ||
      "알 수 없는 Gemini API 오류";

    let message =
      googleMessage;

    if (
      response?.status === 503
    ) {
      message =
        "Gemini 서버가 일시적으로 혼잡합니다. 자동 재시도 후에도 실패했습니다.";
    }

    if (
      response?.status === 429
    ) {
      message =
        "Gemini API 사용량 또는 요청 한도에 도달했습니다.";
    }

    if (
      response?.status === 400
    ) {
      message =
        googleMessage;
    }

    if (
      response?.status === 404
    ) {
      message =
        `Gemini 모델을 찾을 수 없습니다: ${MODEL}`;
    }

    return res
      .status(
        response?.status || 500
      )
      .json({
        ok: false,

        error:
          "Gemini API 요청 실패",

        http_status:
          response?.status || 500,

        model: MODEL,

        message,

        detail:
          googleMessage
      });
  }

  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  let rawText;

  try {
    rawText =
      await response.text();
  } catch (error) {
    return sendError(
      res,
      500,
      "Gemini 응답을 읽지 못했습니다.",
      {
        detail:
          error?.message ||
          String(error)
      }
    );
  }

  let geminiData;

  try {
    geminiData =
      JSON.parse(rawText);
  } catch (error) {
    return sendError(
      res,
      500,
      "Gemini API 응답이 JSON이 아닙니다.",
      {
        detail:
          error?.message ||
          String(error),

        raw:
          rawText.slice(
            0,
            5000
          )
      }
    );
  }

  // ----------------------------------------------------------
  // CANDIDATE
  // ----------------------------------------------------------

  const candidate =
    geminiData?.candidates?.[0];

  if (!candidate) {
    return sendError(
      res,
      500,
      "Gemini가 분석 결과를 반환하지 않았습니다.",
      {
        raw: geminiData
      }
    );
  }

  const finishReason =
    candidate?.finishReason ||
    null;

  // ----------------------------------------------------------
  // MAX TOKEN
  // ----------------------------------------------------------

  if (
    finishReason ===
      "MAX_TOKENS" ||
    finishReason ===
      "MAX_TOKENS_REACHED"
  ) {
    return sendError(
      res,
      500,
      "Gemini 응답이 중간에 잘렸습니다.",
      {
        finishReason
      }
    );
  }

  // ----------------------------------------------------------
  // TEXT
  // ----------------------------------------------------------

  const parts =
    candidate?.content?.parts ||
    [];

  const text =
    parts
      .map(
        (part) =>
          typeof part?.text ===
          "string"
            ? part.text
            : ""
      )
      .join("")
      .trim();

  if (!text) {
    return sendError(
      res,
      500,
      "Gemini가 분석 결과를 반환하지 않았습니다.",
      {
        finishReason
      }
    );
  }

  // ----------------------------------------------------------
  // JSON PARSE
  // ----------------------------------------------------------

  let result;

  try {
    result =
      JSON.parse(text);
  } catch (error) {
    return sendError(
      res,
      500,
      "Gemini가 올바른 JSON을 반환하지 않았습니다.",
      {
        finishReason,

        parse_error:
          error?.message ||
          String(error),

        raw:
          text.slice(
            0,
            10000
          )
      }
    );
  }

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  const validation =
    validateBattleResult(
      result
    );

  if (!validation.ok) {
    return sendError(
      res,
      500,
      "AI 분석 결과가 올바르지 않습니다.",
      {
        reason:
          validation.reason,

        result
      }
    );
  }

  // ----------------------------------------------------------
  // NORMALIZE
  // ----------------------------------------------------------

  result =
    normalizeBattleResult(
      result
    );

  // ----------------------------------------------------------
  // SUCCESS
  // ----------------------------------------------------------

  return res.status(200).json({
    ok: true,

    model: MODEL,

    finishReason,

    result
  });
}


// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


// ============================================================
// VALIDATION
// ============================================================

function validateBattleResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return {
      ok: false,
      reason:
        "결과 객체가 없습니다."
    };
  }

  if (
    !result.attacker ||
    typeof result.attacker !==
      "object"
  ) {
    return {
      ok: false,
      reason:
        "공격자 데이터가 없습니다."
    };
  }

  if (
    !result.defender ||
    typeof result.defender !==
      "object"
  ) {
    return {
      ok: false,
      reason:
        "방어자 데이터가 없습니다."
    };
  }

  if (
    !Array.isArray(
      result.attacker.deck
    )
  ) {
    return {
      ok: false,
      reason:
        "공격자 덱이 없습니다."
    };
  }

  if (
    !Array.isArray(
      result.defender.deck
    )
  ) {
    return {
      ok: false,
      reason:
        "방어자 덱이 없습니다."
    };
  }

  if (
    result.attacker.deck
      .length !== 3
  ) {
    return {
      ok: false,
      reason:
        "공격자 장수가 3명이 아닙니다."
    };
  }

  if (
    result.defender.deck
      .length !== 3
  ) {
    return {
      ok: false,
      reason:
        "방어자 장수가 3명이 아닙니다."
    };
  }

  if (
    typeof result.attacker
      .player !== "string" ||
    !result.attacker.player
  ) {
    return {
      ok: false,
      reason:
        "공격자 닉네임이 없습니다."
    };
  }

  if (
    typeof result.defender
      .player !== "string" ||
    !result.defender.player
  ) {
    return {
      ok: false,
      reason:
        "방어자 닉네임이 없습니다."
    };
  }

  return {
    ok: true
  };
}


// ============================================================
// NUMBER
// ============================================================

function normalizeNumber(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  // -1 = 판독 불가
  if (number === -1) {
    return null;
  }

  return number;
}


// ============================================================
// PROMOTION
// ============================================================

function normalizePromotion(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number)
  ) {
    return null;
  }

  // 판독 불가
  if (number === -1) {
    return null;
  }

  // 비정상적인 값
  if (
    number < 0 ||
    number > 20
  ) {
    return null;
  }

  return number;
}


// ============================================================
// DECK
// ============================================================

function normalizeDeck(
  deck
) {
  if (
    !Array.isArray(deck)
  ) {
    return [];
  }

  return deck
    .slice(0, 3)
    .map(
      (unit) => ({
        name:
          typeof unit?.name ===
          "string"
            ? unit.name.trim()
            : "",

        level:
          normalizeNumber(
            unit?.level
          ),

        promotion:
          normalizePromotion(
            unit?.promotion
          ),

        troops_current:
          normalizeNumber(
            unit?.troops_current
          ),

        troops_max:
          normalizeNumber(
            unit?.troops_max
          )
      })
    );
}


// ============================================================
// SIDE
// ============================================================

function normalizeSide(
  side
) {
  return {
    player:
      typeof side?.player ===
      "string"
        ? side.player.trim()
        : "",

    clan:
      typeof side?.clan ===
      "string"
        ? side.clan.trim()
        : "",

    troops_current:
      normalizeNumber(
        side?.troops_current
      ),

    troops_max:
      normalizeNumber(
        side?.troops_max
      ),

    deck:
      normalizeDeck(
        side?.deck
      )
  };
}


// ============================================================
// BATTLE RESULT
// ============================================================

function normalizeBattleResult(
  result
) {
  return {
    battle_result:
      typeof result?.battle_result ===
      "string"
        ? result.battle_result.trim()
        : "",

    attacker:
      normalizeSide(
        result.attacker
      ),

    defender:
      normalizeSide(
        result.defender
      )
  };
}


// ============================================================
// ERROR
// ============================================================

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
