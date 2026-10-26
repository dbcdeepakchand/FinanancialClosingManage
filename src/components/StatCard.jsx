export default function StatCard({ label, value, sub, icon: Icon, tone }) {
  return <div className="stat-card">
    <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-bottom"><span>{sub}</span></div>
  </div>;
}
