# KeyDrop identity

Drop means drag-and-drop: handing keys to an agent, not a water droplet.

The mark is a clipboard holding three horizontal black keys. Each retains a circular bow with an OpenAI, Claude or Gemini symbol inside; small, distinct teeth express multiple keys. Keys are aligned and equally spaced. No accent color is added to the artwork or page badge.

- Canonical master: `keydrop-mark.svg`, editable vector geometry with embedded paths and license notice. No linked resources, fonts or scripts.
- `keydrop-mark.png` is a generated compatibility export, not another editable master.
- Build: `cd chrome && npm run build:assets`. Generates every toolbar size, editor artwork and page-badge pixels from the SVG without network requests.
- Toolbar/editor icons use white backing for visibility on dark browser chrome.
- Page action: Canvas draws bundled pixels, without image URLs or website CSP exceptions.
- Model icon paths: [Lobe Icons](https://github.com/lobehub/lobe-icons), MIT; see `LOBE-ICONS-LICENSE.txt`, also shipped with extension assets.
- UI icons: Tabler Icons (MIT), bundled at build time with their license.

Model names and marks identify their respective providers. This is not an official joint logo or endorsement. The icon library license is not a trademark clearance claim.
