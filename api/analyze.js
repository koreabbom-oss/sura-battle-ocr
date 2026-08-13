export default async function handler(req, res) {

  // =========================================================
  // METHOD
  // =========================================================

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'POST 요청만 허용됩니다.'
    });
  }


  // =========================================================
  // GEMINI API KEY
  // =========================================================

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;


  if (!API_KEY) {
    return res.status(500).json({
      error: 'Gemini API 키가 설정되지 않았습니다.',
      detail:
        'Vercel Environment Variables에서 GEMINI_API_KEY를 확인해주세요.'
    });
  }


  // =========================================================
  // REQUEST
  // =========================================================

  try {

    const body = req.body || {};

    const image = body.image;

    const mimeType =
      body.mimeType || 'image/jpeg';


    if (!image) {
      return res.status(400).json({
        error: '이미지가 전달되지 않았습니다.'
      });
    }


    // =======================================================
    // BASE64 추출
    // =======================================================

    let base64 = image;

    if (
      typeof image === 'string' &&
      image.includes(',')
    ) {
      base64 = image.split(',')[1];
    }


    if (!base64) {
      return res.status(400).json({
        error: '이미지 데이터가 비어 있습니다.'
      });
    }


    // =======================================================
    // GEMINI MODEL
    // =======================================================
    //
    // 현재 안정 모델
    //
    // gemini-3.6-flash
    //
    // 이미지 입력 지원
    // 구조화 출력 지원
    //
    // =======================================================

    const MODEL = 'gemini-3.6-flash';


    const API_URL =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


    // =========================================================
    // PROMPT
    // =========================================================
    //
    // 긴 설명을 만들지 않는다.
    //
    // 필요한 데이터만 추출한다.
    //
    // =========================================================

    const prompt = `
너는 삼국지 스타일 모바일 게임의 전투 결과 스크린샷을 분석하는 데이터 추출 AI다.

이미지 전체를 확인하고 아래 정보를 정확하게 추출해라.

중요:
- 긴 설명을 절대 작성하지 마라.
- 분석 과정도 작성하지 마라.
- 추측하지 마라.
- 화면에서 확인할 수 없는 값은 null로 한다.
- 반드시 JSON 하나만 출력한다.
- Markdown을 사용하지 않는다.
- 화면의 빨간색 승급 숫자는 매우 중요한 정보이므로 반드시 읽는다.
- 장수의 이름, 레벨, 승급을 최대한 정확하게 읽는다.
- 공격측과 방어측을 정확하게 구분한다.

반환 형식:

{
  "battle_result": "승리",
  "attacker": {
    "player": "닉네임",
    "clan": "맹 이름",
    "deck": [
      {
        "name": "장수 이름",
        "level": 50,
        "promotion": 3,
        "troops_current": 0,
        "troops_max": 10000
      }
    ]
  },
  "defender": {
    "player": "닉네임",
    "clan": "맹 이름",
    "deck": [
      {
        "name": "장수 이름",
        "level": 50,
        "promotion": 3,
        "troops_current": 0,
        "troops_max": 10000
      }
    ]
  },
  "key_stats": {
    "attacker_power": null,
    "defender_power": null
  }
}

규칙:

1. battle_result는 반드시 다음 중 하나:
   - "승리"
   - "패배"
   - "확인 불가"

2. 공격측:
   - 화면 왼쪽에 있는 플레이어
   - 공격측 장수 3명

3. 방어측:
   - 화면 오른쪽에 있는 플레이어
   - 방어측 장수 3명

4. 장수:
   - name = 장수 이름
   - level = 장수 레벨
   - promotion = 장수 카드에 표시된 빨간색 승급 숫자
   - troops_current = 현재 병력
   - troops_max = 최대 병력

5. 승급 숫자는 절대로 레벨과 혼동하지 마라.

6. 숫자를 확실히 읽을 수 없으면 null.

7. 닉네임과 맹 이름이 확실하지 않으면 null.

8. 반드시 JSON만 출력한다.
`;


    // =========================================================
    // GEMINI REQUEST
    // =========================================================

    const response =
      await fetch(
        API_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({

            contents: [

              {
                role: 'user',

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
                'application/json'

            }

          })

        }
      );


    // =========================================================
    // RAW RESPONSE
    // =========================================================

    const raw =
      await response.text();


    console.log(
      'GEMINI HTTP STATUS:',
      response.status
    );


    console.log(
      'GEMINI RAW RESPONSE:',
      raw
    );


    // =========================================================
    // GEMINI ERROR
    // =========================================================

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
        errorData?.message ||
        'Gemini API 요청 실패';


      return res.status(
        response.status
      ).json({

        error:
          'Gemini API 요청 실패',

        detail:
          message,

        httpStatus:
          response.status,

        model:
          MODEL,

        raw:
          raw.substring(0, 5000)

      });

    }


    // =========================================================
    // PARSE GEMINI RESPONSE
    // =========================================================

    let geminiData;

    try {

      geminiData =
        JSON.parse(raw);

    } catch {

      return res.status(500).json({

        error:
          'Gemini 서버 응답을 JSON으로 읽을 수 없습니다.',

        raw:
          raw.substring(0, 5000)

      });

    }


    // =========================================================
    // TEXT 추출
    // =========================================================

    const text =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part => part.text || ''
        )
        .join('')
        .trim();


    if (!text) {

      return res.status(500).json({

        error:
          'Gemini가 분석 결과를 반환하지 않았습니다.',

        raw:
          JSON.stringify(
            geminiData
          ).substring(0, 5000)

      });

    }


    // =========================================================
    // JSON CLEAN
    // =========================================================

    let cleanText =
      text
        .replace(
          /^```json\s*/i,
          ''
        )
        .replace(
          /^```\s*/i,
          ''
        )
        .replace(
          /\s*```$/i,
          ''
        )
        .trim();


    // =========================================================
    // STRUCTURED JSON
    // =========================================================

    let structured = null;


    try {

      structured =
        JSON.parse(cleanText);

    } catch {

      // 혹시 앞뒤에 이상한 문자가 붙은 경우

      const first =
        cleanText.indexOf('{');

      const last =
        cleanText.lastIndexOf('}');


      if (
        first !== -1 &&
        last !== -1 &&
        last > first
      ) {

        try {

          structured =
            JSON.parse(
              cleanText.substring(
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
          'AI가 올바른 JSON을 반환하지 않았습니다.',

        detail:
          cleanText.substring(
            0,
            5000
          )

      });

    }


    // =========================================================
    // NORMALIZE
    // =========================================================

    structured =
      normalizeResult(
        structured
      );


    // =========================================================
    // SHORT RESULT
    // =========================================================

    const result =
      makeShortResult(
        structured
      );


    // =========================================================
    // FINAL RESPONSE
    // =========================================================

    return res.status(200).json({

      result:

        result,

      structured:

        structured

    });


  } catch (error) {

    console.error(
      'ANALYZE SERVER ERROR:',
      error
    );


    return res.status(500).json({

      error:
        '분석 서버 오류',

      detail:
        error?.message ||
        String(error)

    });

  }

}


/* ===========================================================
   NORMALIZE RESULT
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
        toNumberOrNull(
          data?.key_stats?.attacker_power
        ),

      defender_power:
        toNumberOrNull(
          data?.key_stats?.defender_power
        )

    }

  };

}


/* ===========================================================
   NORMALIZE SIDE
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
      side.player
        ? String(
            side.player
          ).trim()
        : null,

    clan:
      side.clan
        ? String(
            side.clan
          ).trim()
        : null,

    deck:
      deck
        .slice(0, 5)
        .map(
          hero => ({

            name:
              hero?.name
                ? String(
                    hero.name
                  ).trim()
                : null,

            level:
              toNumberOrNull(
                hero?.level
              ),

            promotion:
              toNumberOrNull(
                hero?.promotion
              ),

            troops_current:
              toNumberOrNull(
                hero?.troops_current
              ),

            troops_max:
              toNumberOrNull(
                hero?.troops_max
              )

          })
        )

  };

}


/* ===========================================================
   BATTLE RESULT
=========================================================== */

function normalizeBattleResult(value) {

  const text =
    String(
      value || ''
    ).trim();


  if (
    text.includes('승')
  ) {
    return '승리';
  }


  if (
    text.includes('패')
  ) {
    return '패배';
  }


  return '확인 불가';

}


/* ===========================================================
   NUMBER
=========================================================== */

function toNumberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }


  if (
    typeof value === 'number'
  ) {

    return Number.isFinite(value)
      ? value
      : null;

  }


  const cleaned =
    String(value)
      .replace(/,/g, '')
      .replace(/[^0-9.-]/g, '');


  if (!cleaned) {
    return null;
  }


  const number =
    Number(cleaned);


  return Number.isFinite(number)
    ? number
    : null;

}


/* ===========================================================
   SHORT RESULT
=========================================================== */

function makeShortResult(data) {

  const lines = [];


  lines.push(
    `전투 결과: ${data.battle_result}`
  );


  if (data.attacker) {

    lines.push(
      `공격: ${
        data.attacker.player ||
        '확인 불가'
      }` +
      (
        data.attacker.clan
          ? ` / ${data.attacker.clan}`
          : ''
      )
    );


    if (
      data.attacker.deck.length
    ) {

      lines.push(
        '공격 덱: ' +

        data.attacker.deck
          .map(
            hero =>
              `${hero.name || '?'} ` +
              `Lv.${hero.level ?? '?'} ` +
              `승급 ${hero.promotion ?? '?'}`
          )
          .join(' · ')
      );

    }

  }


  if (data.defender) {

    lines.push(
      `방어: ${
        data.defender.player ||
        '확인 불가'
      }` +
      (
        data.defender.clan
          ? ` / ${data.defender.clan}`
          : ''
      )
    );


    if (
      data.defender.deck.length
    ) {

      lines.push(
        '방어 덱: ' +

        data.defender.deck
          .map(
            hero =>
              `${hero.name || '?'} ` +
              `Lv.${hero.level ?? '?'} ` +
              `승급 ${hero.promotion ?? '?'}`
          )
          .join(' · ')
      );

    }

  }


  return lines.join('\n');

}
