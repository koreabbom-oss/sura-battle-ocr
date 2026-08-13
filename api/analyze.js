export default async function handler(req, res) {
  // ----------------------------------------
  // POST만 허용
  // ----------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    // ----------------------------------------
    // 요청 데이터
    // ----------------------------------------
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: "요청 데이터가 올바른 JSON이 아닙니다."
        });
      }
    }

    const image = body?.image;
    const mimeType = body?.mimeType || "image/jpeg";

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "이미지가 전달되지 않았습니다."
      });
    }

    // ----------------------------------------
    // API KEY
    // ----------------------------------------
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 설정되지 않았습니다."
      });
    }

    // ----------------------------------------
    // Base64 이미지 정리
    // ----------------------------------------
    let base64 = image;

    if (typeof base64 !== "string") {
      return res.status(400).json({
        success: false,
        error: "이미지 데이터 형식이 올바르지 않습니다."
      });
    }

    // data:image/jpeg;base64,XXXX 형태 제거
    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    // ----------------------------------------
    // Gemini 모델
    // ----------------------------------------
    const model = "gemini-3.6-flash";

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // ----------------------------------------
    // 분석 프롬프트
    // ----------------------------------------
    const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을 분석하는 AI다.

첨부된 이미지를 화면 전체 기준으로 자세하게 분석해라.

반드시 이미지에서 실제로 확인되는 정보만 사용해라.
추측해서 이름이나 숫자를 만들어내지 마라.

특히 작은 글씨와 숫자를 최대한 정확하게 판독해라.

다음 내용을 분석한다.

[1. 전투 결과]
승리 / 패배 / 확인 불가

[2. 공격측]
왼쪽에 표시된 3명의 장수를 분석한다.

각 장수:
이름:
레벨:
병력:

[3. 방어측]
오른쪽에 표시된 3명의 장수를 분석한다.

각 장수:
이름:
레벨:
병력:

[4. 주요 전투 수치]
화면 중앙의 전투 결과와
각 장수 아래에 표시된 숫자 및 효과를 최대한 정확하게 읽는다.

[5. 전투 분석]
실제 화면에 표시된 정보를 이용해서
왜 승리 또는 패배했는지 간단히 설명한다.

[6. 판독 신뢰도]
높음 / 보통 / 낮음

중요한 규칙:

1. 보이지 않는 정보는 추측하지 않는다.
2. 읽을 수 없는 숫자는 "확인 불가"라고 적는다.
3. 장수 이름은 화면에 보이는 한글을 최대한 정확하게 읽는다.
4. 숫자는 원본에 표시된 형태를 최대한 유지한다.
5. 화면 전체를 확인한 후 답변한다.

반드시 아래 형식으로 답변한다.

[전투 결과]
결과:

[공격측]
1.
이름:
레벨:
병력:

2.
이름:
레벨:
병력:

3.
이름:
레벨:
병력:

[방어측]
1.
이름:
레벨:
병력:

2.
이름:
레벨:
병력:

3.
이름:
레벨:
병력:

[주요 전투 수치]
-

[전투 분석]
-

[판독 신뢰도]
-
`;

    // ----------------------------------------
    // Gemini 요청
    // ----------------------------------------
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
                data: base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 3000
      }
    };

    // ----------------------------------------
    // Gemini 호출
    // ----------------------------------------
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(requestBody)
    });

    // 응답을 먼저 TEXT로 받는다.
    // 그래야 Gemini 오류가 JSON이 아니어도 확인 가능하다.
    const responseText = await response.text();

    // ----------------------------------------
    // Gemini 응답 JSON 변환
    // ----------------------------------------
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(502).json({
        success: false,
        error: "Gemini 응답이 JSON 형식이 아닙니다.",
        httpStatus: response.status,
        detail: response
