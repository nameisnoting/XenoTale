import './SuggestionButtons.css';

export function SuggestionButtons({
  choices,
  onSelect,
}: {
  choices: string[];
  onSelect: (text: string) => void;
}) {
  const texts = choices.filter(Boolean);
  return (
    <div className="suggestions">
      {texts.map((text, i) => (
        <button key={i} onClick={() => onSelect(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}
