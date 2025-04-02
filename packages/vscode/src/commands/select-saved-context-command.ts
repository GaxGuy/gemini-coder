import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { WorkspaceProvider } from '../context/providers/workspace-provider'

type SavedContext = {
  name: string
  paths: string[]
}

type GeminiCoderConfig = {
  savedContexts?: SavedContext[]
}

async function apply_saved_context(
  context: SavedContext,
  workspace_root: string,
  workspace_provider: WorkspaceProvider
): Promise<void> {
  // Convert relative paths to absolute paths
  const absolute_paths = context.paths.map((relative_path) =>
    path.isAbsolute(relative_path)
      ? relative_path
      : path.join(workspace_root, relative_path)
  )

  // Filter to only existing paths
  const existing_paths = absolute_paths.filter((p) => fs.existsSync(p))

  if (existing_paths.length == 0) {
    vscode.window.showWarningMessage(
      `No valid paths found in context "${context.name}".`
    )
    return
  }

  await workspace_provider.set_checked_files(existing_paths)
  vscode.window.showInformationMessage(`Applied context "${context.name}".`)
}

async function save_config(
  config_path: string,
  config: GeminiCoderConfig
): Promise<void> {
  try {
    const dirPath = path.dirname(config_path)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    fs.writeFileSync(config_path, JSON.stringify(config, null, 2), 'utf8')
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error saving config: ${error.message}`)
  }
}

export function select_saved_context_command(
  workspace_provider: WorkspaceProvider | undefined,
  on_context_selected: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'geminiCoder.selectSavedContext',
    async () => {
      if (!workspace_provider) {
        vscode.window.showErrorMessage('No workspace provider available')
        return
      }

      const workspace_root = workspace_provider.getWorkspaceRoot()
      const config_path = path.join(
        workspace_root,
        '.vscode',
        'gemini-coder.json'
      )

      // Check if the config file exists
      if (!fs.existsSync(config_path)) {
        vscode.window.showInformationMessage('No saved contexts found.')
        return
      }

      try {
        // Read the config file
        const config_content = fs.readFileSync(config_path, 'utf8')
        const config = JSON.parse(config_content) as GeminiCoderConfig

        if (!config.savedContexts || config.savedContexts.length == 0) {
          vscode.window.showInformationMessage('No saved contexts found.')
          return
        }

        // Define delete button
        const delete_button = {
          iconPath: new vscode.ThemeIcon('trash'),
          tooltip: 'Delete this saved context'
        }

        // Function to create quickpick items from contexts
        const createQuickPickItems = (contexts: SavedContext[]) => {
          return contexts.map((context) => ({
            label: context.name,
            description: `${context.paths.length} ${
              context.paths.length > 1 ? 'paths' : 'path'
            }`,
            context: context,
            buttons: [delete_button]
          }))
        }

        // Create QuickPick with buttons
        const quick_pick = vscode.window.createQuickPick()
        quick_pick.items = createQuickPickItems(config.savedContexts)
        quick_pick.placeholder = 'Select saved context'

        // Create a promise to be resolved when an item is picked or the quick pick is hidden
        const quick_pick_promise = new Promise<
          (vscode.QuickPickItem & { context: SavedContext }) | undefined
        >((resolve) => {
          quick_pick.onDidAccept(() => {
            const selectedItem = quick_pick
              .activeItems[0] as vscode.QuickPickItem & {
              context: SavedContext
            }
            quick_pick.hide()
            resolve(selectedItem)
          })

          quick_pick.onDidHide(() => {
            resolve(undefined)
          })

          quick_pick.onDidTriggerItemButton(async (event) => {
            const item = event.item as vscode.QuickPickItem & {
              context: SavedContext
            }
            const confirm_delete = await vscode.window.showWarningMessage(
              `Are you sure you want to delete context "${item.context.name}"?`,
              { modal: true },
              'Delete'
            )

            if (confirm_delete == 'Delete') {
              // Remove the context from the config
              if (config.savedContexts) {
                config.savedContexts = config.savedContexts.filter(
                  (c) => c.name != item.context.name
                )
                await save_config(config_path, config)
                vscode.window.showInformationMessage(
                  `Deleted context "${item.context.name}"`
                )

                // Update the quick pick items
                if (config.savedContexts.length == 0) {
                  quick_pick.hide()
                  vscode.window.showInformationMessage(
                    'No saved contexts remaining.'
                  )
                } else {
                  // Update items and ensure the quick pick stays visible
                  quick_pick.items = createQuickPickItems(config.savedContexts)
                  quick_pick.show() // Ensure quick pick is visible
                }
              }
            }
          })
        })

        quick_pick.show()
        const selected = await quick_pick_promise
        if (!selected) return

        await apply_saved_context(
          selected.context,
          workspace_root,
          workspace_provider
        )
        on_context_selected()
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error reading saved contexts: ${error.message}`
        )
      }
    }
  )
}
