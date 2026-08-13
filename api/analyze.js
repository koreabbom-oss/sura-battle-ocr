export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
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

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 없습니다."
      });
    }

    let mimeType = "image/jpeg";
    let base64 = image;

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

    /*
    ============================================================
    핵심:
    이미지의 전투 결과를 구조화해서 반환한다.
    특히 무장 카드의 승급 표시를 반드시 읽는다.
    ============================================================
    */

    const prompt = `
너는 삼국지 전략 게임 전투 스크린샷 전문 판독 AI다.

첨부된 이미지는 실제 게임 전투 결과 화면이다.

이미지에 실제로 보이는 정보만 사용해라.
절대로 정보를 추측하거나 만들어내지 마라.

가장 중요한 것은 양쪽의 무장 3명씩을 정확하게 판독하는 것이다.

각 무장 카드에서 다음 정보를 읽어라.

1. 무장 이름
2. 레벨
3. 승급 수치
4. 현재 병력
5. 최대 병력

==================================================
★★★ 승급 판독 규칙 ★★★
==================================================

각 무장 카드의 이름과 레벨 사이에 있는
빨간색/금색 승급 표시를 반드시 확인한다.

그 표시의 개수를 정확하게 세어라.

예를 들어 승급 표시가 1개라면:

"promotion": 1

2개라면:

"promotion": 2

3개라면:

"promotion": 3

처럼 숫자로 기록한다.

승급 표시가 명확하게 보이지 않는 경우에는
추측하지 말고 null을 사용한다.

승급 수치를 절대로 레벨 숫자와 혼동하지 마라.

==================================================
공격측
==================================================

화면 왼쪽에 있는 전투원을 공격측으로 판독한다.

공격측 플레이어 이름과 맹 이름도 읽어라.

==================================================
방어측
==================================================

화면 오른쪽에 있는 전투원을 방어측으로 판독한다.

방어측 플레이어 이름과 맹 이름도 읽어라.

==================================================
병력
==================================================

각 카드 아래쪽에 표시된

현재 병력 / 최대 병력

을 정확하게 읽어라.

예:

0 / 4,763

이면

"troops_current": 0,
"troops_max": 4763

이다.

==================================================
전투 결과
==================================================

화면 중앙의 결과를 읽는다.

승리 / 패배 / 확인 불가

==================================================
반드시 아래 JSON 형식으로만 반환
==================================================

{
  "battle_result": "승리",
  "attacker": {
    "player": "토리아빠",
    "clan": "수라",
    "deck": [
      {
        "name": "조조",
        "level": 50,
        "promotion": 1,
        "troops_current": 0,
        "troops_max": 4763
      },
      {
        "name": "곽가",
        "level": 50,
        "promotion": 1,
        "troops_current": 0,
        "troops_max": 5405
      },
      {
        "name": "순욱",
        "level": 50,
        "promotion": 1,
        "troops_current": 0,
        "troops_max": 4609
      }
    ]
  },
  "defender": {
    "player": "상대 닉네임",
    "clan": "상대 맹",
    "deck": [
      {
        "name": "제갈량",
        "level": 50,
        "promotion": 2,
        "troops_current": 9936,
        "troops_max": 10000
      },
      {
        "name": "대교",
        "level": 50,
        "promotion": 1,
        "troops_current": 8955,
        "troops_max": 10000
      },
      {
        "name": "황개",
        "level": 50,
        "promotion": 3,
        "troops_current": 7845,
        "troops_max": 10000
      }
    ]
  },
  "key_stats": "화면에서 확인되는 주요 전투 수치",
  "analysis": "전투 결과에 대한 간단한 설명",
  "confidence": "높음"
}

중요:

- 위 예시 숫자를 그대로 사용하지 마라.
- 반드시 현재 첨부된 이미지를 판독해서 작성한다.
- 승급은 이미지에 보이는 실제 표시 개수를 센다.
- 보이지 않는 값은 null.
- JSON 외의 설명을 붙이지 마라.
`;

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
          ],

          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const responseText =
      await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Gemini 응답을 JSON으로 읽을 수 없습니다.",
        detail: responseText.substring(0, 2000)
      });
    }

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

    let raw =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("")
        .trim();

    if (!raw) {
      return res.status(502).json({
        success: false,
        error: "Gemini가 분석 결과를 반환하지 않았습니다."
      });
    }

    /*
      혹시 Gemini가 ```json ... ``` 형태로 반환할 경우 제거
    */

    raw = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let structured;

    try {
      structured =
        JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Gemini 결과 JSON 파싱 실패",
        detail: raw.substring(0, 3000)
      });
    }

    /*
    ============================================================
    사람이 보는 기존 전투 보고서도 함께 생성
    ============================================================
    */

    const a =
      structured.attacker || {};

    const d =
      structured.defender || {};

    function deckText(side) {

      const deck =
        Array.isArray(side.deck)
          ? side.deck
          : [];

      if (!deck.length) {
        return "확인된 무장 없음";
      }

      return deck.map((hero, i) => {

        return [
          `${i + 1}.`,
          `이름: ${hero.name ?? "확인 불가"}`,
          `레벨: ${hero.level ?? "확인 불가"}`,
          `승급: ${
            hero.promotion == null
              ? "확인 불가"
              : hero.promotion
          }`,
          `병력: ${
            hero.troops_current == null
              ? "확인 불가"
              : hero.troops_current
          } / ${
            hero.troops_max == null
              ? "확인 불가"
              : hero.troops_max
          }`
        ].join("\n");

      }).join("\n\n");

    }


    const readable = `
[전투 결과]
${structured.battle_result || "확인 불가"}

[공격측]
플레이어: ${a.player || "확인 불가"}
맹: ${a.clan || "확인 불가"}

${deckText(a)}

[방어측]
플레이어: ${d.player || "확인 불가"}
맹: ${d.clan || "확인 불가"}

${deckText(d)}

[주요 전투 수치]
${structured.key_stats || "확인 불가"}

[전투 분석]
${structured.analysis || "확인 불가"}

[판독 신뢰도]
${structured.confidence || "확인 불가"}
`.trim();


    return res.status(200).json({

      success: true,

      text: readable,

      result: readable,

      structured,

      attacker:
        structured.attacker || null,

      defender:
        structured.defender || null,

      battle_result:
        structured.battle_result || null,

      model:
        "gemini-3.6-flash"

    });

  } catch (error) {

    console.error(
      "ANALYZE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "분석 서버 오류",
      detail:
        error?.message ||
        String(error)
    });

  }
}
