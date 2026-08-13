export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    const { image, mimeType } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "이미지가 전달되지 않았습니다."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY가 Vercel 환경변수에 설정되지 않았습니다."
      });
    }

    // data:image/jpeg;base64,... 형태로 들어와도 처리
    let base64 = image;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const type = mimeType || "image/jpeg";

    const prompt = `
너는 삼국지 전략 게임의 전투 결과 화면을 분석하는 AI다.

첨부된 스크린샷 전체를 자세히 분석해라.

화면에서 확인할 수 있는 정보를 최대한 정확하게 읽어서 다음 항목을 중심으로 분석해라.

1. 공격측과 방어측 구분
2. 각 진영의 장수 이름
3. 각 장수의 레벨
4. 병력 수치
5. 전투 결과
6. 전투에서 발생한 주요 수치
7. 승패에 영향을 준 것으로 보이는 요소
8. 화면에서 읽을 수 있는 기타 중요한 정보

숫자와 한자는 가능한 한 원본 화면 그대로 읽어라.

확실하게 읽을 수 없는 내용은 추측하지 말고
"확인 불가"라고 표시해라.

다음 형식으로 한국어로 답변해라.

[전투 결과]
승리/패배/확인 불가

[공격측]
장수:
- 이름 / 레벨 / 병력

[방어측]
장수:
- 이름 / 레벨 / 병력

[주요 전투 수치]
- 항목:
- 수치:

[전투 분석]
화면에서 확인되는 내용을 바탕으로 간단하고 정확하게 설명

[판독 신뢰도]
높음 / 보통 / 낮음

절대로 화면에 없는 정보를 만들어내지 마라.
`;

    // Gemini API 호출 함수
    async function callGemini(model) {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const body = {
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: type,
                  data: base64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          status: response.status,
          error: `Gemini가 JSON이 아닌 응답을 반환했습니다: ${text.slice(0, 300)}`
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data?.error?.message || "Gemini API 오류"
        };
      }

      const result =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

      if (!result) {
        return {
          ok: false,
          status: 500,
          error: "Gemini가 분석 결과를 반환하지 않았습니다."
        };
      }

      return {
        ok: true,
        result,
        model
      };
    }

    // ---------------------------------------
    // 1차: gemini-3.6-flash
    // ---------------------------------------
    let result = await callGemini("gemini-3.6-flash");

    if (result.ok) {
      return res.status(200).json({
        success: true,
        result: result.result,
        model: result.model
      });
    }

    // ---------------------------------------
    // 503 / 429 / 404 등 일시적인 오류라면
    // 잠깐 기다렸다가 한 번 더 시도
    // ---------------------------------------
    if ([429, 500, 502, 503, 504].includes(result.status)) {
      await new Promise(resolve => setTimeout(resolve, 1500));

      result = await callGemini("gemini-3.6-flash");

      if (result.ok) {
        return res.status(200).json({
          success: true,
          result: result.result,
          model: result.model,
          retry: true
        });
      }
    }

    // ---------------------------------------
    // 2차: 다른 Flash 모델로 자동 전환
    //
