// netlify/functions/chat.js
//
// Function serverless (Netlify) que atua como proxy seguro entre o front-end
// (index.html) e a API da Anthropic. A API key NUNCA fica exposta no navegador —
// ela vive apenas na variável de ambiente ANTHROPIC_API_KEY, configurada no
// painel do Netlify (Site settings > Environment variables).

const { SYSTEM_PROMPT } = require('./knowledge-base.js');

exports.handler = async (event) => {
  // CORS básico + preflight
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');

    if (!Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '"messages" é obrigatório e deve ser um array.' }) };
    }

    // Limita histórico enviado (evita custo/latência desnecessários)
    const trimmed = messages.slice(-20);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: trimmed,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erro Anthropic API:', response.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Erro ao consultar a IA. Tente novamente em instantes.' }),
      };
    }

    const data = await response.json();
    const textBlocks = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: textBlocks || 'Não consegui gerar uma resposta. Tente reformular a pergunta.' }),
    };
  } catch (err) {
    console.error('Erro na function chat:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno no servidor.' }) };
  }
};

