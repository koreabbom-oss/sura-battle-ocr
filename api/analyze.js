// ============================================================
// 수라 전투부대
// api/analyze.js
//
// Gemini 전투결과 이미지 분석
// 공격자 + 방어자 데이터를 동시에 추출
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
      "POST 요청만 사용할 수 있습니다."
    );
  }

  // ----------------------------------------------------------
  // GEMINI API KEY
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
  // REQUEST BODY
  // ----------------------------------------------------------

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
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

  let imageInput =
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

  let base64Data = String(imageInput);

  // data:image/jpeg;base64,XXXX
  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(
      /^data:([^;]+);base64,(.*)$/s
    );

    if (!match) {
      return sendError(
        res,
        400,
        "이미지 data URL 형식이 올바르지 않습니다."
      );
    }

    mimeType = match[1] || mimeType;
    base64Data = match[2];
  }

  base64Data = base64Data
    .replace(/^data:[^,]+,/, "")
    .replace(/\s/g, "");

  if (base64Data.length < 100) {
    return sendError(
      res,
      400,
      "이미지 데이터가 비어 있습니다."
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
    )}:generateContent`;

  // ----------------------------------------------------------
  // JSON SCHEMA
  //
  // 중요:
  // nullable을 사용하지 않는다.
  //
  // promotion = -1
  // 이면 판독 불가.
  // ----------------------------------------------------------

  const BATTLE_SCHEMA = {
    type: "object",

    properties: {
      battle_result: {
        type: "string",
        description:
          "이미지에 표시된 전투 결과. 승리, 패배, 무승부 중 하나."
      },

      attacker: {
        type: "object",

        properties: {
          player: {
            type: "string",
            description:
              "화면 왼쪽 공격자의 게임 닉네임. 이미지에 보이는 그대로."
          },

          clan: {
            type: "string",
            description:
              "화면 왼쪽 공격자의 맹 이름. 이미지에 보이는 그대로."
          },

          troops_current: {
            type: "integer",
            description:
              "공격자의 전체 현재 병력. 읽을 수 없으면 -1."
          },

          troops_max: {
            type: "integer",
            description:
              "공격자의 전체 최대 병력. 읽을 수 없으면 -1."
          },

          deck: {
            type: "array",
            minItems: 3,
            maxItems: 3,

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string",
                  description:
                    "장수 카드에 표시된 장수 이름."
                },

                level: {
                  type: "integer",
                  description:
                    "장수 카드에 표시된 레벨. 읽을 수 없으면 -1."
                },

                promotion: {
                  type: "integer",
                  description:
                    "장수 카드에 표시된 빨간색 승급 숫자. 반드시 이미지의 빨간 승급 표시를 직접 판독한다. 추측 금지. 읽을 수 없으면 -1."
                },

                troops_current: {
                  type: "integer",
                  description:
                    "해당 장수의 현재 병력. 읽을 수 없으면 -1."
                },

                troops_max: {
                  type: "integer",
                  description:
                    "해당 장수의 최대 병력. 읽을 수 없으면 -1."
                }
              },

              required: [
                "name",
                "level",
                "promotion",
                "troops_current",
                "troops_max"
              ],

              additionalProperties: false
            }
          }
        },

        required: [
          "player",
          "clan",
          "troops_current",
          "troops_max",
          "deck"
        ],

        additionalProperties: false
      },

      defender: {
        type: "object",

        properties: {
          player: {
            type: "string",
            description:
              "화면 오른쪽 방어자의 게임 닉네임. 이미지에 보이는 그대로."
          },

          clan: {
            type: "string",
            description:
              "화면 오른쪽 방어자의 맹 이름. 이미지에 보이는 그대로."
          },

          troops_current: {
            type: "integer",
            description:
              "방어자의 전체 현재 병력. 읽을 수 없으면 -1."
          },

          troops_max: {
            type: "integer",
            description:
              "방어자의 전체 최대 병력. 읽을 수 없으면 -1."
          },

          deck: {
            type: "array",
            minItems: 3,
            maxItems: 3,

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string",
                  description:
                    "장수 카드에 표시된 장수 이름."
                },

                level: {
                  type: "integer",
                  description:
                    "장수 카드에 표시된 레벨. 읽을 수 없으면 -1."
                },

                promotion: {
                  type: "integer",
                  description:
                    "장수 카드에 표시된 빨간색 승급 숫자. 반드시 이미지의 빨간 승급 표시를 직접 판독한다. 추측 금지. 읽을 수 없으면 -1."
                },

                troops_current: {
                  type: "integer",
                  description:
                    "해당 장수의 현재 병력. 읽을 수 없으면 -1."
                },

                troops_max: {
                  type: "integer",
                  description:
                    "해당 장수의 최대 병력. 읽을 수 없으면 -1."
                }
              },

              required: [
                "name",
                "level",
                "promotion",
                "troops_current",
                "troops_max"
              ],

              additionalProperties: false
            }
          }
        },

        required: [
          "player",
          "clan",
          "troops_current",
          "troops_max",
          "deck"
        ],

        additionalProperties: false
      }
    },

    required: [
      "battle_result",
      "attacker",
      "defender"
    ],

    additionalProperties: false
  };

  // ----------------------------------------------------------
  // PROMPT
  // ----------------------------------------------------------

  const prompt = `
이 이미지는 삼국지 전략 게임의 전투 결과 화면이다.

이미지를 OCR처럼 매우 정확하게 읽어서 데이터를 추출한다.

가장 중요한 것은 공격자와 방어자의 데이터를 모두 정확하게
분리하는 것이다.

==================================================
공격자 / 방어자
==================================================

화면 왼쪽:

공격자

화면 오른쪽:

방어자

절대로 두 사람을 뒤바꾸지 않는다.

공격자의 닉네임은 화면 왼쪽 위의 닉네임을 읽는다.

방어자의 닉네임은 화면 오른쪽 위의 닉네임을 읽는다.

맹 이름도 각각 따로 읽는다.

예:

공격자:
토리아빠
별빛

방어자:
멸망
낙화

라면 반드시 그대로 반환한다.

==================================================
장수 덱
==================================================

공격자 3명과 방어자 3명을 모두 읽는다.

각 장수마다:

1. 이름
2. 레벨
3. 승급
4. 현재 병력
5. 최대 병력

을 읽는다.

==================================================
승급은 매우 중요
==================================================

장수 카드에서 빨간색으로 표시되는 승급 숫자가 있다.

그 숫자를 직접 이미지에서 읽는다.

예:

빨간 승급 표시가 1개면:

promotion = 1

빨간 승급 표시가 2개면:

promotion = 2

빨간 승급 표시가 3개면:

promotion = 3

절대로 레벨을 이용해서 승급을 추측하지 않는다.

레벨 50이라고 승급 2라고 판단하면 안 된다.

승급은 반드시 이미지의 빨간 표시를 직접 판독한다.

판독할 수 없는 경우:

promotion = -1

==================================================
병력
==================================================

예:

0 / 14,777

이면:

troops_current = 0
troops_max = 14777

예:

26,736 / 30,000

이면:

troops_current = 26736
troops_max = 30000

쉼표는 제거한다.

==================================================
중요
==================================================

이미지에 실제로 보이지 않는 값은 절대로 추측하지 않는다.

읽을 수 없는 숫자는 -1.

읽을 수 없는 이름은 빈 문자열.

하지만 공격자와 방어자 모두 반드시 반환한다.

공격자 덱 3명 모두 반환한다.

방어자 덱 3명 모두 반환한다.

설명하지 않는다.

JSON만 반환한다.
`;

  // ----------------------------------------------------------
  // REQUEST BODY
  //
  // 여기 부분이 이번에 가장 중요하다.
  //
  // generateContent의 공식 Structured Output 형식:
  //
  // generationConfig
  //   responseFormat
  //     text
  //       mimeType
  //       schema
  //
  // ----------------------------------------------------------

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
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: BATTLE_SCHEMA
        }
      },

      maxOutputTokens: 1800
    }
  };

  // ----------------------------------------------------------
  // GEMINI 호출
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
      response = await fetch(endpoint, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY
        },

        body: JSON.stringify(requestBody)
      });

      // 성공
      if (response.ok) {
        break;
      }

      // 재시도 가능한 오류
      const retryable =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (
        !retryable ||
        attempt >= MAX_RETRIES
      ) {
        break;
      }

      // 응답 소비
      try {
        await response.text();
      } catch {}

      // 1초 → 2초 → 4초
      const delay =
        Math.min(
          1000 * Math.pow(2, attempt),
          8000
        );

      await sleep(delay);

    } catch (error) {
      lastError =
        error?.message ||
        String(error);

      if (attempt >= MAX_RETRIES) {
        return sendError(
          res,
          500,
          "Gemini API 연결에 실패했습니다.",
          {
            detail: lastError,
            model: MODEL
          }
        );
      }

      const delay =
        Math.min(
          1000 * Math.pow(2, attempt),
          8000
        );

      await sleep(delay);
    }
  }

  // ----------------------------------------------------------
  // HTTP ERROR
  // ----------------------------------------------------------

  if (!response || !response.ok) {
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
      errorData = {
        message: rawError
      };
    }

    const message =
      errorData?.error?.message ||
      errorData?.message ||
      rawError ||
      lastError ||
      "알 수 없는 Gemini API 오류";

    let userMessage = message;

    if (response?.status === 503) {
      userMessage =
        "Gemini 서버가 일시적으로 혼잡합니다. " +
        "자동 재시도 후에도 실패했습니다.";
    }

    if (response?.status === 429) {
      userMessage =
        "Gemini API 사용량 또는 요청 한도에 도달했습니다.";
    }

    if (response?.status === 400) {
      userMessage =
        "Gemini 요청 형식이 잘못되었습니다.";
    }

    if (response?.status === 404) {
      userMessage =
        "Gemini 모델을 찾을 수 없습니다.";
    }

    return res.status(
      response?.status || 500
    ).json({
      ok: false,
      error: "Gemini API 요청 실패",
      http_status:
        response?.status || 500,
      model: MODEL,
      message: userMessage,
      detail: message
    });
  }

  // ----------------------------------------------------------
  // GEMINI RESPONSE
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
      "Gemini 응답 자체가 JSON이 아닙니다.",
      {
        detail:
          error?.message ||
          String(error),
        raw:
          rawText.slice(0, 5000)
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
    candidate?.finish_reason ||
    null;

  // ----------------------------------------------------------
  // MAX TOKENS
  // ----------------------------------------------------------

  if (
    finishReason === "MAX_TOKENS" ||
    finishReason === "MAX_TOKENS_REACHED"
  ) {
    return sendError(
      res,
      500,
      "Gemini 분석 결과가 길이 제한으로 잘렸습니다.",
      {
        finishReason
      }
    );
  }

  // ----------------------------------------------------------
  // TEXT
  // ----------------------------------------------------------

  const parts =
    candidate?.content?.parts || [];

  const text =
    parts
      .map(
        (part) =>
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
      "Gemini가 분석 결과를 반환하지 않았습니다.",
      {
        finishReason,
        candidate
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
          text.slice(0, 10000)
      }
    );
  }

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  const validation =
    validateBattleResult(result);

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
    normalizeBattleResult(result);

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
      setTimeout(resolve, ms)
  );
}


// ============================================================
// VALIDATION
// ============================================================

function validateBattleResult(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      ok: false,
      reason:
        "결과가 객체가 아닙니다."
    };
  }

  if (
    !result.attacker ||
    typeof result.attacker !== "object"
  ) {
    return {
      ok: false,
      reason:
        "공격자 데이터가 없습니다."
    };
  }

  if (
    !result.defender ||
    typeof result.defender !== "object"
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
    result.attacker.deck.length !== 3
  ) {
    return {
      ok: false,
      reason:
        "공격자 덱이 정확히 3명이 아닙니다."
    };
  }

  if (
    result.defender.deck.length !== 3
  ) {
    return {
      ok: false,
      reason:
        "방어자 덱이 정확히 3명이 아닙니다."
    };
  }

  if (
    typeof result.attacker.player !==
    "string"
  ) {
    return {
      ok: false,
      reason:
        "공격자 닉네임이 없습니다."
    };
  }

  if (
    typeof result.defender.player !==
    "string"
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
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
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
    !Number.isFinite(number)
  ) {
    return null;
  }

  // -1 = 판독 불가
  if (number === -1) {
    return null;
  }

  if (
    !Number.isInteger(number)
  ) {
    return null;
  }

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
            unit?.level,
            null
          ),

        promotion:
          normalizePromotion(
            unit?.promotion
          ),

        troops_current:
          normalizeNumber(
            unit?.troops_current,
            null
          ),

        troops_max:
          normalizeNumber(
            unit?.troops_max,
            null
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
        side?.troops_current,
        null
      ),

    troops_max:
      normalizeNumber(
        side?.troops_max,
        null
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
