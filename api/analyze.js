export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "Gemini API 키가 설정되지 않았습니다."
    });
  }

  try {
    const body = req.body || {};
    const image = body.image;
    const mimeType = body.mimeType || "image/jpeg";

    if (!image) {
      return res.status(400).json({
        error: "이미지가 전달되지 않았습니다."
      });
    }

    let base64 = image;

    if (
      typeof image === "string" &&
      image.includes(",")
    ) {
      base64 = image.split(",")[1];
    }

    const MODEL = "gemini-3.6-flash";

    const URL =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const prompt = `
이 이미지는 삼국지 스타일 모바일 게임의 전투 결과 화면이다.

이미지 전체를 자세히 확인해서 전투 데이터를 추출해라.

반드시 JSON 형식으로만 반환한다.

중요한 정보:

- 전투 결과
- 공격자 닉네임
- 공격자 맹 이름
- 공격자 장수 3명
- 공격자 장수 레벨
- 공격자 장수 승급 숫자
- 공격자 장수 병력
- 방어자 닉네임
- 방어자 맹 이름
- 방어자 장수 3명
- 방어자 장수 레벨
- 방어자 장수 승급 숫자
- 방어자 장수 병력

특히 장수 카드에 표시된 빨간색 숫자는 승급 숫자다.
이 숫자는 매우 중요하므로 반드시 확인한다.

레벨과 승급 숫자를 혼동하지 않는다.

화면 왼쪽 = 공격측
화면 오른쪽 = 방어측

읽을 수 없는 문자열은 빈 문자열 ""로 한다.
읽을 수 없는 숫자는 0으로 한다.

추측하지 않는다.

설명하지 않는다.
분석 과정을 작성하지 않는다.
JSON 외의 문장을 작성하지 않는다.
`;

    /*
     * responseSchema에서는 nullable type을 사용하지 않는다.
     * 모든 값은 반드시 하나의 타입만 사용한다.
     */

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
              type: "string"
            },

            clan: {
              type: "string"
            },

            deck: {
              type: "array",

              items: {
                type: "object",

                properties: {

                  name: {
                    type: "string"
                  },

                  level: {
                    type: "integer"
                  },

                  promotion: {
                    type: "integer"
                  },

                  troops_current: {
                    type: "integer"
                  },

                  troops_max: {
                    type: "integer"
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
              type: "string"
            },

            clan: {
              type: "string"
            },

            deck: {
              type: "array",

              items: {
                type: "object",

                properties: {

                  name: {
                    type: "string"
                  },

                  level: {
                    type: "integer"
                  },

                  promotion: {
                    type: "integer"
                  },

                  troops_current: {
                    type: "integer"
                  },

                  troops_max: {
                    type: "integer"
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
              type: "integer"
            },

            defender_power: {
              type: "integer"
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

    const response = await fetch(
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
                    mime_type: mimeType,
                    data: base64
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
              responseSchema
          }

        })
      }
    );

    const raw = await response.text();

    console.log(
      "GEMINI STATUS:",
      response.status
    );

    console.log(
      "GEMINI RESPONSE:",
      raw
    );

    if (!response.ok) {
      let errorData;

      try {
        errorData = JSON.parse(raw);
      } catch {
        errorData = {
          raw
        };
      }

      return res.status(response.status).json({
        error: "Gemini API 요청 실패",

        httpStatus:
          response.status,

        model:
          MODEL,

        detail:
          errorData?.error?.message ||
          "알 수 없는 Gemini 오류",

        raw:
          raw.substring(0, 5000)
      });
    }

    let geminiData;

    try {
      geminiData =
        JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error:
          "Gemini 서버 응답을 읽을 수 없습니다.",

        raw:
          raw.substring(0, 5000)
      });
    }

    const text =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part => part.text || ""
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
          ).substring(0, 5000)
      });
    }

    let structured;

    try {
      structured =
        JSON.parse(text);
    } catch {

      const first =
        text.indexOf("{");

      const last =
        text.lastIndexOf("}");

      if (
        first !== -1 &&
        last !== -1
      ) {
        try {
          structured =
            JSON.parse(
              text.substring(
                first,
                last + 1
              )
            );
        } catch {
          structured = null;
        }
      }
    }

    if (!structured) {
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

    structured =
      normalizeResult(
        structured
      );

    const result =
      makeShortResult(
        structured
      );

    return res.status(200).json({
      result,
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


/* =========================================================
   NORMALIZE
========================================================= */

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
        numberOrZero(
          data?.key_stats
            ?.attacker_power
        ),

      defender_power:
        numberOrZero(
          data?.key_stats
            ?.defender_power
        )
    }
  };
}


/* =========================================================
   SIDE
========================================================= */

function normalizeSide(side) {

  if (!side) {
    return {
      player: "",
      clan: "",
      deck: []
    };
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
              numberOrZero(
                hero?.level
              ),

            promotion:
              numberOrZero(
                hero?.promotion
              ),

            troops_current:
              numberOrZero(
                hero?.troops_current
              ),

            troops_max:
              numberOrZero(
                hero?.troops_max
              )
          })
        )
  };
}


/* =========================================================
   STRING
========================================================= */

function cleanString(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(
    value
  ).trim();
}


/* =========================================================
   NUMBER
========================================================= */

function numberOrZero(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? Math.round(value)
      : 0;
  }

  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(
        /[^0-9.-]/g,
        ""
      );

  if (!cleaned) {
    return 0;
  }

  const number =
    Number(cleaned);

  return Number.isFinite(number)
    ? Math.round(number)
    : 0;
}


/* =========================================================
   BATTLE RESULT
========================================================= */

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


/* =========================================================
   SHORT RESULT
========================================================= */

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
              `Lv.${hero.level || "?"} ` +
              `승급 ${hero.promotion}`
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
              `Lv.${hero.level || "?"} ` +
              `승급 ${hero.promotion}`
          )
          .join(" · ")
      );
    }
  }


  return lines.join("\n");
}
