import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { WorkspaceProvider } from '../context/providers/workspace-provider'
import { should_ignore_file } from '../context/utils/extension-utils'
import { ignored_extensions } from '../context/constants/ignored-extensions'

type SavedContext = {
  name: string
  paths: string[]
}

type ConfigStructure = {
  savedContexts?: SavedContext[]
}

// Improved function to properly condense paths
function condense_paths(
  paths: string[],
  workspace_root: string,
  workspace_provider: WorkspaceProvider
): string[] {
  // Convert absolute paths to relative paths and create a Set for fast lookup
  const relative_paths = paths.map((p) => path.relative(workspace_root, p))
  const selected_paths_set = new Set(relative_paths)

  // Group paths by their parent directories
  const dir_to_children: Map<string, string[]> = new Map()

  for (const rel_path of relative_paths) {
    const parent_dir = path.dirname(rel_path)
    if (!dir_to_children.has(parent_dir)) {
      dir_to_children.set(parent_dir, [])
    }
    dir_to_children.get(parent_dir)!.push(rel_path)
  }

  // Function to check if all files in a directory are selected (excluding ignored files)
  function are_all_files_selected(dir_path: string): boolean {
    try {
      // First check if the directory itself is already selected
      if (selected_paths_set.has(dir_path)) {
        return true
      }

      // Check if directory exists
      const abs_dir_path = path.join(workspace_root, dir_path)
      if (
        !fs.existsSync(abs_dir_path) ||
        !fs.lstatSync(abs_dir_path).isDirectory()
      ) {
        return false
      }

      // Get all files in this directory
      const all_entries = fs.readdirSync(abs_dir_path)

      for (const entry of all_entries) {
        const entry_path = path.join(dir_path, entry)
        const abs_entry_path = path.join(workspace_root, entry_path)

        // Skip files/directories that are excluded by gitignore
        const relative_entry_path = path.relative(
          workspace_root,
          abs_entry_path
        )
        if (workspace_provider.is_excluded(relative_entry_path)) {
          continue
        }

        // Skip files with ignored extensions
        if (
          !fs.lstatSync(abs_entry_path).isDirectory() &&
          should_ignore_file(entry, new Set(ignored_extensions))
        ) {
          continue
        }

        if (fs.lstatSync(abs_entry_path).isDirectory()) {
          // If it's a directory, check if all its files are selected
          if (!are_all_files_selected(entry_path)) {
            return false
          }
        } else {
          // If it's a file, check if it's selected
          if (!selected_paths_set.has(entry_path)) {
            return false
          }
        }
      }

      return true
    } catch (error) {
      console.error(`Error checking directory ${dir_path}:`, error)
      return false
    }
  }

  // Start with all paths and remove those that are covered by directories
  const condensed_paths = new Set(relative_paths)

  // Check directories starting from the DEEPEST level (changed sorting order)
  const directories = Array.from(dir_to_children.keys())
  directories.sort(
    (a, b) => b.split(path.sep).length - a.split(path.sep).length
  )

  for (const dir of directories) {
    // Skip "." as it represents the workspace root itself
    if (dir == '.') continue

    if (are_all_files_selected(dir)) {
      // Remove all individual files in this directory from the result
      for (const file of dir_to_children.get(dir)!) {
        condensed_paths.delete(file)
      }

      // Add the directory itself
      condensed_paths.add(dir)

      // Also remove any subdirectories that might have been added
      for (const p of Array.from(condensed_paths)) {
        if (p.startsWith(dir + path.sep)) {
          condensed_paths.delete(p)
        }
      }
    }
  }

  return Array.from(condensed_paths)
}

// Function to check if two path arrays have the same content regardless of order
function arePathsEqual(paths1: string[], paths2: string[]): boolean {
  if (paths1.length != paths2.length) return false

  const set1 = new Set(paths1)
  return paths2.every((path) => set1.has(path))
}

export function save_context_command(
  workspace_provider: WorkspaceProvider | undefined
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'geminiCoder.saveContext',
    async () => {
      if (!workspace_provider) {
        vscode.window.showErrorMessage(
          'Workspace provider is not available. Cannot save context.'
        )
        return
      }

      const workspace_root = workspace_provider.getWorkspaceRoot()
      if (!workspace_root) {
        vscode.window.showErrorMessage(
          'No workspace folder found. Cannot save context.'
        )
        return
      }

      const checked_files = workspace_provider.get_checked_files()
      if (checked_files.length == 0) {
        vscode.window.showWarningMessage(
          'There is nothing to save.'
        )
        return
      }

      const config_dir = path.join(workspace_root, '.vscode')
      const config_file_path = path.join(config_dir, 'gemini-coder.json')
      let config: ConfigStructure = { savedContexts: [] }

      try {
        // Ensure .vscode directory exists
        if (!fs.existsSync(config_dir)) {
          await fs.promises.mkdir(config_dir, { recursive: true })
        }

        // Read existing config file if it exists
        if (fs.existsSync(config_file_path)) {
          const file_content = await fs.promises.readFile(
            config_file_path,
            'utf-8'
          )
          try {
            const parsed_config = JSON.parse(file_content)
            // Basic validation
            if (
              typeof parsed_config == 'object' &&
              parsed_config !== null &&
              (parsed_config.savedContexts === undefined ||
                Array.isArray(parsed_config.savedContexts))
            ) {
              config = parsed_config
              if (!config.savedContexts) {
                config.savedContexts = []
              }
            } else {
              vscode.window.showErrorMessage(
                `Invalid format in ${config_file_path}. It will be overwritten.`
              )
            }
          } catch (parse_error) {
            vscode.window.showErrorMessage(
              `Error parsing ${config_file_path}: ${parse_error}. It will be overwritten.`
            )
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error accessing configuration file: ${error}`
        )
        return
      }

      // Use the condense_paths function to generate a more compact list
      const condensed_paths = condense_paths(
        checked_files,
        workspace_root,
        workspace_provider
      )

      // Check if there's already a context with identical paths
      if (config.savedContexts && config.savedContexts.length > 0) {
        for (const existingContext of config.savedContexts) {
          if (arePathsEqual(existingContext.paths, condensed_paths)) {
            vscode.window.showInformationMessage(
              `A context with identical paths already exists: "${existingContext.name}"`
            )
            return // Return early
          }
        }
      }

      // Get existing context names
      const existing_context_names = config.savedContexts!.map(
        (ctx) => ctx.name
      )

      // Create quick pick items
      const quick_pick_items = [
        {
          label: '$(add) Create new...'
        },
        ...existing_context_names.map((name) => ({
          label: name
        }))
      ]

      let context_name: string | undefined

      // Show quick pick with existing contexts and option to create new
      const selected_item = await vscode.window.showQuickPick(
        quick_pick_items,
        {
          placeHolder: 'Select existing context to overwrite or create new one'
        }
      )

      if (!selected_item) {
        return // User cancelled
      }

      if (selected_item.label == '$(add) Create new...') {
        // User wants to create a new context
        context_name = await vscode.window.showInputBox({
          prompt: 'Enter a name for this context',
          placeHolder: 'e.g., Backend API Context'
        })

        if (!context_name) {
          return // User cancelled
        }

        // Check if the name conflicts with existing one
        if (existing_context_names.includes(context_name)) {
          const overwrite = await vscode.window.showWarningMessage(
            `A context named "${context_name}" already exists. Overwrite?`,
            { modal: true },
            'Overwrite'
          )
          if (overwrite !== 'Overwrite') {
            return // User chose not to overwrite
          }
        }
      } else {
        // User selected an existing context to overwrite
        context_name = selected_item.label
      }

      const new_context: SavedContext = {
        name: context_name,
        paths: condensed_paths
      }

      const existing_index = config.savedContexts!.findIndex(
        (ctx) => ctx.name == context_name
      )

      if (existing_index != -1) {
        // Replace existing context
        config.savedContexts![existing_index] = new_context
      } else {
        // Add new context
        config.savedContexts!.push(new_context)
      }

      // Sort contexts alphabetically by name
      config.savedContexts!.sort((a, b) => a.name.localeCompare(b.name))

      try {
        // Write the updated config back to the file
        await fs.promises.writeFile(
          config_file_path,
          JSON.stringify(config, null, 2), // Pretty print JSON
          'utf-8'
        )
        vscode.window.showInformationMessage(
          `Context "${context_name}" saved successfully.`
        )
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving context: ${error}`)
      }
    }
  )
}
