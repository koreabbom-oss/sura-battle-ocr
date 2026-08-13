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
                  text: "이 이미지는 삼국지 게임 전투 화면이다. 이미지 전체를 자세히 분석해서 장수 이름, 병력 수, 전투력, 공격력, 방어력, 아군과 적군의 구분 및 화면에 표시된 주요 숫자를 한국어로 정리해줘. 읽을 수 없는 정보는 추측하지 말고 확인 불가라고 표시해줘."
                }
              ]
            }
          ]
        })
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API 오류: " + raw
      });
    }

    const result = JSON.parse(raw);

    const text =
      result?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("\n")
        .trim() || "판독 결과가 없습니다.";

    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({
      error: "서버 오류: " + error.message
    });
  }
}
