# iNaturalist Notifications Filter Version 1.4

A browser extension that fetches and displays your iNaturalist notifications with whitelist and blacklist filtering.

## Features

- Auto-fetches notifications when you load an iNaturalist page on `inaturalist.org` or `inaturalist.ca`
- Fetches unread notifications without marking them read on iNaturalist
- Animated loading icon: gray while waiting, animated while loading, green when notifications are ready
- Popup remains available while a refresh is running if notifications are already loaded
- Badge count shows loaded notifications that have not been opened or dismissed in the extension
- Whitelist filtering to show only matching notifications
- Blacklist filtering to hide matching notifications
- Filters match message text, observation ID, or notification URL
- Configurable fetch limits based on maximum pages scanned and minimum visible notifications after filters
- Optional hide-clicked behavior: opened notifications can be removed from the popup or left visible but dimmed
- Dismiss button for hiding a notification without opening it
- Purge button to clear all loaded notifications and start fresh
- Optional read/recovery mode for recently viewed observation updates from the iNaturalist API
- Backlog clearing action to mark unread notification batches read on iNaturalist

## Installation

### Firefox

1. Download the signed `.xpi`.
2. In Firefox browse to `about:addons`.
3. Click the gear button on the top right and select `Install Add-on from file...`.
4. Navigate to the downloaded `.xpi` file from step 1.

### Chrome

1. Download the entire folder `inat-notifications-chrome`.
2. Go to `chrome://extensions`.
3. Enable Developer mode using the top-right toggle.
4. Click `Load unpacked` and select the folder you downloaded in step 1.

Your extension should now be active.

## How to Use It

A gray leaf appears in your browser toolbar. When you visit iNaturalist, the extension fetches notifications and stores them for the current browser session. The icon turns green when notifications are ready.

Click the leaf to open the notification popup. Use the popup toggles to turn whitelist and blacklist filtering on or off. Click a notification to open it in a background tab.

## Settings

- **Notifications to fetch** - choose `Unread only`, `Read only (recovery)`, or `Unread + read`.
- **Unread only** - fetches unread iNaturalist notifications. This is the default mode.
- **Read only (recovery)** - fetches up to 200 recently viewed observation updates from the iNaturalist API. This is useful if notifications were marked read before you acted on them.
- **Unread + read** - combines normal unread fetching with read/recovery fetching.
- **Fetch limits** - set the maximum pages to scan, and the minimum number of visible notifications to try to collect after whitelist, blacklist, and hide-clicked filters are applied. Defaults are 10 pages and 25 visible notifications.
- **Display** - choose whether opening a notification removes it from the popup. If disabled, opened notifications remain visible but are dimmed.
- **Whitelist** - when enabled in the popup, only notifications matching at least one whitelist term are shown.
- **Blacklist** - when enabled in the popup, notifications matching any blacklist term are hidden. Can be combined with whitelist.
- **Clear unread backlog** - marks unread notification batches read on iNaturalist. It uses the maximum pages setting, with each page clearing up to 200 notifications.
- **Purge** - clears all currently loaded notifications and extension-side opened/dismissed tracking for the current browser session.

## Notes

- Normal fetching does not mark notifications read on iNaturalist. Use **Clear unread backlog** when you intentionally want to remove unread items from iNaturalist's notification list.
- Read/recovery mode currently includes comments and identifications on observations, but not @mentions.
- Filter-aware pagination applies to unread notification fetching. Read/recovery fetching uses one API request for up to 200 viewed updates.
- Loaded notifications and opened/dismissed tracking are stored in `chrome.storage.session`, so they are cleared when the browser session ends or when you purge notifications.
- Whitelist and blacklist terms are case-insensitive.
