// ============================================================
// 수라 전투부대
// api/analyze.js
//
// 이미지 1장
// ↓
// Gemini 1회 호출
// ↓
// 공격자 + 방어자 데이터
//
// 중요:
// - 자동 재시도 없음
// - response_schema 사용 안 함
// - JSON 모드만 사용
// - 긴 설명 생성 금지
// ============================================================

export default async function handler(req, res) {

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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
    return errorResponse(
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
    return errorResponse(
      res,
      500,
      "GEMINI_API_KEY가 설정되어 있지 않습니다."
    );
  }

  // ----------------------------------------------------------
  // BODY
  // ----------------------------------------------------------

  let body = req.body;

  if (
    typeof body === "string"
  ) {
    try {
      body = JSON.parse(body);
    } catch {
      return errorResponse(
        res,
        400,
        "요청 JSON을 읽을 수 없습니다."
      );
    }
  }

  if (
    !body ||
    typeof body !== "object"
  ) {
    return errorResponse(
      res,
      400,
      "요청 데이터가 없습니다."
    );
  }

  // ----------------------------------------------------------
  // IMAGE
  // ----------------------------------------------------------

  let image =
    body.image ||
    body.imageBase64 ||
    body.base64 ||
    null;

  if (!image) {
    return errorResponse(
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
    String(image);

  // ----------------------------------------------------------
  // DATA URL 처리
  // ----------------------------------------------------------

  if (
    base64Data.startsWith("data:")
  ) {

    const match =
      base64Data.match(
        /^data:([^;]+);base64,(.*)$/s
      );

    if (!match) {
      return errorResponse(
        res,
        400,
        "이미지 데이터 형식이 올바르지 않습니다."
      );
    }

    mimeType =
      match[1];

    base64Data =
      match[2];
  }

  base64Data =
    base64Data
      .replace(
        /^data:[^,]+,/,
        ""
      )
      .replace(
        /\s/g,
        ""
      );

  if (
    base64Data.length < 100
  ) {
    return errorResponse(
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

  // ----------------------------------------------------------
  // GEMINI ENDPOINT
  // ----------------------------------------------------------

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      MODEL
    )}:generateContent`;

  // ----------------------------------------------------------
  // PROMPT
  //
  // 최대한 짧게 한다.
  // 결과 JSON도 짧게 만든다.
  // ----------------------------------------------------------

  const prompt = `
삼국지 전략 게임의 전투 결과 스크린샷이다.

이미지를 보고 JSON 하나만 반환한다.

절대로 설명하지 않는다.
마크다운을 사용하지 않는다.
JSON 이외의 문자를 반환하지 않는다.

반드시 공격자와 방어자를 모두 판독한다.

화면 왼쪽 = 공격자
화면 오른쪽 = 방어자

각 사람의 정보:

player = 닉네임
clan = 맹 이름

deck는 정확히 3명.

각 장수:

name = 이름
level = 레벨
promotion = 카드에 실제 표시된 빨간 승급 숫자
cur = 현재 병력
max = 최대 병력

승급 숫자는 반드시 이미지의 빨간 표시를 직접 읽는다.
레벨을 보고 승급을 추측하지 않는다.

읽을 수 없는 숫자는 -1.
읽을 수 없는 이름은 "".

쉼표는 숫자에서 제거한다.

예:
26,736 / 30,000
→ cur:26736, max:30000

JSON 형식:

{
"result":"승리 또는 패배 또는 무승부",
"attacker":{
"player":"",
"clan":"",
"deck":[
{"name":"","level":0,"promotion":0,"cur":0,"max":0},
{"name":"","level":0,"promotion":0,"cur":0,"max":0},
{"name":"","level":0,"promotion":0,"cur":0,"max":0}
]
},
"defender":{
"player":"",
"clan":"",
"deck":[
{"name":"","level":0,"promotion":0,"cur":0,"max":0},
{"name":"","level":0,"promotion":0,"cur":0,"max":0},
{"name":"","level":0,"promotion":0,"cur":0,"max":0}
]
}
}

중요:
공격자와 방어자를 절대 바꾸지 않는다.
실제 이미지에 없는 값을 추측하지 않는다.
승급 숫자를 반드시 이미지에서 직접 확인한다.
`;

  // ----------------------------------------------------------
  // REQUEST
  //
  // 중요:
  // REST API 공식 형식인 snake_case 사용
  //
  // response_schema 없음
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

      // JSON 모드만 사용
      response_mime_type:
        "application/json",

      // 충분하지만 과도하지 않은 출력 제한
      max_output_tokens:
        2048,

      // 분석 결과에 쓸데없는 장황한 답변 방지
      temperature: 0
    }
  };

  // ----------------------------------------------------------
  // GEMINI 호출
  //
  // 절대 자동 재시도하지 않는다.
  // 버튼 1번 = API 요청 1번
  // ----------------------------------------------------------

  let response;

  try {

    response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              API_KEY
          },

          body:
            JSON.stringify(
              requestBody
            )
        }
      );

  } catch (error) {

    return errorResponse(
      res,
      500,
      "Gemini API에 연결하지 못했습니다.",
      {
        detail:
          error?.message ||
          String(error)
      }
    );
  }

  // ----------------------------------------------------------
  // GEMINI HTTP ERROR
  // ----------------------------------------------------------

  const rawResponse =
    await response.text();

  if (!response.ok) {

    let googleError;

    try {
      googleError =
        JSON.parse(
          rawResponse
        );
    } catch {
      googleError = null;
    }

    const message =
      googleError?.error?.message ||
      rawResponse ||
      "Gemini API 오류";

    return errorResponse(
      res,
      response.status,
      "Gemini API 요청 실패",
      {
        http_status:
          response.status,

        model:
          MODEL,

        detail:
          message
      }
    );
  }

  // ----------------------------------------------------------
  // GEMINI RESPONSE JSON
  // ----------------------------------------------------------

  let gemini;

  try {

    gemini =
      JSON.parse(
        rawResponse
      );

  } catch (error) {

    return errorResponse(
      res,
      500,
      "Gemini API 응답을 읽을 수 없습니다.",
      {
        detail:
          error?.message ||
          String(error),

        raw:
          rawResponse.slice(
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
    gemini?.candidates?.[0];

  if (!candidate) {

    return errorResponse(
      res,
      500,
      "Gemini가 분석 결과를 반환하지 않았습니다.",
      {
        raw:
          gemini
      }
    );
  }

  // ----------------------------------------------------------
  // FINISH REASON
  // ----------------------------------------------------------

  const finishReason =
    candidate?.finishReason ||
    candidate?.finish_reason ||
    "";

  // ----------------------------------------------------------
  // TEXT
  // ----------------------------------------------------------

  const parts =
    candidate?.content?.parts ||
    [];

  const text =
    parts
      .map(
        part =>
          typeof part?.text ===
          "string"
            ? part.text
            : ""
      )
      .join("")
      .trim();

  if (!text) {

    return errorResponse(
      res,
      500,
      "Gemini가 빈 응답을 반환했습니다.",
      {
        finishReason
      }
    );
  }

  // ----------------------------------------------------------
  // JSON CLEAN
  //
  // 혹시 ```json 이 섞여도 제거
  // ----------------------------------------------------------

  let cleaned =
    text.trim();

  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();

  // ----------------------------------------------------------
  // JSON PARSE
  // ----------------------------------------------------------

  let result;

  try {

    result =
      JSON.parse(
        cleaned
      );

  } catch (error) {

    return errorResponse(
      res,
      500,
      "Gemini가 올바른 JSON을 반환하지 않았습니다.",
      {
        finishReason,

        parse_error:
          error?.message ||
          String(error),

        raw:
          cleaned.slice(
            0,
            10000
          )
      }
    );
  }

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  const check =
    validateResult(
      result
    );

  if (!check.ok) {

    return errorResponse(
      res,
      500,
      "AI 분석 결과가 올바르지 않습니다.",
      {
        reason:
          check.reason,

        result
      }
    );
  }

  // ----------------------------------------------------------
  // NORMALIZE
  // ----------------------------------------------------------

  result =
    normalizeResult(
      result
    );

  // ----------------------------------------------------------
  // SUCCESS
  // ----------------------------------------------------------

  return res.status(200).json({

    ok: true,

    model:
      MODEL,

    finishReason:

      finishReason,

    result:
      result
  });
}


// ============================================================
// VALIDATION
// ============================================================

function validateResult(
  data
) {

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return {
      ok: false,
      reason:
        "결과가 객체가 아닙니다."
    };
  }

  if (
    !data.attacker
  ) {
    return {
      ok: false,
      reason:
        "공격자 데이터가 없습니다."
    };
  }

  if (
    !data.defender
  ) {
    return {
      ok: false,
      reason:
        "방어자 데이터가 없습니다."
    };
  }

  if (
    typeof data.attacker
      .player !==
      "string"
  ) {
    return {
      ok: false,
      reason:
        "공격자 닉네임이 없습니다."
    };
  }

  if (
    typeof data.defender
      .player !==
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
      data.defender.deck
    )
  ) {
    return {
      ok: false,
      reason:
        "방어자 덱이 없습니다."
    };
  }

  if (
    data.attacker.deck.length !==
    3
  ) {
    return {
      ok: false,
      reason:
        "공격자 덱 장수가 3명이 아닙니다."
    };
  }

  if (
    data.defender.deck.length !==
    3
  ) {
    return {
      ok: false,
      reason:
        "방어자 덱 장수가 3명이 아닙니다."
    };
  }

  return {
    ok: true
  };
}


// ============================================================
// NUMBER
// ============================================================

function num(
  value
) {

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return -1;
  }

  return n;
}


// ============================================================
// UNIT
// ============================================================

function normalizeUnit(
  unit
) {

  return {

    name:
      typeof unit?.name ===
      "string"
        ? unit.name.trim()
        : "",

    level:
      num(
        unit?.level
      ),

    promotion:
      num(
        unit?.promotion
      ),

    cur:
      num(
        unit?.cur
      ),

    max:
      num(
        unit?.max
      )
  };
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

    deck:
      Array.isArray(
        side?.deck
      )
        ? side.deck
            .slice(0, 3)
            .map(
              normalizeUnit
            )
        : []
  };
}


// ============================================================
// RESULT
// ============================================================

function normalizeResult(
  data
) {

  return {

    result:
      typeof data?.result ===
      "string"
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


// ============================================================
// ERROR RESPONSE
// ============================================================

function errorResponse(
  res,
  status,
  message,
  extra = {}
) {

  return res
    .status(status)
    .json({

      ok: false,

      error:
        message,

      ...extra

    });
}
