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

<img width="875" height="139" alt="bilde" src="https://github.com/user-attachments/assets/e023881c-37c3-4dc4-a616-65d1a20d3562" />

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
<img width="631" height="134" alt="bilde" src="https://github.com/user-attachments/assets/3726b3e6-ac84-44df-b4b0-da5a1a61ebc5" />
