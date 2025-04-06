import browser from 'webextension-polyfill'

const allowedHosts = [
  'aistudio.google.com',
  'gemini.google.com',
  'chatgpt.com',
  'claude.ai',
  'github.com',
  'deepseek.com',
 'mistral.ai',
 'grok.com'
];

function isAllowedHost(url, host) {
  return url.host === host;
}
import { Chat } from '@shared/types/websocket-message'
import { inject_apply_changes_buttons } from './inject-apply-changes-buttons'

// In case it changes before finding textarea element (e.g. in mobile AI Studio, when changing model)
const current_url = new URL(window.location.href)

// Extract batch ID from URL hash if available
const hash = window.location.hash
const hash_prefix = '#gemini-coder'
const is_gemini_coder_hash = hash.startsWith(hash_prefix)
const batch_id = is_gemini_coder_hash
  ? hash.substring(hash_prefix.length + 1) || 'default'
  : ''

const ai_studio_url =
  'https://aistudio.google.com/prompts/new_chat#gemini-coder'
const is_ai_studio = isAllowedHost(current_url, 'aistudio.google.com')

const gemini_url = 'https://gemini.google.com/app#gemini-coder'
const is_gemini = isAllowedHost(current_url, 'gemini.google.com')

const chatgpt_url = 'https://chatgpt.com/#gemini-coder'
const is_chatgpt = isAllowedHost(current_url, 'chatgpt.com')

const claude_url = 'https://claude.ai/new#gemini-coder'
const is_claude = isAllowedHost(current_url, 'claude.ai')

const github_copilot_url = 'https://github.com/copilot#gemini-coder'
const is_github_copilot = isAllowedHost(current_url, 'github.com')

const deepseek_url = 'https://chat.deepseek.com/#gemini-coder'
const is_deepseek = isAllowedHost(current_url, 'deepseek.com')

const mistral_url = 'https://chat.mistral.ai/chat#gemini-coder'
const is_mistral = isAllowedHost(current_url, 'mistral.ai')

const grok_url = 'https://grok.com/#gemini-coder'
const is_grok = isAllowedHost(current_url, 'grok.com')

// No need for special handling
// const huggingchat_url = 'https://huggingface.co/chat/'
// const is_huggingchat = current_url == huggingchat_url

const is_open_webui = document.title.includes('Open WebUI')

export const get_textarea_element = () => {
  const chatbot_selectors = {
    [ai_studio_url]: 'footer textarea',
    [gemini_url]: 'div[contenteditable="true"]',
    [chatgpt_url]: 'div#prompt-textarea',
    [claude_url]: 'div[contenteditable=true]',
    [github_copilot_url]: 'textarea#copilot-chat-textarea',
    [deepseek_url]: 'textarea',
    [mistral_url]: 'textarea'
  } as any

  // Find the appropriate selector based on the URL without the hash
  let selector = null
  for (const [url, sel] of Object.entries(chatbot_selectors)) {
    if (current_url.includes(url.split('#')[0])) {
      selector = sel
      break
    }
  }

  const active_element = selector
    ? (document.querySelector(selector as string) as HTMLElement)
    : (document.activeElement as HTMLElement)
  return active_element
}

const enter_message_and_send = async (params: {
  input_element: HTMLElement | null
  message: string
}) => {
  if (params.input_element && params.input_element.isContentEditable) {
    // Handle contenteditable element
    params.input_element.innerText = params.message
    // Dispatch input and change events
    params.input_element.dispatchEvent(new Event('input', { bubbles: true }))
    params.input_element.dispatchEvent(new Event('change', { bubbles: true }))
    const form = params.input_element.closest('form')
    if (is_claude) {
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 500)
      })
      ;(
        document.querySelector(
          'fieldset button.bg-accent-main-000'
        ) as HTMLElement
      ).click()
    } else if (form) {
      requestAnimationFrame(() => {
        form.requestSubmit()
      })
    } else {
      const enter_event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      })
      params.input_element.dispatchEvent(enter_event)
    }
  } else if (
    params.input_element &&
    params.input_element.tagName == 'TEXTAREA'
  ) {
    // Handle input or textarea element
    ;(params.input_element as HTMLTextAreaElement).value = params.message
    // Dispatch input and change events
    params.input_element.dispatchEvent(new Event('input', { bubbles: true }))
    params.input_element.dispatchEvent(new Event('change', { bubbles: true }))
    const form = params.input_element.closest('form')
    if (form && !is_github_copilot) {
      requestAnimationFrame(() => {
        form.requestSubmit()
      })
    } else if (is_ai_studio) {
      requestAnimationFrame(() => {
        ;(document.querySelector('run-button > button') as HTMLElement)?.click()
      })
    } else {
      const enter_event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      })
      params.input_element.dispatchEvent(enter_event)
    }
  }
}

const enter_system_instructions = async (system_instructions: string) => {
  if (is_ai_studio) {
    const system_instructions_selector =
      'textarea[aria-label="System instructions"]'
    const system_instructions_element = document.querySelector(
      system_instructions_selector
    ) as HTMLTextAreaElement
    if (system_instructions_element) {
      system_instructions_element.value = system_instructions
      system_instructions_element.dispatchEvent(
        new Event('input', { bubbles: true })
      )
      system_instructions_element.dispatchEvent(
        new Event('change', { bubbles: true })
      )
    } else {
      // click on button aria-label="Collapse all System Instructions" then proceed as above
      const collapse_button = document.querySelector(
        'button[aria-label="Collapse all System Instructions"]'
      ) as HTMLElement
      if (collapse_button) {
        collapse_button.click()
        // wait for animation frame, inline with resolve
        await new Promise((r) => requestAnimationFrame(r))

        const system_instructions_element = document.querySelector(
          system_instructions_selector
        ) as HTMLTextAreaElement
        if (system_instructions_element) {
          system_instructions_element.value = system_instructions
          system_instructions_element.dispatchEvent(
            new Event('input', { bubbles: true })
          )
          system_instructions_element.dispatchEvent(
            new Event('change', { bubbles: true })
          )
        }
      }
    }
  }
}

const set_temperature = async (temperature: number) => {
  if (is_ai_studio) {
    const temperature_selector = 'ms-prompt-run-settings input[type=number]'
    const temperature_element = document.querySelector(
      temperature_selector
    ) as HTMLInputElement
    temperature_element.value = temperature.toString()
    temperature_element.dispatchEvent(new Event('input', { bubbles: true }))
    temperature_element.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

const set_model = async (model: string) => {
  if (is_ai_studio) {
    const model_selector_trigger = document.querySelector(
      'ms-model-selector mat-form-field > div'
    ) as HTMLElement
    model_selector_trigger.click()

    await new Promise((r) => requestAnimationFrame(r))

    const model_options = Array.from(document.querySelectorAll('mat-option'))
    for (const option of model_options) {
      const model_name_element = option.querySelector(
        'ms-model-option > div:last-child'
      ) as HTMLElement
      if (model_name_element?.textContent?.trim() == model) {
        ;(option as HTMLElement).click()
        break
      }
    }
  } else if (is_github_copilot) {
    // Map model identifiers to displayed text
    const model_map: Record<string, string> = {
      '4o': 'GPT-4o',
      o1: 'o1',
      'o3-mini': 'o3-mini',
      'sonnet-3.5': 'Claude 3.5 Sonnet',
      'sonnet-3.7': 'Claude 3.7 Sonnet',
      'sonnet-3.7-thinking': 'Claude 3.7 Sonnet Thinking',
      'gemini-2.0-flash': 'Gemini 2.0 Flash'
    }

    // Only proceed if the model exists in our map
    if (model && model in model_map) {
      const model_selector_trigger = document.querySelector(
        'button[aria-label="Switch model"]'
      ) as HTMLButtonElement
      model_selector_trigger.click()

      await new Promise((r) => requestAnimationFrame(r))

      // Find all model option elements
      const model_options = Array.from(
        document.querySelectorAll('li[role="menuitemradio"]')
      )

      // Find the option with the matching text
      for (const option of model_options) {
        const label_element = option.querySelector('[class*="ItemLabel"]')
        if (label_element && label_element.textContent == model_map[model]) {
          ;(option as HTMLElement).click()
          await new Promise((r) => requestAnimationFrame(r))
          break
        }
      }
    } else if (model) {
      console.warn(`Model "${model}" not found in model map for GitHub Copilot`)
    }
  }
}

const enable_canvas_mode = async () => {
  if (is_gemini) {
    const canvas_button = document.querySelector(
      'toolbox-drawer mat-icon[data-mat-icon-name="edit_note"]'
    ) as HTMLElement
    if (canvas_button) {
      canvas_button.click()
    } else {
      console.warn('Canvas button not found')
    }
  }
}

const initialize_chat = async (params: { message: string; chat: Chat }) => {
  if (params.chat.system_instructions) {
    await enter_system_instructions(params.chat.system_instructions)
  }
  if (params.chat.model) {
    await set_model(params.chat.model)
  }
  if (params.chat.temperature) {
    await set_temperature(params.chat.temperature)
  }

  // Check for canvas option and enable it if necessary
  if (params.chat.options && params.chat.options.includes('canvas')) {
    await enable_canvas_mode()
  }

  enter_message_and_send({
    input_element: get_textarea_element(),
    message: params.message
  })

  // Process next chat from the queue
  browser.runtime.sendMessage({
    action: 'chat-initialized'
  })
}

const main = async () => {
  if (!is_gemini_coder_hash) return

  // Remove the hash from the URL to avoid reloading the content script if the page is refreshed
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  )

  // Get the message using the batch ID from the hash
  const storage_key = `chat-init:${batch_id}`
  const storage = await browser.storage.local.get(storage_key)
  const stored_data = storage[storage_key] as {
    text: string
    current_chat: Chat
    client_id: number
  }

  if (!stored_data) {
    console.error('Chat initialization data not found for batch ID:', batch_id)
    return
  }

  // Now directly use the current_chat instead of searching for it
  const message_text = stored_data.text
  const current_chat = stored_data.current_chat

  if (!current_chat) {
    console.error('Chat configuration not found')
    return
  }

  // Quirks mitigation
  if (is_ai_studio) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('.title-container')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 500)
    })
  } else if (is_gemini) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('toolbox-drawer')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
  } else if (is_chatgpt) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('span[data-radix-focus-guard]')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
    const reason_button = document.querySelector('button[aria-label="Reason"]')
    ;(reason_button as HTMLButtonElement)?.click()
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 100)
    })
  } else if (is_claude) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('fieldset')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
  } else if (is_github_copilot) {
    await new Promise((resolve) => {
      const check_for_model_selector = () => {
        const model_button = Array.from(
          document.querySelectorAll('button')
        ).find((button) => {
          const button_text = button.textContent?.trim() || ''
          return button_text.startsWith('Model:')
        })

        if (model_button) {
          resolve(null)
        } else {
          setTimeout(check_for_model_selector, 100)
        }
      }
      check_for_model_selector()
    })
  } else if (is_mistral) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 500)
    })
  } else if (is_open_webui) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('img[src="/static/favicon.png"]')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
  } else if (is_deepseek) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 500)
    })
  } else if (is_grok) {
    await new Promise(async (resolve) => {
      while (!document.querySelector('textarea')) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 100)
        })
      }
      resolve(null)
    })
  }

  await initialize_chat({
    message: message_text,
    chat: current_chat
  })

  // Clean up the storage entry after using it
  await browser.storage.local.remove(storage_key)

  inject_apply_changes_buttons({
    client_id: stored_data.client_id,
    is_ai_studio
  })
}

if (document.readyState == 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
