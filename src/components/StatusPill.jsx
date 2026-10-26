export default function StatusPill({ status }) {
  const cls = status === 'Complete' ? 'complete' : status === 'In progress' ? 'progress' : status === 'Blocked' ? 'blocked' : 'pending';
  return <span className={`status-pill ${cls}`}><span className="status-dot"/>{status}</span>;
}
