#!/bin/bash
# Netlify build script — injects environment variables into config.json
# Set OPENAI_API_KEY and CLAUDE_API_KEY in Netlify dashboard:
#   Site settings → Environment variables

echo "🔧 Starting build — injecting env vars into config.json"

node -e "
const fs = require('fs');
let cfg = fs.readFileSync('config.json', 'utf8');
let changed = false;

if (process.env.OPENAI_API_KEY) {
  cfg = cfg.replace('__OPENAI_API_KEY__', process.env.OPENAI_API_KEY);
  console.log('Injected OPENAI_API_KEY');
  changed = true;
} else {
  console.log('OPENAI_API_KEY not set — skipping');
}

if (process.env.CLAUDE_API_KEY) {
  cfg = cfg.replace('__CLAUDE_API_KEY__', process.env.CLAUDE_API_KEY);
  console.log('Injected CLAUDE_API_KEY');
  changed = true;
} else {
  console.log('CLAUDE_API_KEY not set — skipping');
}

if (changed) {
  fs.writeFileSync('config.json', cfg, 'utf8');
  console.log('config.json updated');
} else {
  console.log('No env vars found — config.json unchanged');
}
"

echo "✅ Build complete"
