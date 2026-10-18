export type RisuRule = {
  id: string;
  name: string;
  type: 'editdisplay' | 'editprocess' | 'editinput' | 'editoutput';
  pattern: string;
  replacement: string;
  flags: string;
  cbs?: boolean;
};
export type RisuConfig = {
  version: 1;
  scripts: { id: string; name: string; code: string }[];
  styles: string;
  rules: RisuRule[];
  variables: string;
  postHistory?: string;
  examples?: string;
  loreSettings: { scanDepth: number; tokenBudget: number; recursive: boolean };
};
export type RisuState = Record<string, string>;
export type RisuMessage = { role: string; content: string };
export type RisuCommand = {
  config: RisuConfig;
  state?: RisuState;
  chats: { role: string; data: string }[];
  lore: { name: string; prompt: string; keywords: string[]; activation?: string }[];
  action: 'display' | 'button' | 'request' | 'output';
  index?: number;
  text?: string;
  button?: string;
  messages?: RisuMessage[];
  user: string;
  character: string;
};
export type RisuResult = {
  text: string;
  state: RisuState;
  messages?: RisuMessage[];
  chats: RisuCommand['chats'];
};
