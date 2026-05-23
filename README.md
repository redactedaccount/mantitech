# MantiTech

A browser extension adding quality-of-life features to [Galactic Tycoons](https://galactictycoons.com).

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/mantitech/igkkhmeegfmbbboldmkefkokbjjfiaok) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/mantitech/).

---

## Features

### Exchange
- **Material notes** — attach a private note to any material's exchange page, visible next to the header
- **Buy/sell ledger** — view your full trade history for a material in one click (requires API key)
- **Min/Max quick-fill** — buttons on the order form instantly fill the price input with the current floor or ceiling
- **Cheapest offer indicator** — My Offers tab gains a Market Price column showing the current lowest offer, and a Lowest column that marks with ✅ when your price matches it (requires API key)

### Chat
- **Link previews** — URLs are automatically linkified; images render inline, YouTube and Suno links show a clickable thumbnail
- **GIF picker** — type `/tenor <search>` in any chat input to search and insert a GIF
- **Emoji picker** — an emoji button next to the send button opens a full emoji picker
- **Scroll indicator** — a "Scroll to latest" bar appears when you're not at the bottom of a chat
- **Mention autocomplete** — Tab selects the highlighted mention suggestion without needing the mouse

### Guild Pages
- **Link previews** — same linkify and inline image treatment as chat, applied to guild posts and feeds

### Wishlist
- **Copy to clipboard** — a copy button next to the wishlist edit button exports your wishlist as plain text

### Settings
- **Toggle features** — enable or disable individual features from the in-game Settings modal

---

## Installation

### Chrome
Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/mantitech/igkkhmeegfmbbboldmkefkokbjjfiaok).

### Firefox
Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/mantitech/).

---

## Manual Installation (latest version)

Store approvals can lag behind releases. If you want the most up-to-date version, you can load it directly from this repo.

### Chrome (manual)
1. Download the latest `.zip` from [Releases](../../releases) and unzip it, or clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the folder

To update, click the refresh icon on the extension card after pulling new changes.

### Firefox (manual)
Firefox requires a signed extension for permanent installation, but you can load it temporarily for testing:

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the extension folder and select `manifest.json`

Note: temporarily loaded extensions are removed when Firefox restarts. For a persistent manual install, use [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) or Nightly, which allow unsigned extensions via `about:config` → set `xpinstall.signatures.required` to `false`.

---

## API Key (optional)

Some features (the buy/sell ledger and cheapest offer indicator) require a GT API key. Get yours from **Settings → API keys** in-game, then open **Settings** and find the **MantiTech** section to enter it. Only **Limited** access is needed.

---

## Development

No build step required. Load the folder directly as an unpacked extension.

To package for Firefox:
```
web-ext build
```
