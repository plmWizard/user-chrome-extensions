# Fusion Manage – Second Tabs (Chrome Extension)

This extension adds productivity features to **Autodesk Fusion Manage** (`*.autodeskplm360.net`) such as second tabs, script action buttons, on-edit automation, workspace color themes, search overlay, required-field highlighting, item context badge, scroll-to-top quick button, and optional logo override.

---

## How it works

The extension injects content scripts on Fusion Manage pages and reads settings from `chrome.storage.sync`.

- **Global feature toggles** are controlled from the extension **Options** page.
- **Item-level behavior** (action buttons and on-edit hooks) is controlled by metadata placed in Fusion script display names/descriptions.
- **Workspace-level behavior** (header colors) is controlled by metadata placed in workspace descriptions.

---

## All settings (Options page)

Open settings via:
- `chrome://extensions` → find **Fusion Manage – Second Tabs** → **Details** → **Extension options**
- or right-click extension icon (if pinned) → **Options**

### 1) Second Tabs (`secondTabs`)
- **Default:** `ON`
- **What it does:** Renders a second row of tabs under native item tabs and loads configured URLs in an iframe.

### 2) Search Overlay (`searchOverlay`)
- **Default:** `ON`
- **What it does:** On workspace item-list pages (`/plm/workspaces/{id}/items`), finds a view/tableau containing “Search” in the name and opens a searchable overlay grid.

### 3) Action Buttons (`actionButtons`)
- **Default:** `ON`
- **What it does:** Adds script-driven buttons to supported item tabs when a script contains `mode: button` metadata.

### 4) On-Edit Runner (`onEditRunner`)
- **Default:** `ON`
- **What it does:** Runs scripts tagged `mode: onEdit`:
  - when URL transitions from `mode=edit` to `mode=view` on same tab
  - after successful writes to BOM and attachment APIs

### 5) Workspace Header Colors (`workspaceColors`)
- **Default:** `ON`
- **What it does:** Reads `{color: #RRGGBB}` from workspace description and applies themed CSS variables to headers and related UI colors.

### 6) Custom Logo Image URL (`customLogoUrl`)
- **Default:** empty
- **What it does:** Replaces Fusion logo image when a valid `http/https` URL is provided.

### 7) Custom Logo Click URL (`customLogoClickUrl`)
- **Default:** empty
- **What it does:** Optional custom destination when users click the logo.
- If empty/invalid, default Fusion behavior remains.

### 8) Item Context Badge (`itemContextBadge`)
- **Default:** `ON`
- **What it does:** On item pages, shows a compact floating badge with workspace/item IDs and a one-click copy action.

### 9) Scroll To Top Button (`scrollToTopButton`)
- **Default:** `ON`
- **What it does:** Shows a floating button on long pages so users can quickly jump back to the top.

### 10) DMS Bulk Copy/Add Tools (`dmsBulkTools`)
- **Default:** `ON`
- **What it does:**
  - On workspace item-list pages (`/plm/workspaces/{id}/items`), shows a floating panel where you can select multiple detected rows and copy their dmsIDs.
  - On BOM nested tab pages (`/items/bom/nested?view=full&tab=bom...`), lets you paste/load copied dmsIDs and add them to BOM with API calls.
  - On affected items pages (`/items/affectedItems?...`), lets you paste/load copied dmsIDs and add them as affected workflow items.

> Notes:
> - Settings are saved automatically as you toggle/type.
> - If a change does not apply immediately, refresh Fusion Manage.

---

## Script metadata configuration (Action Buttons / On-Edit)

To enable tab-specific script behavior, add metadata in the script display name/description using this format:

```txt
{tab: TAB_NAME, mode: MODE_TYPE}
```

### Supported `tab` values
- `itemDetails`
- `grid`
- `bom`
- `attachments`
- `project-management`
- `workflowMap` (URL token support)

### Supported `mode` values
- `button`
- `onEdit`

### Button mode options
When `mode: button` is used, optional bracket settings are supported:

```txt
[color: #FF8000, name: Create Tasks]
```

Full example:

```txt
{tab: grid, mode: button[color: #FF8000, name: Create Tasks]}
```

### On-edit mode example

```txt
{tab: grid, mode: onEdit}
```

---

## Workspace color configuration

In **Workspace Settings → Workspace Description**, include:

```txt
{color: #06402B}
```

The extension detects the hex color and applies derived theme shades automatically.

---

## Additional built-in behavior

- **Required fields helper:** Empty required fields are visually highlighted on item detail forms.
- **Logo override safety:** If logo URL is empty/invalid, original logo/link is restored.

---

## Download / install locally in Chrome (developer mode)

### Option A: Load unpacked (recommended for development)
1. Download this repository as ZIP and extract it, or clone it.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the project folder containing `manifest.json`.
6. Open/reload Fusion Manage.

### Option B: Create a `.crx` package (manual distribution)
1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Pack extension**.
4. Extension root directory: select this project folder.
5. (Optional) Provide a private key to keep extension ID stable across builds.
6. Chrome outputs a `.crx` and `.pem`.

---

## Upload to Chrome Web Store

1. Prepare a clean release build of the extension folder.
2. Zip extension contents (the folder with `manifest.json` at root).
3. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
4. Create a new item and upload the ZIP.
5. Fill listing details, screenshots, privacy/compliance, and permissions justification.
6. Submit for review and publish.

> Tip: Keep version in `manifest.json` updated for each new upload.

---

## Host permissions and scope

The extension runs on:
- `https://*.autodeskplm360.net/*`

Core item scripts target:
- `https://*.autodeskplm360.net/plm/workspaces/*/items/*`

---

## Troubleshooting

- **No visible change:** Ensure feature toggle is enabled in Options and refresh page.
- **Buttons not showing:** Confirm script metadata contains valid `{tab: ..., mode: button...}`.
- **On-edit not firing:** Verify `mode: onEdit` and supported tab/write flow.
- **Logo not replaced:** Ensure `customLogoUrl` is a valid public `http/https` image URL.
- **Search overlay not available:** Ensure current page is a workspace item list page and a “Search” view exists.
