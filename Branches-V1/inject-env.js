// Netlify build script — injects environment variables into config.json
// Set OPENAI_API_KEY and CLAUDE_API_KEY in Netlify dashboard:
//   Site settings → Environment variables

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'app.config.json');

try {
  let cfg = fs.readFileSync(configPath, 'utf8');

  if (process.env.OPENAI_API_KEY) {
    cfg = cfg.split('__OPENAI_API_KEY__').join(process.env.OPENAI_API_KEY);
    console.log('Injected OPENAI_API_KEY');
  } else {
    console.log('OPENAI_API_KEY not set — skipping');
  }

  if (process.env.CLAUDE_API_KEY) {
    cfg = cfg.split('__CLAUDE_API_KEY__').join(process.env.CLAUDE_API_KEY);
    console.log('Injected CLAUDE_API_KEY');
  } else {
    console.log('CLAUDE_API_KEY not set — skipping');
  }

  fs.writeFileSync(configPath, cfg, 'utf8');
  console.log('Build complete — config.json ready');
} catch (err) {
  console.error('Build script error:', err.message);
  process.exit(1);
}
