export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  try {
    // Vercel에서 JSON으로 들어온 경우와
    // 문자열로 들어온 경우 모두 처리
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: "요청 데이터가 올바른 JSON이 아닙니다."
        });
      }
    }

    const { image, mimeType } = body || {};

    // 이미지 확인
    if (!image) {
      return res.status(400).json({
        success: false,
        error: "이미지가 전달되지 않았습니다."
      });
    }

    // Vercel 환경변수에서 API KEY 가져오기
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY가 Vercel 환경변수에 없습니다."
      });
    }

    // ----------------------------------------
    // 이미지 데이터 정리
    // ----------------------------------------

    let base64 = image;

    // 혹시 data:image/jpeg;base64, 형태로 들어오면
    // 앞부분을 제거
    if (base64.includes(",")) {
      base64 = base64.split(",")[1];
    }

    const imageMimeType = mimeType || "image/jpeg";

    // ----------------------------------------
    // Gemini에게 전달할 분석 요청
    // ----------------------------------------

    const prompt = `
너는 삼국지 전략 게임의 전투 결과 스크린샷을 분석하는 AI다.

첨부된 이미지는 게임의 전투 결과 화면이다.

화면 전체를 자세하게 보고 다음 정보를 최대한 정확하게 판독해라.

[1. 전투 결과]
- 승리
- 패배
- 또는 확인 불가

[2. 공격측]
- 장수 이름
- 장수 레벨
- 병력 수치
- 화면에 표시된 주요 수치

[3. 방어측]
- 장수 이름
- 장수 레벨
- 병력 수치
- 화면에 표시된 주요 수치

[4. 주요 전투 수치]
화면 중앙과 각 장수 아래에 표시된 숫자와 효과를 가능한 한 정확하게 읽어라.

[5. 전투 분석]
왜 승리 또는 패배했는지 화면에서 확인되는 정보를 바탕으로 간단하게 분석해라.

[6. 판독 신뢰도]
높음 / 보통 / 낮음

중요한 규칙:

- 이미지에 실제로 보이는 정보만 사용해라.
- 보이지 않는 숫자나 이름을 추측하지 마라.
- 읽기 어려운 내용은 "확인 불가"라고 표시해라.
- 숫자는 가능한 한 원본 그대로 적어라.
- 장수 이름은 화면에 표시된 한글을 최대한 정확하게 읽어라.

다음 형식으로 답변해라.

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
병
