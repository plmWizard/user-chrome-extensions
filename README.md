# README

## ✨ Features

### 1) Add extra action buttons (or edit hooks) to specific tabs

To enable additional actions for a tab, open the **Script Description** and add a config block like:

```txt
{tab: TAB_NAME, mode: MODE_TYPE}
```

#### Supported tabs (`TAB_NAME`)
- `itemDetails`
- `grid`
- `bom`
- `attachments`
- `project-management`

#### Supported modes (`MODE_TYPE`)
- `button`
- `onEdit`

---

#### ✅ Mode: `button`

If you use `button`, you can also define a button color and label:

```txt
[color: COLORHEX, name: BUTTON_NAME]
```

**Example**
```txt
{tab: grid, mode: button[color: #FF8000, name: Create Tasks]}
```

---

#### ✅ Mode: `onEdit`

Runs an additional action **after saving** (after grid `addRow` or `edit`).

**Example**
```txt
{tab: grid, mode: onEdit}
```

> **Note:** `onEdit` currently only works for **grid tabs**, and it triggers **after save**.

---

### 2) Change workspace header colors

To set a custom header color for a workspace:

1. Open **Workspace Settings**
2. Edit the **Workspace Description**
3. Add:

```txt
{color: COLORHEX}
```

**Example**
```txt
{color: #06402B}
```
