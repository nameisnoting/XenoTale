// Native input blocks can share a provider message. JSON.stringify escapes
// newlines inside each block; the blank line between blocks is the separator.
export function jsonPromptBlock(content: string, position = -1) {
  return JSON.parse(content.split('\n\n').at(position)!);
}
