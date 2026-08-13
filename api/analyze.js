export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 사용할 수 있습니다."
    });
  }

  try {
    const { image, mimeType } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "이미지가 없습니다."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY가 설정되지 않았습니다."
      });
    }

    // data:image/jpeg;base64,XXXX 형태라면
    // 실제 base64 부분만 추출
    let base64 = image;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const model = "gemini-3.5-flash";

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    const prompt = `
너는 삼국지 전략 게임의 전투 화면을 분석하는 전문 AI다.

첨부된 스크린샷 전체를 자세히 분석해라.

다음 정보를 가능한 한 정확하게 찾아서 한국어로 정리해라.

1. 아군과 적군 구분
2. 아군 장수 이름
3. 적군 장수 이름
4. 각 장수의 병력 수
5. 각 장수의 전투력
6. 공격력
7. 방어력
8. 화면에 표시된 주요 숫자
9. 전투 결과
10. 전투에서 중요한 특이사항

특히 작은 글씨와 숫자를 최대한 자세히 읽어라.

이미지에서 실제로 확인할 수 없는 정보는 절대로 추측하지 말고
"확인 불가"라고 표시해라.

결과는 다음 형식으로 작성해라.

[전투 결과]
- 승패:
- 전투력:
- 주요 결과:

[아군]
- 장수:
- 병력:
- 전투력:
- 주요 수치:

[적군]
- 장수:
- 병력:
- 전투력:
- 주요 수치:

[종합 분석]
전투 화면에서 확인되는 중요한 내용을 설명해라.
`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || "image/jpeg",
                  data: base64
                }
              },
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const raw = await response.text();

    // Gemini API 자체에서 오류가 발생한 경우
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API 오류: " + raw
      });
    }

    let result;

    try {
      result = JSON.parse(raw);
    } catch (parseError) {
      return res.status(500).json({
        error: "Gemini 응답을 JSON으로 변환할 수 없습니다."
      });
    }

    const text =
      result &&
      result.candidates &&
      result.candidates[0] &&
      result.candidates[0].content &&
      result.candidates[0].content.parts
        ? result.candidates[0].content.parts
            .map(function (part) {
              return part.text || "";
            })
            .join("\n")
            .trim()
        : "";

    if (!text) {
      return res.status(500).json({
        error: "Gemini에서 판독 결과를 받지 못했습니다.",
        raw: result
      });
    }

    return res.status(200).json({
      text: text
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "서버 오류: " + (error.message || "알 수 없는 오류")
    });
  }
}
