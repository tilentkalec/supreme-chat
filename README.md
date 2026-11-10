# ⚖️ Supreme Chat

Paste any group chat argument ("is a hot dog a sandwich?", "who pays for the Uber?"). A jury of 12 AI characters (Mom, a lawyer, a Gen Z intern, a conspiracy guy, a cat, a pirate...) argue it out in parallel and vote. Then the judge delivers a dramatic verdict and sentences the losing side.

Demo video: [demo.mp4](demo.mp4)

Built at the OpenRouter x Meta Build Day (SF, Nov 9 2026) for the **$1 Challenge**.

## How it works
Every call is **Meta Muse Ember** (`meta/muse-ember`) through **OpenRouter**:
1. The clerk turns the argument into a case with Side A vs Side B
2. 12 juror agents run in parallel, each with its own persona, and return a structured vote (side, argument, confidence)
3. The judge reads every argument and writes the verdict and sentence

14 Ember calls per trial, streamed live to the page.

## Cost
- One full trial: about **$0.004** (around 3k input + 6.5k output tokens)
- **About 250 trials per $1**
- The same tokens on Claude Sonnet 5.5 would cost about $0.08 per trial, roughly 20x more
- The page shows the live cost of every trial (from OpenRouter `usage.cost`)

## Run it
```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .env
npm start
# open http://localhost:3000
```
Node 22+, zero dependencies. Edit the `JURORS` list in `server.js` to change the jury.
