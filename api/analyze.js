export default async function handler(req, res) {

  // =========================================================
  // 1. METHOD
  // =========================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }


  // =========================================================
  // 2. API KEY
  // =========================================================

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "Gemini API 키가 없습니다.",
      detail:
        "Vercel Environment Variables에서 GEMINI_API_KEY를 확인해주세요."
    });
  }


  try {

    // =======================================================
    // 3. REQUEST
    // =======================================================

    const body = req.body || {};

    const image = body.image;

    const mimeType =
      body.mimeType || "image/jpeg";


    if (!image) {
      return res.status(400).json({
        error: "이미지가 전달되지 않았습니다."
      });
    }


    // =======================================================
    // 4. BASE64 추출
    // =======================================================

    let base64 = image;

    if (
      typeof image === "string" &&
      image.includes(",")
    ) {
      base64 =
        image.split(",")[1];
    }


    if (!base64) {
      return res.status(400).json({
        error: "이미지 데이터가 비어 있습니다."
      });
    }


    // =======================================================
    // 5. MODEL
    // =======================================================

    const MODEL =
      "gemini-3.6-flash";


    const URL =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


    // =======================================================
    // 6. PROMPT
    // =======================================================

    const prompt = `
이 이미지는 삼국지 스타일 모바일 게임의 전투 결과 화면이다.

이미지 전체를 분석해서 다음 정보를 추출한다.

가장 중요한 정보:

1. 공격측 플레이어 닉네임
2. 공격측 맹 이름
3. 공격측 장수
4. 공격측 각 장수의 레벨
5. 공격측 각 장수의 승급 숫자
6. 공격측 각 장수의 병력
7. 방어측 플레이어 닉네임
8. 방어측 맹 이름
9. 방어측 장수
10. 방어측 각 장수의 레벨
11. 방어측 각 장수의 승급 숫자
12. 방어측 각 장수의 병력
13. 전투 결과

특히 장수 카드에 표시된 빨간색 숫자는 승급 숫자다.

레벨과 승급 숫자를 절대로 혼동하지 않는다.

화면에서 읽을 수 없는 정보는 null로 한다.

추측하지 않는다.

공격측은 화면 왼쪽,
방어측은 화면 오른쪽이다.

장수는 화면에 보이는 순서를 유지한다.

설명문을 만들지 않는다.
이미지 분석 과정을 출력하지 않는다.
요약문을 만들지 않는다.

요청된 데이터만 반환한다.
`;


    // =======================================================
    // 7. STRUCTURED OUTPUT SCHEMA
    // =======================================================
    //
    // ★ 핵심
    //
    // 이번에는 프롬프트로 JSON을 요구하는 것이 아니라
    // Gemini API 자체에 JSON 구조를 강제한다.
    //
    // =======================================================

    const responseSchema = {

      type: "object",

      properties: {

        battle_result: {
          type: "string",
          enum: [
            "승리",
            "패배",
            "확인 불가"
          ]
        },


        attacker: {

          type: "object",

          properties: {

            player: {
              type: ["string", "null"]
            },

            clan: {
              type: ["string", "null"]
            },

            deck: {

              type: "array",

              items: {

                type: "object",

                properties: {

                  name: {
                    type: ["string", "null"]
                  },

                  level: {
                    type: ["integer", "null"]
                  },

                  promotion: {
                    type: ["integer", "null"]
                  },

                  troops_current: {
                    type: ["integer", "null"]
                  },

                  troops_max: {
                    type: ["integer", "null"]
                  }

                },

                required: [
                  "name",
                  "level",
                  "promotion",
                  "troops_current",
                  "troops_max"
                ]

              }

            }

          },

          required: [
            "player",
            "clan",
            "deck"
          ]

        },


        defender: {

          type: "object",

          properties: {

            player: {
              type: ["string", "null"]
            },

            clan: {
              type: ["string", "null"]
            },

            deck: {

              type: "array",

              items: {

                type: "object",

                properties: {

                  name: {
                    type: ["string", "null"]
                  },

                  level: {
                    type: ["integer", "null"]
                  },

                  promotion: {
                    type: ["integer", "null"]
                  },

                  troops_current: {
                    type: ["integer", "null"]
                  },

                  troops_max: {
                    type: ["integer", "null"]
                  }

                },

                required: [
                  "name",
                  "level",
                  "promotion",
                  "troops_current",
                  "troops_max"
                ]

              }

            }

          },

          required: [
            "player",
            "clan",
            "deck"
          ]

        },


        key_stats: {

          type: "object",

          properties: {

            attacker_power: {
              type: ["integer", "null"]
            },

            defender_power: {
              type: ["integer", "null"]
            }

          },

          required: [
            "attacker_power",
            "defender_power"
          ]

        }

      },

      required: [
        "battle_result",
        "attacker",
        "defender",
        "key_stats"
      ]

    };


    // =======================================================
    // 8. GEMINI REQUEST
    // =======================================================

    const response =
      await fetch(
        URL,
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            contents: [

              {

                role: "user",

                parts: [

                  {
                    text: prompt
                  },

                  {
                    inline_data: {

                      mime_type:
                        mimeType,

                      data:
                        base64

                    }

                  }

                ]

              }

            ],


            generationConfig: {

              maxOutputTokens: 1200,

              responseMimeType:
                "application/json",

              responseSchema:
                responseSchema,

              thinkingConfig: {

                thinkingLevel:
                  "low"

              }

            }

          })

        }
      );


    // =======================================================
    // 9. RAW RESPONSE
    // =======================================================

    const raw =
      await response.text();


    console.log(
      "GEMINI STATUS:",
      response.status
    );


    console.log(
      "GEMINI RESPONSE:",
      raw
    );


    // =======================================================
    // 10. GEMINI ERROR
    // =======================================================

    if (!response.ok) {

      let errorData;

      try {

        errorData =
          JSON.parse(raw);

      } catch {

        errorData = {
          raw: raw
        };

      }


      const message =
        errorData?.error?.message ||
        "Gemini API 요청 실패";


      return res.status(
        response.status
      ).json({

        error:
          "Gemini API 요청 실패",

        httpStatus:
          response.status,

        model:
          MODEL,

        detail:
          message,

        raw:
          raw.substring(
            0,
            5000
          )

      });

    }


    // =======================================================
    // 11. RESPONSE JSON PARSE
    // =======================================================

    let geminiData;


    try {

      geminiData =
        JSON.parse(raw);

    } catch {

      return res.status(500).json({

        error:
          "Gemini 서버 응답을 읽을 수 없습니다.",

        raw:
          raw.substring(
            0,
            5000
          )

      });

    }


    // =======================================================
    // 12. GEMINI TEXT
    // =======================================================

    const text =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ""
        )
        .join("")
        .trim();


    if (!text) {

      return res.status(500).json({

        error:
          "Gemini가 분석 결과를 반환하지 않았습니다.",

        raw:
          JSON.stringify(
            geminiData
          ).substring(
            0,
            5000
          )

      });

    }


    // =======================================================
    // 13. JSON PARSE
    // =======================================================

    let structured;


    try {

      structured =
        JSON.parse(text);

    } catch {

      return res.status(500).json({

        error:
          "Gemini가 올바른 JSON을 반환하지 않았습니다.",

        detail:
          text.substring(
            0,
            5000
          )

      });

    }


    // =======================================================
    // 14. NORMALIZE
    // =======================================================

    structured =
      normalizeResult(
        structured
      );


    // =======================================================
    // 15. 짧은 결과 생성
    // =======================================================

    const result =
      makeShortResult(
        structured
      );


    // =======================================================
    // 16. SUCCESS
    // =======================================================

    return res.status(200).json({

      result:
        result,

      structured:
        structured

    });


  } catch (error) {

    console.error(
      "SERVER ERROR:",
      error
    );


    return res.status(500).json({

      error:
        "분석 서버 오류",

      detail:
        error?.message ||
        String(error)

    });

  }

}


/* ===========================================================
   NORMALIZE
=========================================================== */

function normalizeResult(data) {

  return {

    battle_result:
      normalizeBattleResult(
        data?.battle_result
      ),

    attacker:
      normalizeSide(
        data?.attacker
      ),

    defender:
      normalizeSide(
        data?.defender
      ),

    key_stats: {

      attacker_power:
        numberOrNull(
          data?.key_stats
            ?.attacker_power
        ),

      defender_power:
        numberOrNull(
          data?.key_stats
            ?.defender_power
        )

    }

  };

}


/* ===========================================================
   SIDE
=========================================================== */

function normalizeSide(side) {

  if (!side) {
    return null;
  }


  const deck =
    Array.isArray(side.deck)
      ? side.deck
      : [];


  return {

    player:
      cleanString(
        side.player
      ),

    clan:
      cleanString(
        side.clan
      ),

    deck:

      deck
        .slice(0, 5)
        .map(
          hero => ({

            name:
              cleanString(
                hero?.name
              ),

            level:
              numberOrNull(
                hero?.level
              ),

            promotion:
              numberOrNull(
                hero?.promotion
              ),

            troops_current:
              numberOrNull(
                hero?.troops_current
              ),

            troops_max:
              numberOrNull(
                hero?.troops_max
              )

          })
        )

  };

}


/* ===========================================================
   STRING
=========================================================== */

function cleanString(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }


  return String(
    value
  ).trim();

}


/* ===========================================================
   NUMBER
=========================================================== */

function numberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }


  if (
    typeof value === "number"
  ) {

    return Number.isFinite(value)
      ? Math.round(value)
      : null;

  }


  const cleaned =
    String(value)
      .replace(
        /,/g,
        ""
      )
      .replace(
        /[^0-9.-]/g,
        ""
      );


  if (!cleaned) {
    return null;
  }


  const n =
    Number(cleaned);


  return Number.isFinite(n)
    ? Math.round(n)
    : null;

}


/* ===========================================================
   BATTLE RESULT
=========================================================== */

function normalizeBattleResult(
  value
) {

  const text =
    String(
      value || ""
    );


  if (
    text.includes("승")
  ) {
    return "승리";
  }


  if (
    text.includes("패")
  ) {
    return "패배";
  }


  return "확인 불가";

}


/* ===========================================================
   SHORT RESULT
=========================================================== */

function makeShortResult(
  data
) {

  const lines = [];


  lines.push(
    `전투 결과: ${data.battle_result}`
  );


  if (data.attacker) {

    lines.push(
      `공격: ${
        data.attacker.player ||
        "확인 불가"
      }` +
      (
        data.attacker.clan
          ? ` / ${data.attacker.clan}`
          : ""
      )
    );


    if (
      data.attacker.deck.length
    ) {

      lines.push(
        "공격 덱: " +

        data.attacker.deck
          .map(
            hero =>
              `${hero.name || "?"} ` +
              `Lv.${hero.level ?? "?"} ` +
              `승급 ${hero.promotion ?? "?"}`
          )
          .join(" · ")
      );

    }

  }


  if (data.defender) {

    lines.push(
      `방어: ${
        data.defender.player ||
        "확인 불가"
      }` +
      (
        data.defender.clan
          ? ` / ${data.defender.clan}`
          : ""
      )
    );


    if (
      data.defender.deck.length
    ) {

      lines.push(
        "방어 덱: " +

        data.defender.deck
          .map(
            hero =>
              `${hero.name || "?"} ` +
              `Lv.${hero.level ?? "?"} ` +
              `승급 ${hero.promotion ?? "?"}`
          )
          .join(" · ")
      );

    }

  }


  return lines.join("\n");

}
