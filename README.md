Features: 
1. To add additional action buttons in specific tabs go to script description and write: 
{tab: tabName, mode: modeType}

TabNames: itemDetails, grid, bom, attachments, project-management
Modes: button or onEdit
If button add [color: COLORHEX, name: NAME OF BUTTON ]
E.g: 
{tab: grid, mode: button[color: #FF8000, name: Create Tasks]}
{tab: grid, mode: onEdit}

**** NOTE: onEdit currently only works for grid tabs and runs an additional actions after save (after grid addRow or edit)

2. To change colors of workspace headers go to workspace settings and description and add:
{color: COLORHEX}
E.g:
{color: #06402B}
