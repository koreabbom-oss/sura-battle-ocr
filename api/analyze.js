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

    // data:image/jpeg;base64,XXXX 형태라면 앞부분 제거
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
                  text: `이 이미지는 삼국지 전투 화면의 스크린샷이다.

이미지 전체를 자세히 분석해서 화면에 보이는 정보를 최대한 정확하게 읽어줘.

특히 다음 정보를 찾아줘:
- 병력 수
- 장수
