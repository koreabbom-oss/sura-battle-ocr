export default async function handler(req, res) {

  /*
   * =========================================================
   * METHOD
   * =========================================================
   */

  if (req.method !== 'POST') {

    return res.status(405).json({
      error: 'POST 요청만 허용됩니다.'
    });

  }


  /*
   * =========================================================
   * API KEY
   * =========================================================
   */

  const API_KEY =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;


  if (!API_KEY) {

    return res.status(500).json({
      error:
        'Gemini API 키가 설정되지 않았습니다.',
      detail:
        'Vercel Environment Variables에서 GEMINI_API_KEY를 확인해주세요.'
    });

  }


  /*
   * =========================================================
   * REQUEST
   * =========================================================
   */

  try {

    const body =
      req.body || {};


    const image =
      body.image;


    const mimeType =
      body.mimeType ||
      'image/jpeg';


    if (!image) {

      return res.status(400).json({
        error:
          '이미지가 전달되지 않았습니다.'
      });

    }


    /*
     * =======================================================
     * BASE64 추출
     * =======================================================
     *
     * data:image/jpeg;base64,AAAA...
     *
     * 형태와
     *
     * 순수 base64
     *
     * 둘 다 처리
     */

    let base64 =
      image;


    if (
      typeof image === 'string' &&
      image.includes(',')
    ) {

      base64 =
        image.split(',')[1];

    }


    if (!base64) {

      return res.status(400).json({
        error:
          '이미지 데이터가 비어 있습니다.'
      });

    }


    /*
     * =========================================================
     * GEMINI MODEL
     * =========================================================
     *
     * 현재 사용 중인 모델을 유지하려면
     * 여기 모델명만 변경하면 됩니다.
     *
     * 우선 저비용 Flash 계열 사용.
     */

    const MODEL =
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash';


    const URL =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


    /*
     * =========================================================
     * PROMPT
     * =========================================================
     *
     * ★ 핵심:
     *
     * 긴 설명을 생성하지 않는다.
     *
     * 우리가 필요한 건:
     *
     * - 승패
     * - 공격자
     * - 방어자
     * - 맹
     * - 장수
     * - 레벨
     * - 승급
     * - 병력
     *
     * 뿐이다.
     */

    const prompt = `
이 게임 전투 결과 스크린샷을 읽고 필요한 데이터만 추출해라.

긴 설명을 절대 작성하지 마라.
추측하지 마라.
화면에서 확인되지 않는 값은 null로 작성해라.

반드시 JSON 하나만 출력해라.

형식:

{
  "battle_result": "승리" 또는 "패배" 또는 "확인 불가",

  "attacker": {
    "player": "공격자 닉네임 또는 null",
    "clan": "공격자 맹 또는 null",
    "deck": [
      {
        "name": "장수 이름",
        "level": 숫자 또는 null,
        "promotion": 숫자 또는 null,
        "troops_current": 숫자 또는 null,
        "troops_max": 숫자 또는 null
      }
    ]
  },

  "defender": {
    "player": "방어자 닉네임 또는 null",
    "clan": "방어자 맹 또는 null",
    "deck": [
      {
        "name": "장수 이름",
        "level": 숫자 또는 null,
        "promotion": 숫자 또는 null,
        "troops_current": 숫자 또는 null,
        "troops_max": 숫자 또는 null
      }
    ]
  },

  "key_stats": {
    "attacker_power": 숫자 또는 null,
    "defender_power": 숫자 또는 null
  }
}

중요:

1. 장수 이름은 화면에 보이는 그대로 읽어라.
2. 빨간색 승급 숫자를 반드시 읽어라.
3. 승급 숫자가 보이지 않으면 null.
4. 레벨이 보이지 않으면 null.
5. 병력이 보이지 않으면 null.
6. 공격측과 방어측을 구분해라.
7. 닉네임과 맹 이름을 구분해라.
8. 확인되지 않은 정보를 추측하지 마라.
9. 설명 문장을 작성하지 마라.
10. Markdown을 사용하지 마라.
11. 반드시 JSON만 반환해라.
`;


    /*
     * =========================================================
     * GEMINI REQUEST
     * =========================================================
     */

    const geminiResponse =
      await fetch(
        URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({

            contents: [

              {
                role: 'user',

                parts: [

                  {
                    text:
                      prompt
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


            /*
             * 출력 형식을 JSON으로 강제
             */

            generationConfig: {

              temperature:
                0,

              maxOutputTokens:
                1500,

              responseMimeType:
                'application/json'

            }

          })

        }
      );


    /*
     * =========================================================
     * GEMINI ERROR
     * =========================================================
     */

    const raw =
      await geminiResponse.text();


    if (!geminiResponse.ok) {

      let errorData = null;


      try {

        errorData =
          JSON.parse(raw);

      } catch (_) {

        errorData = {
          raw
        };

      }


      console.error(
        'GEMINI ERROR:',
        geminiResponse.status,
        errorData
      );


      return res.status(
        geminiResponse.status
      ).json({

        error:
          errorData?.error?.message ||
          errorData?.message ||
          'Gemini API 요청 실패',

        detail:
          errorData?.error?.status ||
          errorData?.error?.details ||
          errorData?.detail ||
          null,

        raw:
          raw.substring(
            0,
            3000
          )

      });

    }


    /*
     * =========================================================
     * PARSE GEMINI RESPONSE
     * =========================================================
     */

    let geminiData;


    try {

      geminiData =
        JSON.parse(raw);

    } catch (error) {

      return res.status(500).json({

        error:
          'Gemini 응답을 읽을 수 없습니다.',

        detail:
          raw.substring(
            0,
            3000
          )

      });

    }


    /*
     * =========================================================
     * TEXT 추출
     * =========================================================
     */

    const text =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ''
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
          ).substring(
            0,
            3000
          )

      });

    }


    /*
     * =========================================================
     * JSON CLEAN
     * =========================================================
     *
     * 혹시 Gemini가 ```json ... ```
     * 형태로 반환해도 제거
     */

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


    /*
     * =========================================================
     * STRUCTURED JSON
     * =========================================================
     */

    let structured;


    try {

      structured =
        JSON.parse(
          cleanText
        );

    } catch (error) {

      /*
       * 혹시 JSON 앞뒤에 불필요한 문자가 붙은 경우
       * 첫 { 부터 마지막 }까지만 사용
       */

      const first =
        cleanText.indexOf('{');


      const last =
        cleanText.lastIndexOf('}');


      if(
        first !== -1 &&
        last !== -1 &&
        last > first
      ){

        try {

          structured =
            JSON.parse(
              cleanText.substring(
                first,
                last + 1
              )
            );

        } catch (_) {

          structured =
            null;

        }

      }

    }


    /*
     * =========================================================
     * JSON VALIDATION
     * =========================================================
     */

    if (!structured) {

      return res.status(500).json({

        error:
          'AI가 올바른 JSON을 반환하지 않았습니다.',

        detail:
          cleanText.substring(
            0,
            3000
          )

      });

    }


    /*
     * =========================================================
     * NORMALIZE
     * =========================================================
     *
     * DB에 저장하기 전에 구조를 일정하게 맞춘다.
     */

    structured =
      normalizeResult(
        structured
      );


    /*
     * =========================================================
     * SHORT RESULT TEXT
     * =========================================================
     *
     * 기존 index.html이 resultText도 필요하기 때문에
     * 긴 AI 설명 대신 짧은 요약만 생성한다.
     */

    const resultText =
      makeShortResult(
        structured
      );


    /*
     * =========================================================
     * FINAL RESPONSE
     * =========================================================
     */

    return res.status(200).json({

      result:
        resultText,

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


/*
 * ===========================================================
 * NORMALIZE RESULT
 * ===========================================================
 */

function normalizeResult(
  data
){

  const result = {

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
          data?.key_stats
            ?.attacker_power
        ),

      defender_power:
        toNumberOrNull(
          data?.key_stats
            ?.defender_power
        )

    }

  };


  return result;

}


/*
 * ===========================================================
 * NORMALIZE SIDE
 * ===========================================================
 */

function normalizeSide(
  side
){

  if(!side){

    return null;

  }


  const deck =
    Array.isArray(
      side.deck
    )
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
        .slice(
          0,
          5
        )
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


/*
 * ===========================================================
 * BATTLE RESULT
 * ===========================================================
 */

function normalizeBattleResult(
  value
){

  const text =
    String(
      value || ''
    )
    .trim();


  if(
    text.includes('승')
  ){

    return '승리';

  }


  if(
    text.includes('패')
  ){

    return '패배';

  }


  return '확인 불가';

}


/*
 * ===========================================================
 * NUMBER
 * ===========================================================
 */

function toNumberOrNull(
  value
){

  if(
    value === null ||
    value === undefined ||
    value === ''
  ){

    return null;

  }


  if(
    typeof value === 'number'
  ){

    return Number.isFinite(
      value
    )
      ? value
      : null;

  }


  const cleaned =
    String(value)
      .replace(
        /,/g,
        ''
      )
      .replace(
        /[^0-9.-]/g,
        ''
      );


  if(!cleaned){

    return null;

  }


  const number =
    Number(
      cleaned
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;

}


/*
 * ===========================================================
 * SHORT RESULT
 * ===========================================================
 *
 * 긴 설명을 만들지 않는다.
 */

function makeShortResult(
  data
){

  const lines = [];


  lines.push(
    `전투 결과: ${data.battle_result}`
  );


  if(
    data.attacker
  ){

    lines.push(
      `공격: ${data.attacker.player || '확인 불가'}` +
      (
        data.attacker.clan
          ? ` / ${data.attacker.clan}`
          : ''
      )
    );


    if(
      data.attacker.deck.length
    ){

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


  if(
    data.defender
  ){

    lines.push(
      `방어: ${data.defender.player || '확인 불가'}` +
      (
        data.defender.clan
          ? ` / ${data.defender.clan}`
          : ''
      )
    );


    if(
      data.defender.deck.length
    ){

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
