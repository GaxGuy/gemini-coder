export interface ClipboardFile {
  file_path: string
  content: string
  workspace_name?: string
}

const extract_filename_from_comment = (line: string): string | null => {
  const stripped = line
    .trim()
    .replace(/^(\/\/|#|--|\/\*|\*)\s*/, '')
    .trim()

  const path_match = stripped.match(/(?:[\w\-\.\/]+\/)*[\w\-\.]+\.\w{1,10}/)
  if (path_match && path_match[0]) {
    return path_match[0]
  }

  return null
}

// Helper function to check if path starts with a workspace name and extract it
const extract_workspace_and_path = (
  file_path: string
): { workspace_name?: string; relative_path: string } => {
  // Check if the path might contain a workspace prefix (contains a slash)
  if (!file_path.includes('/')) {
    return { relative_path: file_path }
  }

  // Split by first slash to check for workspace prefix
  const first_slash_index = file_path.indexOf('/')
  if (first_slash_index > 0) {
    const possible_workspace = file_path.substring(0, first_slash_index)
    const rest_of_path = file_path.substring(first_slash_index + 1)

    // Return both the possible workspace name and the rest of the path
    return {
      workspace_name: possible_workspace,
      relative_path: rest_of_path
    }
  }

  return { relative_path: file_path }
}

export const parse_clipboard_multiple_files = (
  clipboard_text: string
): ClipboardFile[] => {
  const files: ClipboardFile[] = []

  // Use a state machine approach to track code blocks
  let state = 'TEXT' // States: TEXT, BLOCK_START, FILENAME, CONTENT, BLOCK_END
  let current_file_name = ''
  let current_content = ''
  let block_start_index = -1
  let is_first_content_line = false
  let current_workspace_name: string | undefined = undefined

  // Split text into lines for easier processing
  const lines = clipboard_text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for code block start
    if (state == 'TEXT' && line.trim().startsWith('```')) {
      state = 'BLOCK_START'
      block_start_index = i
      current_workspace_name = undefined // Reset workspace name for new block

      // Check if this line also contains the filename
      const name_match = line.match(/name=(?:"([^"]+)"|([^\s"]+))/)
      if (name_match) {
        // If quoted version was matched, use the first capture group
        // Otherwise use the second capture group
        current_file_name = (name_match[1] || name_match[2]).trim()

        // Check if file path starts with a workspace name
        const { workspace_name, relative_path } =
          extract_workspace_and_path(current_file_name)
        if (workspace_name) {
          current_workspace_name = workspace_name
          current_file_name = relative_path // Store just the relative path
        }

        state = 'CONTENT' // Skip filename state
        current_content = '' // Start with empty content
        is_first_content_line = true
        continue
      }
    }
    // Look for filename in next line after block start
    else if (state == 'BLOCK_START') {
      const name_match = line.match(/name=(?:"([^"]+)"|([^\s"]+))/)
      if (name_match) {
        // If quoted version was matched, use the first capture group
        // Otherwise use the second capture group
        current_file_name = (name_match[1] || name_match[2]).trim()

        // Check if file path starts with a workspace name
        const { workspace_name, relative_path } =
          extract_workspace_and_path(current_file_name)
        if (workspace_name) {
          current_workspace_name = workspace_name
          current_file_name = relative_path // Store just the relative path
        }

        state = 'CONTENT'
        current_content = '' // Start with empty content
        is_first_content_line = true
      } else {
        // If no filename found, this is not a file block, go back to TEXT state
        state = 'TEXT'
      }
    }
    // Collect content lines
    else if (state == 'CONTENT') {
      // Check if line is end of code block
      if (line.trim() == '```') {
        // We've found the end of the block
        state = 'TEXT'

        // Add the collected file if we have a valid filename
        if (current_file_name) {
          files.push({
            file_path: current_file_name,
            content: current_content,
            workspace_name: current_workspace_name // Store workspace name if available
          })
        }

        // Reset state variables
        current_file_name = ''
        current_content = ''
        block_start_index = -1
        is_first_content_line = false
        current_workspace_name = undefined
      } else {
        // Check if we're on the first content line and it might contain a filename in a comment
        if (is_first_content_line && !current_file_name) {
          // Try to extract filename from comments
          if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
            const extracted_filename = extract_filename_from_comment(line)
            if (extracted_filename) {
              // Check if extracted filename contains workspace prefix
              const { workspace_name, relative_path } =
                extract_workspace_and_path(extracted_filename)
              current_file_name = relative_path
              if (workspace_name) {
                current_workspace_name = workspace_name
              }

              // Don't include the comment line in the content
              is_first_content_line = false
              continue
            }
          }
        }

        // We're not on first line anymore for subsequent iterations
        is_first_content_line = false

        // Add to content
        if (current_content) {
          // Add newline before appending next line
          current_content += '\n' + line
        } else {
          // First line doesn't need a preceding newline
          current_content = line
        }
      }
    }
  }

  // Handle edge case: last file in clipboard doesn't have closing ```
  if (state == 'CONTENT' && current_file_name) {
    // Add what we've collected so far
    files.push({
      file_path: current_file_name,
      content: current_content,
      workspace_name: current_workspace_name
    })
  }

  return files
}

export const is_multiple_files_clipboard = (clipboardText: string): boolean => {
  // Check for standard format with name= attribute
  const file_block_regex = /```(\w+)?\s*name=(?:"[^"]+"|[^\s"]+)/g

  // Also check for code blocks that might have filename comments
  const code_block_regex = /```(\w+)?[\s\S]*?```/g

  // Check for standard format first
  let match_count = 0
  let match

  while ((match = file_block_regex.exec(clipboardText)) !== null) {
    match_count++
    if (match_count >= 1) {
      return true
    }
  }

  // If standard format not found, check for code blocks with potential comment filenames
  const code_blocks = [...clipboardText.matchAll(code_block_regex)]

  for (const block of code_blocks) {
    if (block[0]) {
      const lines = block[0].split('\n')
      // Skip first line (```language)
      if (lines.length > 1) {
        // Check if second line looks like a comment with filename
        const secondLine = lines[1].trim()
        if (
          (secondLine.startsWith('//') ||
            secondLine.startsWith('#') ||
            secondLine.startsWith('/*') ||
            secondLine.startsWith('*')) &&
          extract_filename_from_comment(secondLine)
        ) {
          return true
        }
      }
    }
  }

  return false
}
