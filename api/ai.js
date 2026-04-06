export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

  try {
    const body = await req.json();
    const { type, url, color, size, messages, max_tokens } = body;

    let finalMessages = messages || [];
    let finalMaxTokens = max_tokens || 1000;

    if (type === 'product_url' && url) {
      let pageContent = '';
      let productImageUrl = ''; // 제품 이미지 URL 추출

      try {
        const pageRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
          signal: AbortSignal.timeout(8000),
        });
        const html = await pageRes.text();

        // og:image 메타태그에서 제품 대표 이미지 추출
        const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogImgMatch) productImageUrl = ogImgMatch[1];

        // 텍스트 추출
        pageContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 6000);
      } catch (e) {
        pageContent = `URL: ${url} (페이지 직접 접근 실패 — URL과 브랜드명으로 추론)`;
      }

      finalMaxTokens = 800;
      finalMessages = [{
        role: 'user',
        content: `다음은 쇼핑몰 제품 페이지 내용이에요. 제품 정보를 분석해서 JSON만 출력해주세요.

구매자 입력:
- 색상: ${color || '미입력'}
- 사이즈: ${size || '미입력'}
- URL: ${url}
- 추출된 이미지 URL: ${productImageUrl || '없음'}

페이지 내용:
${pageContent}

아래 JSON 형식으로만 답해주세요 (다른 텍스트 없이):
{
  "name": "제품명 (브랜드 포함, 한국어)",
  "brand": "브랜드명",
  "category": "top/knit/blouse/bottom/skirt/jacket/coat/cardigan/dress/sneakers/heels/boots/sandals/bag/jewelry/hat/belt/inner 중 하나",
  "colors": [{"name": "색상명(한국어)", "hex": "#헥스코드", "role": "main"}],
  "material": ["소재1", "소재2"],
  "fit": ["핏"],
  "pattern": ["단색 또는 패턴"],
  "style": ["스타일1", "스타일2"],
  "season": ["계절1", "계절2"],
  "sleeve": ["소매길이 또는 해당없음"],
  "occasion": ["착용상황"],
  "price": 숫자(원화),
  "size": "${size || ''}",
  "image_url": "${productImageUrl || ''}",
  "confidence": 정확도0-100
}`
      }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: finalMaxTokens,
        messages: finalMessages,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
