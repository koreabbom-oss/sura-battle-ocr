export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    // ==============================
    // 1. 요청 데이터
    // ==============================

    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
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

    // ==============================
    // 2. API KEY
    // ==============================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 Vercel에 설정되어 있지 않습니다."
      });
    }

    // ==============================
    // 3. 이미지 정리
    // ==============================

    let base64 = image;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const imageMimeType = mimeType || "image/jpeg";

    // ==============================
    // 4. 분석 프롬프트
    // ==============================

    const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을 분석하는 AI다.

첨부된 이미지를 화면 전체 기준으로 분석한다.

반드시 이미지에 실제로 보이는 정보만 사용한다.
추측하지 않는다.

다음 정보를 최대한 정확하게 판독한다.

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
이미지 중앙 및 각 장수 아래에 표시된 숫자와 효과를 기록한다.

[전투 분석]
화면에서 확인되는 정보를 바탕으로 승패 원인을 간단히 분석한다.

[판독 신뢰도]
높음 / 보통 / 낮음

규칙:
- 보이지 않는 정보는 추측하지 않는다.
- 읽기 어려운 정보는 "확인 불가"라고 표시한다.
- 숫자는 가능한 한 원본 그대로 적는다.
- 장수 이름은 화면에 표시된 한글을 최대한 정확하게 읽는다.

다음 형식을 유지한다.

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

    // ==============================
    // 5. 모델 목록
    // ==============================

    // 첫 번째 모델이 실패하면 다음 모델로 자동 시도
    const models = [
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash"
    ];

    let lastError = null;

    // ==============================
    // 6. Gemini 호출
    // ==============================

    for (const model of models) {

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
          maxOutputTokens: 4000
        }
      };

      // 같은 모델에서 최대 2번 시도
      for (let attempt = 0; attempt < 2; attempt++) {

        try {

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify(requestBody)
          });

          const responseText = await response.text();

          let data;

          try {
            data = JSON.parse(responseText);
          } catch {
            lastError = {
              code: response.status,
              status: "INVALID_JSON",
              message: responseText.substring(0, 500)
            };

            break;
          }

          // ------------------------------
          // 정상 응답
          // ------------------------------

          if (response.ok) {

            const candidates = data?.candidates || [];

            if (!candidates.length) {
              lastError = {
                code: 502,
                status: "EMPTY_RESPONSE",
                message: "Gemini가 분석 결과를 반환하지 않았습니다."
              };

              break;
            }

            const parts =
              candidates[0]?.content?.parts || [];

            const result = parts
              .map(part => part?.text || "")
              .join("")
              .trim();

            if (!result) {
              lastError = {
                code: 502,
                status: "EMPTY_RESULT",
                message: "Gemini 분석 결과가 비어 있습니다."
              };

              break;
            }

            // ==============================
            // 정상 반환
            // ==============================

            return res.status(200).json({
              success: true,

              // 기존 코드와 호환
              result: result,

              // index.html이 사용하는 값
              text: result,

              model: model
            });
          }

          // ------------------------------
          // API 오류
          // ------------------------------

          const message =
            data?.error?.message ||
            "Gemini API 오류";

          lastError = {
            code: data?.error?.code || response.status,
            status: data?.error?.status || "UNKNOWN",
            message: message
          };

          // 429 / 503이면 잠시 후 재시도
          if (
            response.status === 429 ||
            response.status === 503
          ) {

            if (attempt === 0) {
              await new Promise(resolve =>
                setTimeout(resolve, 2000)
              );

              continue;
            }
          }

          // 404 등은 다음 모델로 넘어감
          break;

        } catch (error) {

          lastError = {
            code: 500,
            status: "FETCH_ERROR",
            message: error?.message || String(error)
          };

          if (attempt === 0) {
            await new Promise(resolve =>
              setTimeout(resolve, 1500)
            );

            continue;
          }

          break;
        }
      }
    }

    // ==============================
    // 모든 모델 실패
    // ==============================

    return res.status(lastError?.code || 502).json({
      success: false,
      error: "Gemini API 오류",
      code: lastError?.code || 502,
      status: lastError?.status || "UNKNOWN",
      detail:
        lastError?.message ||
        "모든 Gemini 모델 호출에 실패했습니다."
    });

  } catch (error) {

    console.error("ANALYZE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "분석 서버에서 오류가 발생했습니다.",
      detail: error?.message || String(error)
    });
  }
}
