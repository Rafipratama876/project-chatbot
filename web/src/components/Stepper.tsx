interface Props {
  steps: string[];
  currentIndex: number;
}

export default function Stepper({ steps, currentIndex }: Props) {
  return (
    <div className="stepper">
      {steps.map((label, i) => (
        <div key={label} className={`step-pill ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'done' : ''}`}>
          <span className="num">{i < currentIndex ? '✓' : i + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}
