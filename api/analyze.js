export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { image, mimeType } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: "이미지가 없습니다." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY가 설정되지 않았습니다."
      });
    }

    let base64 = image;

    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
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
                  text: `
이 이미지는 삼국지 게임의 전투 화면 스크린샷이다.

이미지 전체를 자세히 분석해서 화면에 보이는 정보를 최대한 정확하게 읽어줘.

특히 다음 정보를 찾아줘.

- 병력 수
- 장수 이름
- 장수별 병력
- 공격력 또는 전투력
- 방어력
- 승패 여부
- 적군과 아군의 구분
- 화면에 표시된 주요 숫자
- 기타 전투에 도움이 되는 정보

작은 글씨도 가능한 한 확대해서 확인하고,
읽을 수 없는 내용은 추측하지 말고 "확인 불가"라고 표시해줘.

결과는 한국어로 정리해줘.
`
                }
              ]
            }
          ]
        })
      }
    );

    const resultText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API 오류: " + resultText
      });
    }

    let result;

    try {
      result = JSON.parse(resultText);
    } catch (e) {
      return res.status(500).json({
        error: "Gemini 응답을 JSON으로 읽을 수 없습니다."
      });
    }

    const text =
      result?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n")
        .trim() || "판독 결과가 없습니다.";

    return res.status(200).json({ text });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "서버 오류: " + (error.message || "알 수 없는 오류")
    });
  }
}          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: base64
                  }
                },
                {
                  text: `이 이미지는 삼국지 전투 화면의 스크린샷이다.

이미지 전체를 자세히 분석해서 화면에 보이는 정보를 최대한 정확하게 읽어줘.

특히 다음 정보를 찾아줘:
- 병력 수
- 장수
