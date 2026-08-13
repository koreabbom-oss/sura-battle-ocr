export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    // =========================
    // 요청 받기
    // =========================

    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const image = body?.image;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "이미지가 전달되지 않았습니다."
      });
    }

    // =========================
    // API KEY
    // =========================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 없습니다."
      });
    }

    // =========================
    // 이미지 처리
    // =========================

    let mimeType = "image/jpeg";
    let base64 = image;

    // data:image/png;base64,xxxxx
    // 형태라면 MIME 타입과 base64 분리
    if (image.startsWith("data:")) {
      const match = image.match(
        /^data:(image\/[^;]+);base64,(.+)$/
      );

      if (!match) {
        return res.status(400).json({
          success: false,
          error: "이미지 데이터 형식이 올바르지 않습니다."
        });
      }

      mimeType = match[1];
      base64 = match[2];
    }

    // =========================
    // 분석 지시
    // =========================

    const prompt = `
첨부된 이미지는 삼국지 전략 게임의 전투 결과 스크린샷이다.

이미지 전체를 자세하게 읽어라.

화면에 실제로 보이는 정보만 사용하고
보이지 않는 정보는 절대로 추측하지 마라.

다음 정보를 추출한다.

[전투 결과]
승리 / 패배 / 확인 불가

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
화면 중앙 및 각 장수 주변에 표시된
숫자와 효과를 최대한 정확하게 기록한다.

[전투 분석]
화면에서 확인되는 정보를 근거로
승패 원인을 간단하게 설명한다.

[판독 신뢰도]
높음 / 보통 / 낮음

중요:
- 작은 글씨와 숫자를 최대한 정확하게 읽어라.
- 읽을 수 없는 내용은 "확인 불가"라고 적어라.
- 이름과 숫자를 임의로 만들지 마라.
- 반드시 이미지에 보이는 내용만 사용해라.
`;

    // =========================
    // Gemini API 요청
    // =========================

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents: [
            {
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
          ]
        })
      }
    );

    // =========================
    // Gemini 응답
    // =========================

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Gemini가 JSON이 아닌 응답을 보냈습니다.",
        detail: responseText.substring(0, 1000)
      });
    }

    // =========================
    // Gemini 오류
    // =========================

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "Gemini API 오류",
        detail:
          data?.error?.message ||
          "알 수 없는 Gemini 오류",
        code:
          data?.error?.code ||
          response.status,
        status:
          data?.error?.status ||
          "UNKNOWN",
        model: "gemini-3.6-flash"
      });
    }

    // =========================
    // 결과 추출
    // =========================

    const result =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("")
        .trim();

    if (!result) {
      return res.status(502).json({
        success: false,
        error: "Gemini가 분석 결과를 반환하지 않았습니다.",
        detail: JSON.stringify(data).substring(0, 2000)
      });
    }

    // =========================
    // 성공
    // =========================

    return res.status(200).json({
      success: true,

      // 기존 index.html 호환
      text: result,
      result: result,

      model: "gemini-3.6-flash"
    });

  } catch (error) {

    console.error("ANALYZE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "분석 서버 오류",
      detail: error?.message || String(error)
    });
  }
}
