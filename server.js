// Group Chat Court: a jury of 12 Muse Ember agents settles your group chat argument.
// Zero dependencies. Every call goes to meta/muse-ember through OpenRouter.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta/muse-ember';
const PORT = Number(process.env.PORT || 3000);
// Same token counts priced on Claude Sonnet 5.5 (OpenRouter list price, $ per 1M tokens) for the cost comparison
const SONNET = { in: 2.0, out: 10.0 };

export const JURORS = [
  { name: 'Mom', emoji: '👩‍🍳', persona: 'a loving but passive aggressive mom who brings everything back to manners and whether you ate' },
  { name: 'The Lawyer', emoji: '⚖️', persona: 'a pedantic corporate lawyer who argues definitions, precedent and technicalities' },
  { name: 'Gen Z Intern', emoji: '📱', persona: 'a 21 year old intern who talks in Gen Z slang and judges everything by vibes' },
  { name: 'The Philosopher', emoji: '🏛️', persona: 'a dramatic philosophy professor who quotes Plato and overthinks everything' },
  { name: 'Conspiracy Guy', emoji: '🛸', persona: 'a conspiracy theorist who is sure Big Something is behind this' },
  { name: 'Grandma', emoji: '👵', persona: 'a sweet grandma who compares everything to how it was in 1962' },
  { name: 'Startup Founder', emoji: '🚀', persona: 'a startup founder who sees everything as a market opportunity and says disrupt' },
  { name: 'Gym Bro', emoji: '💪', persona: 'a gym bro who relates everything to protein, gains and leg day' },
  { name: 'TV Judge', emoji: '👩‍⚖️', persona: 'a no nonsense daytime TV judge with zero patience' },
  { name: 'The Cat', emoji: '🐈', persona: 'a cat who only cares about itself, naps and knocking things off tables' },
  { name: 'The Therapist', emoji: '🛋️', persona: 'a therapist who validates everyone and asks how it makes them feel' },
  { name: 'The Pirate', emoji: '🏴‍☠️', persona: 'a pirate captain who talks like a pirate and values treasure and loyalty' },
];

const SIDES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['case_name', 'a', 'b'],
  properties: {
    case_name: { type: 'string', description: 'Funny court case title, like "The People v. The Hot Dog"' },
    a: { type: 'string', description: 'Side A position, max 8 words' },
    b: { type: 'string', description: 'Side B position, max 8 words' },
  },
};
const VOTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['side', 'argument', 'confidence'],
  properties: {
    side: { type: 'string', enum: ['A', 'B'] },
    argument: { type: 'string', description: 'One or two funny sentences, max 30 words, fully in character' },
    confidence: { type: 'integer', description: '1 to 10' },
  },
};
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['winner', 'verdict', 'sentence'],
  properties: {
    winner: { type: 'string', enum: ['A', 'B'] },
    verdict: { type: 'string', description: 'Dramatic 2 to 3 sentence ruling that references the best juror arguments' },
    sentence: { type: 'string', description: 'A funny punishment for the losing side, one sentence' },
  },
};

async function ember(messages, schema, max_tokens = 800) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://github.com/tilentkalec/group-chat-court', 'X-Title': 'Group Chat Court' },
    body: JSON.stringify({
      model: MODEL, messages, max_tokens, temperature: 0.9,
      reasoning: { effort: 'low' }, usage: { include: true },
      response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error?.message || `OpenRouter HTTP ${r.status}`);
  const text = d.choices?.[0]?.message?.content || '';
  let json; try { json = JSON.parse(text); } catch { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}'); }
  return { json, usage: d.usage || {} };
}

async function trial(req, res) {
  let body = ''; for await (const c of req) body += c;
  const { dispute = '' } = JSON.parse(body || '{}');
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache' });
  const send = (o) => res.write(JSON.stringify(o) + '\n');
  const m = { cost: 0, calls: 0, tin: 0, tout: 0, ms: 0 };
  const t0 = Date.now();
  const call = async (...args) => {
    const out = await ember(...args);
    m.calls++; m.cost += out.usage.cost || 0; m.tin += out.usage.prompt_tokens || 0; m.tout += out.usage.completion_tokens || 0; m.ms = Date.now() - t0;
    send({ type: 'meter', ...m, sonnet: (m.tin * SONNET.in + m.tout * SONNET.out) / 1e6 });
    return out.json;
  };
  try {
    if (!KEY) throw new Error('Add OPENROUTER_API_KEY to .env');
    const sides = await call([
      { role: 'system', content: 'You are the clerk of the Court of Petty Appeals. Turn a group chat argument into a court case with two clear opposing sides.' },
      { role: 'user', content: dispute.slice(0, 2000) },
    ], SIDES_SCHEMA, 1500);
    send({ type: 'sides', ...sides, jurors: JURORS.map(({ name, emoji }) => ({ name, emoji })) });

    const votes = [];
    await Promise.all(JURORS.map(async (j, i) => {
      try {
        const ask = () => call([
          { role: 'system', content: `You are ${j.name}, ${j.persona}. You are a juror in the Court of Petty Appeals. Stay fully in character, be funny and opinionated, never neutral.` },
          { role: 'user', content: `Case: ${sides.case_name}\nThe argument: ${dispute.slice(0, 2000)}\n\nSide A: ${sides.a}\nSide B: ${sides.b}\n\nPick a side and argue it.` },
        ], VOTE_SCHEMA, 2000);
        let v = await ask();
        if (!v?.side || !v?.argument) v = await ask(); // retry once if the reply came back empty
        if (!v?.side || !v?.argument) throw new Error('no vote');
        votes[i] = { ...j, ...v };
        send({ type: 'vote', i, vote: votes[i] });
      } catch (e) { send({ type: 'vote', i, error: e.message }); }
    }));

    const valid = votes.filter(Boolean);
    const score = { A: valid.filter((v) => v.side === 'A').length, B: valid.filter((v) => v.side === 'B').length };
    send({ type: 'score', score });
    const judge = await call([
      { role: 'system', content: 'You are the Honorable Judge of the Court of Petty Appeals: theatrical, dramatic, a little unhinged. The jury vote decides the winner unless it is a tie, then you decide.' },
      { role: 'user', content: `Case: ${sides.case_name}\nSide A: ${sides.a}\nSide B: ${sides.b}\nJury vote: A ${score.A}, B ${score.B}\n\nJuror arguments:\n${valid.map((v) => `${v.name} (${v.side}): ${v.argument}`).join('\n')}\n\nDeliver the verdict.` },
    ], JUDGE_SCHEMA, 2500);
    if (score.A !== score.B) judge.winner = score.A > score.B ? 'A' : 'B';
    send({ type: 'verdict', ...judge, score });
  } catch (e) { send({ type: 'error', error: e.message }); }
  res.end();
}

http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/trial' && req.method === 'POST') return await trial(req, res);
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('./public/index.html', import.meta.url)));
    }
    res.writeHead(404).end('not found');
  } catch (e) { res.writeHead(500).end(e.message); }
}).listen(PORT, () => console.log(`Group Chat Court is in session: http://localhost:${PORT}  (model ${MODEL})`));
