import { LuaFactory, type LuaEngine } from 'wasmoon';
import jsonLibrary from './json.lua?raw';
import type { RisuCommand, RisuResult } from './types';

// Only JSON data crosses the host boundary. No JS object proxy, network, files or app storage.
export class RisuLua {
  private engine?: LuaEngine;
  private source = '';
  private loreSource = '';
  async run(command: RisuCommand, wasm?: string): Promise<RisuResult> {
    const source = command.config.scripts.map((s) => s.code).join('\n');
    if (!this.engine || this.source !== source) {
      this.close();
      this.engine = await new LuaFactory(wasm).createEngine({
        injectObjects: false,
        enableProxy: false,
        traceAllocations: true,
        functionTimeout: 4000,
      });
      this.engine.global.setMemoryMax(96 * 1024 * 1024);
      // Compile once, including the bundled MIT JSON library. Cards remain portable data.
      await this.engine.doString(`json=(function()\n${jsonLibrary}\nend)()`);
      await this.engine.doString(bridge);
      await this.engine.doString(source + '\n_xenoCapture()');
      this.source = source;
    }
    const loreSource = JSON.stringify(command.lore);
    if (this.loreSource !== loreSource) {
      this.engine.global.get('_xenoSetLore')(loreSource);
      this.loreSource = loreSource;
    }
    const result = JSON.parse(
      await this.engine.global.get('_xenoRun')(
        JSON.stringify({
          ...command,
          lore: undefined,
          config: { variables: command.config.variables },
        }),
      ),
    );
    if (Array.isArray(result.state) && result.state.length === 0) result.state = {};
    if (
      !result.state ||
      Array.isArray(result.state) ||
      typeof result.state !== 'object' ||
      Object.values(result.state).some((v) => typeof v !== 'string')
    )
      throw new Error('Risu 상태 형식이 올바르지 않습니다.');
    if (JSON.stringify(result).length > 8_000_000) throw new Error('Risu 처리 결과가 너무 큽니다.');
    return result;
  }
  close() {
    this.engine?.global.close();
    this.engine = undefined;
    this.loreSource = '';
  }
}

const bridge = `
local decode,encode=json.decode,json.encode
local data,listeners,lookup
local function unsupported(name) error('지원하지 않는 Risu API: '..name) end
os={time=os.time,clock=os.clock,date=os.date,difftime=os.difftime}
io=nil;debug=nil;package=nil;require=nil;loadfile=nil;dofile=nil;load=nil;collectgarbage=nil
Promise=nil
function async(f) return f end
function listenEdit(name,f)
  listeners=listeners or {};listeners[name]=listeners[name] or {}
  table.insert(listeners[name],f)
end
function getChatVar(id,key) return data.state[key] or 'null' end
function setChatVar(id,key,value) data.state[key]=tostring(value) end
function setChatVarChanged(id,key,value)
  if data.state[key]==tostring(value) then return false end
  setChatVar(id,key,value);return true
end
function getState(id,key) return decode(getChatVar(id,'__'..key)) end
function setState(id,key,value) setChatVar(id,'__'..key,encode(value)) end
function setStateChanged(id,key,value) return setChatVarChanged(id,'__'..key,encode(value)) end
function getChatLength(id) return #data.chats end
function getChat(id,index)
  index=tonumber(index); if index<0 then index=#data.chats+index end
  return data.chats[index+1]
end
function getFullChat(id) return data.chats end
function getRecentChats(id,count)
 local out={};for i=math.max(1,#data.chats-count+1),#data.chats do out[#out+1]=data.chats[i] end;return out
end
function setChat(id,index,value)
 local chat=getChat(id,index);if chat then chat.data=tostring(value) end
end
function addChat(id,role,value) data.chats[#data.chats+1]={role=role,data=tostring(value)} end
function getLoreBooks(id,name) return lookup[name] or {} end
function reloadDisplay(id) end
function reloadChat(id,index) end
function log(value) end
function alertNormal(id,value) end
function alertError(id,value) error(tostring(value)) end
function request(...) unsupported('request') end
function LLM(...) unsupported('LLM') end
function axLLM(...) unsupported('axLLM') end
local function edit(name,value,meta)
 for _,f in ipairs((listeners or {})[name] or {}) do local result=f('room',value,meta); if result~=nil then value=result end end
 return value
end
function _xenoRun(raw)
 data=decode(raw);data.state=data.state or {}
 for line in (data.config.variables or ''):gmatch('[^\\r\\n]+') do local k,v=line:match('^%s*([^=]+)=(.*)$');if k and data.state[k]==nil then data.state[k]=v end end
 local text=data.text or ''; local messages=data.messages
 if data.action=='button' then
   local name=data.button or ''
   -- Only card-defined global functions are valid trigger targets.
   if name:match('^[%a_][%w_]*$') and not _xenoBaseGlobals[name] and type(_G[name])=='function' then _G[name]('room')
   elseif type(onButtonClick)=='function' then onButtonClick('room',name)
   else error('버튼 처리 함수가 없습니다.') end
 elseif data.action=='display' then text=edit('editDisplay',text,{index=data.index or -1})
 elseif data.action=='request' then
   if type(onStart)=='function' then onStart('room') end
   messages=edit('editRequest',messages,{})
 elseif data.action=='output' then
   if type(onOutput)=='function' then onOutput('room') end
   text=data.chats[#data.chats] and data.chats[#data.chats].data or text
 end
 return encode({text=text,state=data.state,messages=messages,chats=data.chats})
end
function _xenoSetLore(raw)
 lookup={}
 for _,line in ipairs(decode(raw)) do lookup[line.name]=lookup[line.name] or {};table.insert(lookup[line.name],{comment=line.name,content=line.prompt,key=table.concat(line.keywords or {},',')}) end
end
_xenoBaseGlobals={};for k in pairs(_G) do _xenoBaseGlobals[k]=true end
_xenoCapture=function() end
`;
