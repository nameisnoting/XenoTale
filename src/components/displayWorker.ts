import { transformDisplay } from '../domain/displayRules';
self.onmessage = (event: MessageEvent) => {
  const { text, rules } = event.data;
  try {
    self.postMessage({ text: transformDisplay(text, rules) });
  } catch (error) {
    self.postMessage({ text, error: (error as Error).message });
  }
};
