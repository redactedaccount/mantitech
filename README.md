# MantiTech

A browser extension adding quality-of-life features to [Galactic Tycoons](https://galactictycoons.com).

Available on the [Chrome Web Store](#) and [Firefox Add-ons](#).

---

## Features

### Exchange
- **Material notes** — attach a private note to any material's exchange page, visible next to the header
- **Buy/sell ledger** — view your full trade history for a material in one click (requires API key)

### Chat
- **Link previews** — URLs are automatically linkified; images render inline, YouTube and Suno links show a clickable thumbnail
- **GIF picker** — type `/tenor <search>` in any chat input to search and insert a GIF
- **Emoji picker** — an emoji button next to the send button opens a full emoji picker
- **Scroll indicator** — a "Scroll to latest" bar appears when you're not at the bottom of a chat

---

## Installation

### Chrome
1. Download the latest `.zip` from [Releases](../../releases)
2. Unzip it
3. Go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

Or install directly from the [Chrome Web Store](#).

### Firefox
Install from [Firefox Add-ons](#).

---

## API Key (optional)

Some features (the buy/sell ledger) require a GT API key. Get yours from **Settings → API** in-game, then click the ledger button on any exchange page to enter it.

---

## Development

No build step required. Load the folder directly as an unpacked extension.

To package for Firefox:
```
web-ext build
```
