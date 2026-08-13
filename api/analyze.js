// ============================================================
// 수라 전투부대
// api/analyze.js
// Gemini 전투 스크린샷 분석
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
        "요청 데이터가 올바른 JSON이 아닙니다."
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

  let base64Data = imageInput;

  // data:image/jpeg;base64,xxxx
  if (
    typeof imageInput === "string" &&
    imageInput.startsWith("data:")
  ) {
    const match = imageInput.match(
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

  base64Data = String(base64Data)
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
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(API_KEY);

  // ----------------------------------------------------------
  // PROMPT
  // ----------------------------------------------------------

  const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을
정확한 데이터로 변환하는 OCR 분석 AI다.

이 이미지는 전투 결과 화면이다.

반드시 이미지에 실제로 보이는 정보만 사용한다.
절대 게임 지식으로 추측하지 않는다.

==================================================
가장 중요한 규칙
==================================================

1. 공격자와 방어자를 정확히 구분한다.

2. 화면 왼쪽은 공격자다.

3. 화면 오른쪽은 방어자다.

4. 공격자의 닉네임을 정확하게 읽는다.

5. 방어자의 닉네임을 정확하게 읽는다.

6. 공격자의 맹 이름을 정확하게 읽는다.

7. 방어자의 맹 이름을 정확하게 읽는다.

8. 공격자와 방어자의 데이터를 모두 반환한다.

9. 어느 한쪽의 데이터도 생략하지 않는다.

==================================================
장수 정보
==================================================

각 진영의 장수 3명을 읽는다.

각 장수에 대해 반드시:

- 이름
- 레벨
- 승급
- 현재 병력
- 최대 병력

을 읽는다.

==================================================
승급 정보
==================================================

매우 중요하다.

장수 카드에 표시되는 빨간색 승급 숫자를
그대로 읽는다.

예를 들어:

빨간 표시 1개 = promotion 1
빨간 표시 2개 = promotion 2
빨간 표시 3개 = promotion 3

절대로 레벨을 보고 승급을 추측하지 않는다.

예:

레벨 50이라고 해서 승급을 2라고 만들면 안 된다.

실제 이미지에서 빨간 승급 표시가 3개면 3이다.

승급 숫자를 읽을 수 없는 경우에는 null이다.

==================================================
병력
==================================================

예:

0 / 10,000

이면

troops_current = 0
troops_max = 10000

이다.

쉼표는 제거한다.

==================================================
전투 결과
==================================================

이미지에 표시된 결과를 그대로 읽는다.

가능한 값:

승리
패배
무승부

==================================================
출력 형식
==================================================

오직 아래 JSON만 반환한다.

{
  "battle_result": "패배",
  "attacker": {
    "player": "토리아빠",
    "clan": "별빛",
    "troops_current": 0,
    "troops_max": 30000,
    "deck": [
      {
        "name": "장량",
        "level": 50,
        "promotion": 2,
        "troops_current": 0,
        "troops_max": 10000
      },
      {
        "name": "장보",
        "level": 50,
        "promotion": 2,
        "troops_current": 0,
        "troops_max": 10000
      },
      {
        "name": "장각",
        "level": 50,
        "promotion": 2,
        "troops_current": 0,
        "troops_max": 10000
      }
    ]
  },
  "defender": {
    "player": "멸망",
    "clan": "낙화",
    "troops_current": 26736,
    "troops_max": 30000,
    "deck": [
      {
        "name": "제갈량",
        "level": 50,
        "promotion": 3,
        "troops_current": 9936,
        "troops_max": 10000
      },
      {
        "name": "대교",
        "level": 50,
        "promotion": 2,
        "troops_current": 8955,
        "troops_max": 10000
      },
      {
        "name": "황개",
        "level": 50,
        "promotion": 3,
        "troops_current": 7845,
        "troops_max": 10000
      }
    ]
  }
}

==================================================
절대 하지 말 것
==================================================

- 설명문 작성 금지
- 마크다운 금지
- 코드블록 금지
- JSON 앞뒤에 문장 작성 금지
- 승급 추측 금지
- 닉네임 추측 금지
- 맹 추측 금지
- 장수 이름 추측 금지

오직 JSON 하나만 반환한다.

읽을 수 없는 값은 null이다.
`;

  // ----------------------------------------------------------
  // GEMINI REQUEST BODY
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
      responseMimeType: "application/json",
      maxOutputTokens: 2200
    }
  };

  // ----------------------------------------------------------
  // GEMINI 호출
  //
  // 503 = 서버 용량 문제
  // 429 = quota/rate limit
  //
  // 둘 다 재시도한다.
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

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

      // 재시도할 수 없는 오류
      if (!retryable) {
        break;
      }

      // 마지막 시도
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // 응답을 소비해서 연결 정리
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
      rawError = await response.text();
    } catch {}

    let errorData = null;

    try {
      errorData = JSON.parse(rawError);
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
        "자동 재시도 3회 후에도 실패했습니다.";
    }

    if (response?.status === 429) {
      userMessage =
        "Gemini API 사용량 또는 요청 한도에 도달했습니다.";
    }

    if (response?.status === 404) {
      userMessage =
        "Gemini 모델을 찾을 수 없습니다. " +
        "Vercel의 GEMINI_MODEL 값을 확인하세요.";
    }

    if (response?.status === 400) {
      userMessage =
        "Gemini 요청 형식이 잘못되었습니다.";
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

  let rawText = "";

  try {
    rawText = await response.text();
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
    geminiData = JSON.parse(rawText);
  } catch (error) {
    return sendError(
      res,
      500,
      "Gemini 응답 자체가 JSON이 아닙니다.",
      {
        detail:
          error?.message ||
          String(error),
        raw: rawText.slice(0, 5000)
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
  // 출력이 MAX TOKENS 때문에 잘린 경우
  // ----------------------------------------------------------

  if (
    finishReason === "MAX_TOKENS" ||
    finishReason === "MAX_TOKENS_REACHED"
  ) {
    return sendError(
      res,
      500,
      "Gemini 분석 결과가 길이 제한으로 중간에 잘렸습니다.",
      {
        finishReason,
        message:
          "다시 시도하면 정상적으로 분석될 수 있습니다."
      }
    );
  }

  // ----------------------------------------------------------
  // TEXT
  // ----------------------------------------------------------

  const parts =
    candidate?.content?.parts || [];

  let text = parts
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
  // JSON CLEAN
  // ----------------------------------------------------------

  text = cleanJson(text);

  // ----------------------------------------------------------
  // JSON PARSE
  // ----------------------------------------------------------

  let result;

  try {
    result = JSON.parse(text);
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
        raw: text.slice(0, 12000)
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
        reason: validation.reason,
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
    (resolve) => setTimeout(resolve, ms)
  );
}


// ============================================================
// JSON CLEAN
// ============================================================

function cleanJson(text) {
  let value =
    String(text).trim();

  // ```json 제거
  value = value.replace(
    /^```json\s*/i,
    ""
  );

  // ``` 제거
  value = value.replace(
    /^```\s*/i,
    ""
  );

  value = value.replace(
    /\s*```$/i,
    ""
  );

  value = value.trim();

  // JSON 시작점
  const first =
    value.indexOf("{");

  if (first > 0) {
    value =
      value.slice(first);
  }

  // JSON 마지막점
  const last =
    value.lastIndexOf("}");

  if (
    last >= 0 &&
    last < value.length - 1
  ) {
    value =
      value.slice(
        0,
        last + 1
      );
  }

  return value.trim();
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
      reason: "결과가 객체가 아닙니다."
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
        "공격자 덱 데이터가 없습니다."
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
        "방어자 덱 데이터가 없습니다."
    };
  }

  if (
    result.attacker.deck.length < 3
  ) {
    return {
      ok: false,
      reason:
        "공격자 장수 3명을 모두 읽지 못했습니다."
    };
  }

  if (
    result.defender.deck.length < 3
  ) {
    return {
      ok: false,
      reason:
        "방어자 장수 3명을 모두 읽지 못했습니다."
    };
  }

  if (
    !result.attacker.player
  ) {
    return {
      ok: false,
      reason:
        "공격자 닉네임을 읽지 못했습니다."
    };
  }

  if (
    !result.defender.player
  ) {
    return {
      ok: false,
      reason:
        "방어자 닉네임을 읽지 못했습니다."
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
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

  if (!cleaned) {
    return fallback;
  }

  const number =
    Number(cleaned);

  return Number.isFinite(number)
    ? number
    : fallback;
}


// ============================================================
// PROMOTION
// ============================================================

function normalizePromotion(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    normalizeNumber(
      value,
      null
    );

  if (number === null) {
    return null;
  }

  if (
    !Number.isInteger(number) ||
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
          : String(
              unit.name
            ).trim(),

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
    }));
}


// ============================================================
// SIDE
// ============================================================

function normalizeSide(side) {
  return {
    player:
      side?.player === null ||
      side?.player === undefined
        ? ""
        : String(
            side.player
          ).trim(),

    clan:
      side?.clan === null ||
      side?.clan === undefined
        ? ""
        : String(
            side.clan
          ).trim(),

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

function normalizeBattleResult(result) {
  return {
    battle_result:
      result?.battle_result
        ? String(
            result.battle_result
          ).trim()
        : "",

    attacker:
      normalizeSide(
        result?.attacker
      ),

    defender:
      normalizeSide(
        result?.defender
      )
  };
}


// ============================================================
// ERROR RESPONSE
// ============================================================

function sendError(
  res,
  status,
  message,
  extra = {}
) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...extra
  });
}
