export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    // ----------------------------------------
    // 요청 데이터 처리
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

    const { image, mimeType } = body || {};

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "이미지가 전달되지 않았습니다."
      });
    }

    // ----------------------------------------
    // Gemini API KEY
    // ----------------------------------------

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 Vercel 환경변수에 없습니다."
      });
    }

    // ----------------------------------------
    // 이미지 데이터 정리
    // ----------------------------------------

    let base64 = image;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const imageMimeType = mimeType || "image/jpeg";

    // ----------------------------------------
    // 분석 프롬프트
    // ----------------------------------------

    const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을 분석하는 AI다.

첨부된 이미지는 게임의 전투 결과 화면이다.

화면 전체를 자세하게 확인하고 실제로 보이는 정보만 판독해라.

[1. 전투 결과]
- 승리
- 패배
- 확인 불가

[2. 공격측]
각 장수에 대해:
- 이름
- 레벨
- 병력 수치
- 화면에 표시된 주요 수치

[3. 방어측]
각 장수에 대해:
- 이름
- 레벨
- 병력 수치
- 화면에 표시된 주요 수치

[4. 주요 전투 수치]
화면 중앙 및 각 장수 아래에 표시된 숫자와 효과를 최대한 정확하게 읽어라.

[5. 전투 분석]
화면에서 확인되는 정보를 근거로 승리 또는 패배 원인을 간단히 설명해라.

[6. 판독 신뢰도]
높음 / 보통 / 낮음

중요:
- 이미지에 실제로 보이는 정보만 사용해라.
- 보이지 않는 숫자나 이름을 추측하지 마라.
- 읽기 어려운 내용은 "확인 불가"라고 표시해라.
- 숫자는 가능한 한 원본 그대로 적어라.
- 장수 이름은 화면에 표시된 한글을 최대한 정확하게 읽어라.

다음 형식으로 답변해라.

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
    // Gemini 모델
    // ----------------------------------------

    const model = "gemini-3.1-flash-lite";

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
                mime_type: imageMimeType,
                data: base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 2500
      }
    };

    // ----------------------------------------
    // Gemini 호출
    // 503 / 429 발생 시 자동 재시도
    // ----------------------------------------

    let response;
    let responseText = "";

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
      });

      responseText = await response.text();

      // 정상 응답
      if (response.ok) {
        break;
      }

      // 서버 과부하 / 요청 제한이면 잠시 기다렸다가 재시도
      if (response.status === 429 || response.status === 503) {
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * (attempt + 1))
          );
          continue;
        }
      }

      // 그 외 오류는 바로 종료
      break;
    }

    // ----------------------------------------
    // Gemini 응답 JSON 처리
    // ----------------------------------------

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(502).json({
        success: false,
        error: "Gemini가 올바른 JSON 응답을 반환하지 않았습니다.",
        detail: responseText.substring(0, 500)
      });
    }

    // ----------------------------------------
    // Gemini API 오류
    // ----------------------------------------

    if (!response.ok) {
      const geminiMessage =
        data?.error?.message ||
        "Gemini API에서 알 수 없는 오류가 발생했습니다.";

      return res.status(response.status).json({
        success: false,
        error: "Gemini API 오류",
        detail: geminiMessage,
        code: data?.error?.code || response.status,
        status: data?.error?.status || "UNKNOWN",
        model: model
      });
    }

    // ----------------------------------------
    // 결과 확인
    // ----------------------------------------

    const candidates = data?.candidates;

    if (!candidates || candidates.length === 0) {
      return res.status(502).json({
        success: false,
        error: "Gemini가 분석 결과를 반환하지 않았습니다.",
        detail: JSON.stringify(data).substring(0, 1000)
      });
    }

    const parts = candidates[0]?.content?.parts || [];

    const result = parts
      .map((part) => part?.text || "")
      .join("")
      .trim();

    if (!
