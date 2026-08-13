export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return sendError(res, 405, "POST 요청만 허용됩니다.");

  const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!API_KEY) return sendError(res, 500, "GEMINI_API_KEY가 설정되어 있지 않습니다.");

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return sendError(res, 400, "요청 JSON을 읽을 수 없습니다."); }
  }

  const image = body?.image || body?.imageBase64 || body?.base64;
  if (!image) return sendError(res, 400, "분석할 이미지가 없습니다.");

  let mimeType = body?.mimeType || body?.mime_type || "image/jpeg";
  let base64Data = String(image);

  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) return sendError(res, 400, "이미지 데이터 형식이 올바르지 않습니다.");
    mimeType = match[1];
    base64Data = match[2];
  }

  base64Data = base64Data.replace(/^data:[^,]+,/, "").replace(/\s/g, "");

  const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;

  // 승급은 AI에게 맡기지 않는다. 사람이 최종 확인/입력한다.
  const prompt = `
You are an OCR extraction system for a Korean strategy-game battle screenshot.

Return ONLY ONE JSON OBJECT. No explanation. No markdown. No code fences.

Read only these fields from the image:
- result: 승리, 패배, 무승부
- attacker.player: nickname on the LEFT side
- attacker.clan: clan on the LEFT side
- attacker.deck: exactly 3 generals on the LEFT side
- defender.player: nickname on the RIGHT side
- defender.clan: clan on the RIGHT side
- defender.deck: exactly 3 generals on the RIGHT side

For each general read:
- name
- level
- cur: current troops
- max: maximum troops

DO NOT READ OR GUESS PROMOTION.
Promotion will be entered manually by the user after OCR.
Every promotion value MUST be null.

LEFT = ATTACKER.
RIGHT = DEFENDER.

Remove commas from troop numbers.
Example 26,736 / 30,000 => cur 26736, max 30000.
If a non-promotion value cannot be read, use -1 for numbers and "" for text.

Return exactly this compact JSON shape:
{
  "result":"패배",
  "attacker":{"player":"","clan":"","deck":[{"name":"","level":50,"promotion":null,"cur":0,"max":10000},{"name":"","level":50,"promotion":null,"cur":0,"max":10000},{"name":"","level":50,"promotion":null,"cur":0,"max":10000}]},
  "defender":{"player":"","clan":"","deck":[{"name":"","level":50,"promotion":null,"cur":0,"max":10000},{"name":"","level":50,"promotion":null,"cur":0,"max":10000},{"name":"","level":50,"promotion":null,"cur":0,"max":10000}]}
}
`;

  const requestBody = {
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2048
    }
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    return sendError(res, 500, "Gemini API 연결 실패", { detail: error?.message || String(error) });
  }

  const rawResponse = await response.text();

  if (!response.ok) {
    let errorData = null;
    try { errorData = JSON.parse(rawResponse); } catch {}
    return sendError(res, response.status, "Gemini API 요청 실패", {
      detail: errorData?.error?.message || rawResponse,
      model: MODEL
    });
  }

  let gemini;
  try { gemini = JSON.parse(rawResponse); }
  catch { return sendError(res, 500, "Gemini 서버 응답을 읽을 수 없습니다."); }

  const candidate = gemini?.candidates?.[0];
  if (!candidate) return sendError(res, 500, "Gemini 분석 결과가 없습니다.", { raw: gemini });

  const finishReason = candidate?.finishReason || "";
  const text = (candidate?.content?.parts || [])
    .map(part => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();

  if (!text) return sendError(res, 500, "Gemini가 빈 응답을 반환했습니다.", { finishReason });

  const result = extractJSON(text);
  if (!result) {
    return sendError(res, 500, "Gemini가 JSON을 반환하지 않았습니다.", {
      finishReason,
      raw: text.slice(0, 10000)
    });
  }

  const validation = validateBattle(result);
  if (!validation.ok) {
    return sendError(res, 500, "AI 분석 결과가 올바르지 않습니다.", {
      reason: validation.reason,
      result
    });
  }

  return res.status(200).json({
    ok: true,
    model: MODEL,
    finishReason,
    result: normalizeBattle(result)
  });
}

function extractJSON(text) {
  let value = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try { return JSON.parse(value); } catch {}

  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(value.slice(first, last + 1)); } catch {}
  }
  return null;
}

function validateBattle(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "결과가 객체가 아닙니다." };
  if (!data.attacker || !data.defender) return { ok: false, reason: "공격자 또는 방어자 데이터가 없습니다." };
  if (typeof data.attacker.player !== "string") return { ok: false, reason: "공격자 닉네임이 없습니다." };
  if (typeof data.defender.player !== "string") return { ok: false, reason: "방어자 닉네임이 없습니다." };
  if (!Array.isArray(data.attacker.deck) || data.attacker.deck.length !== 3) return { ok: false, reason: "공격자 덱 3명이 필요합니다." };
  if (!Array.isArray(data.defender.deck) || data.defender.deck.length !== 3) return { ok: false, reason: "방어자 덱 3명이 필요합니다." };
  return { ok: true };
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return -1;
  const n = Number(value);
  return Number.isFinite(n) ? n : -1;
}

function normalizeUnit(unit) {
  return {
    name: typeof unit?.name === "string" ? unit.name.trim() : "",
    level: numberValue(unit?.level),
    // AI가 절대 승급을 확정하지 않도록 null 유지
    promotion: null,
    cur: numberValue(unit?.cur),
    max: numberValue(unit?.max)
  };
}

function normalizeSide(side) {
  return {
    player: typeof side?.player === "string" ? side.player.trim() : "",
    clan: typeof side?.clan === "string" ? side.clan.trim() : "",
    deck: Array.isArray(side?.deck) ? side.deck.slice(0, 3).map(normalizeUnit) : []
  };
}

function normalizeBattle(data) {
  return {
    result: typeof data?.result === "string" ? data.result.trim() : "",
    attacker: normalizeSide(data.attacker),
    defender: normalizeSide(data.defender)
  };
}

function sendError(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}
