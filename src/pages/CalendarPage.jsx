import { CalendarRange, Download } from 'lucide-react';

export default function CalendarPage({
  checklistRows, exportCsv, scopeLabel, loading, error, onRetry
}) {
  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">LEDGER ACTIVITY SEQUENCE</div><h1>Checklist sequence</h1><p>Operational activities for {scopeLabel}, ordered by source checklist sequence.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export activities</button></div>
    {error&&<div className="form-error business-unit-load-error" role="alert"><span>{error}</span><button className="btn secondary compact" onClick={onRetry} disabled={loading}>Retry</button></div>}
    {loading&&<div className="api-loading" role="status">Loading Ledger activities…</div>}
    {!loading&&!error&&<><div className="calendar-banner"><div className="calendar-banner-icon"><CalendarRange size={23}/></div><div><strong>{checklistRows.length} Ledger activity instances</strong><p>Each checklist activity is shown once per Ledger.</p></div></div>
    <div className="timeline">{checklistRows.map((task,index)=><div className="timeline-item" key={`${task.ledgerId}|${task.checklistRowId}`}>
      <div className={`timeline-marker ${index===0?'current':''}`}>{index+1}</div>
      <div className="timeline-content"><div className="timeline-top"><span className="timeline-day">{task.ledgerName || task.ledgerId}</span><span className="module-chip">{task.module}</span></div>
        <h3>{task.title}</h3><p>{task.actionType || task.processType || task.note || 'No additional details in the source checklist.'}</p>
      </div>
    </div>)}</div></>}
  </section>;
}
