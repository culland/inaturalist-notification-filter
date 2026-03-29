# iNaturalist Notifications Filter Version 1.3

A browser extension that fetches and displays your iNaturalist notifications with whitelist filtering.

## Features
- Auto-fetches notifications on iNaturalist page load
- Animated loading icon (gray while loading, green when ready)
- Badge count showing new notifications since last popup open
- Whitelist filtering by message text or observation ID
- Settings page for whitelist and page count configuration
- Purge button to clear all notifications and start fresh

## Installation

### Firefox
1. Download the signed `.xpi`
2. In Firefox brows to `about:addons`
3. Click gear button on top right and select `Install Add-on from file...`
4. Navigate to the downloaded xpi file from step 1.

### Chrome
1. Download the entire folder `inat-notifications-chrome`
2. Go to `chrome://extensions`
3. Enable Developer mode (top right toggle)
4. Click Load unpacked (top left) → select the folder you downloaded in step 1

Your extension should now be active!

## How to Use It
A grey leaf will appear in the notification section of your browser. When iNaturalist.ca or iNaturalist.org are visited the extension will download notifications, and will add to the notifications every time iNaturalist is refreshed. When the leaf is green, click to see notifications and settings option.

## Settings
- **Pages to fetch** — number of pages × 200 notifications per fetch (default: 2)
- **Whitelist** — filter notifications by message text or observation ID (OR logic, case-insensitive)
- **Purge** — clear all loaded notifications and start fresh

## Notes
- Extension built for Firefox and ported to Chrome.
