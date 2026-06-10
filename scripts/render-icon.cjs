// Renders the robot+speech-bubble icon to a 1024x1024 PNG using Playwright
const { chromium } = require('playwright');
const path = require('node:path');

const outPath = path.join(__dirname, '..', 'robot-chat-icon-1024.png');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 1024px;
    background: #0d1b2e;
    border-radius: 180px;
    overflow: hidden;
    position: relative;
  }

  /* Robot emoji — large, centered slightly high */
  .robot {
    position: absolute;
    font-size: 620px;
    line-height: 1;
    top: 30px;
    left: 50%;
    transform: translateX(-50%);
    user-select: none;
  }

  /* Speech bubble body */
  .bubble {
    position: absolute;
    top: 108px;
    left: 68px;
    width: 232px;
    height: 116px;
    background: #ffffff;
    border-radius: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
  }

  /* Bubble tail (points down-right toward robot mouth) */
  .bubble::after {
    content: '';
    position: absolute;
    bottom: -38px;
    right: 36px;
    width: 0; height: 0;
    border-left: 22px solid transparent;
    border-right: 22px solid transparent;
    border-top: 44px solid #ffffff;
  }

  /* Typing dots */
  .dot {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: #0d1b2e;
    opacity: 0.65;
  }
</style>
</head>
<body>
  <div class="robot">🤖</div>
  <div class="bubble">
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Give emoji font a moment to paint
  await page.waitForTimeout(400);
  await page.screenshot({ path: outPath, omitBackground: false });
  await browser.close();
  console.log(`Written: ${outPath}`);
})();
