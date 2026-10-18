import { RisuLua } from './lua';
import { cbs, applyRisuRules } from './cbs';
import wasm from 'wasmoon/dist/glue.wasm?url';
import type { RisuCommand } from './types';
import { activeLore } from './lore';
const runtime = new RisuLua();
let pending = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; command: RisuCommand }>) => {
  pending = pending.then(async () => {
    const { id, command } = event.data;
    try {
      if (command.action === 'request' && command.messages) {
        const lastChat = command.chats.at(-1);
        const lastInput = [...command.messages].reverse().find((m) => m.role === 'user');
        if (lastInput && lastChat?.role === 'user') {
          lastInput.content = applyRisuRules(lastInput.content, command, 'editinput');
          lastChat.data = lastInput.content;
        }
        const lore = activeLore(command);
        if (lore) command.messages.splice(1, 0, { role: 'system', content: lore });
        command.messages = command.messages.map((message) => ({
          ...message,
          content: applyRisuRules(cbs(message.content, command), command, 'editprocess'),
        }));
      }
      const result = command.config.scripts.length
        ? await runtime.run(command, wasm)
        : {
            text: command.text ?? '',
            state: command.state ?? {},
            messages: command.messages,
            chats: command.chats,
          };
      if (command.action === 'display')
        result.text = applyRisuRules(
          cbs(result.text, { ...command, state: result.state }),
          { ...command, state: result.state },
          'editdisplay',
        );
      if (command.action === 'output')
        result.text = applyRisuRules(
          result.text,
          { ...command, state: result.state },
          'editoutput',
        );
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({ id, error: (error as Error).message });
    }
  });
};
