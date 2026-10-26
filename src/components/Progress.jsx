export default function Progress({ value, color = 'blue' }) {
  return <div className="progress-track"><div className={`progress-fill ${color}`} style={{ width: `${value}%` }} /></div>;
}
