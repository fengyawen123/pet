// 向 OpenRouter（OpenAI 兼容接口）发起流式请求，逐段把回复文本回调出去。
// 抽成独立模块，方便主进程使用、也方便单独测试解析逻辑。
async function streamChat({ url, apiKey, model, messages, signal, onDelta }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://desktop-pet.local',
      'X-Title': 'Desktop Pet',
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (e) {}
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(':')) continue;   // 空行 / 注释(保活) 跳过
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (delta) onDelta(delta);
      } catch (e) { /* 不完整片段，忽略 */ }
    }
  }
}

module.exports = { streamChat };
