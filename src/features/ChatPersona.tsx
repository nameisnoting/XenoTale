import type { Persona, Profile, Room } from '../domain/types';
import { clone } from '../domain/types';
import { defaultPersona } from '../domain/defaults';
import { AddButton } from '../components/AddButton';
import { useAction } from '../components/UI';
import { PersonaCard } from '../components/PersonaCard';
import { db } from '../persistence/db';
import {
  createSharedPersona,
  updateSharedPersona,
  deleteSharedPersona,
} from '../persistence/personas';

export function ChatPersona({
  room,
  profile,
  mutate,
}: {
  room: Room;
  profile: Profile;
  mutate: (fn: (r: Room) => Room) => Promise<unknown>;
}) {
  const run = useAction(),
    ctx = room.current.context;
  const select = (persona: Persona) =>
    run(
      mutate((r) => {
        r.current.context.persona = clone(persona);
        return r;
      }),
    );
  const edit = async (persona: Persona, patch: Partial<Persona>) => {
    await mutate((r) => {
      if (r.current.context.persona.id === persona.id)
        r.current.context.persona = { ...r.current.context.persona, ...patch, id: persona.id };
      return r;
    });
    await updateSharedPersona(db, persona.id, patch, room.id);
  };
  const add = async (source?: Persona) => {
    const persona = await createSharedPersona(db, source);
    await mutate((r) => {
      r.current.context.persona = clone(persona);
      return r;
    });
  };
  const remove = async (persona: Persona) => {
    await mutate((r) => {
      if (r.current.context.persona.id === persona.id)
        r.current.context.persona = clone(
          r.work.personas[0] ??
            profile.personas.find((p) => p.id !== persona.id) ??
            defaultPersona(),
        );
      return r;
    });
    await deleteSharedPersona(db, persona.id, room.id);
  };
  return (
    <div className="chat-personas">
      <h3>추천 페르소나</h3>
      {room.work.personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          value={persona}
          readOnly
          selected={ctx.persona.id === persona.id}
          onSelect={() => select(persona)}
          onCopy={() => run(add(persona))}
        />
      ))}
      {!room.work.personas.length && (
        <p className="muted">작품에 등록된 추천 페르소나가 없습니다.</p>
      )}
      <hr />
      {profile.personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          value={persona}
          selected={ctx.persona.id === persona.id}
          expanded={ctx.persona.id === persona.id}
          onSelect={() => select(persona)}
          onChange={(patch) => edit(persona, patch)}
          onDelete={() => remove(persona)}
        />
      ))}
      <AddButton onClick={() => run(add())}>페르소나 추가</AddButton>
    </div>
  );
}
