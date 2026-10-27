# Store assets

Three Store-ready screenshots:

- `screenshot-1.png`: product overview and architecture.
- `screenshot-2.png`: output and coverage example.
- `screenshot-3.png`: approved pricing.

The PNG files are 1600x900.

To regenerate them:

1. Start `node serve.mjs`.
2. Open each `screenshot-*.html` at `http://127.0.0.1:8765/`.
3. Capture a 1600x900 viewport with Playwright and overwrite the PNG.

Source HTML is kept so copy and visual structure can be updated without image-editing tools.
