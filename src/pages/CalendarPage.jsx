import { CalendarRange, Download } from 'lucide-react';

export default function CalendarPage({ checklistRows, exportCsv }) {
  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">SOURCE CHECKLIST</div><h1>Checklist sequence</h1><p>Operational steps grouped by module, business unit and legal entity.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export checklist</button></div>
    <div className="calendar-banner"><div className="calendar-banner-icon"><CalendarRange size={23}/></div><div><strong>{checklistRows.length} operational checklist steps</strong><p>Checklist activities are grouped by module and business unit.</p></div></div>
    <div className="timeline">{checklistRows.map((task,index)=><div className="timeline-item" key={task.checklistRowId}>
      <div className={`timeline-marker ${index===0?'current':''}`}>{index+1}</div>
      <div className="timeline-content"><div className="timeline-top"><span className="timeline-day">{task.entity}</span><span className="module-chip">{task.module}</span></div>
        <h3>{task.title}</h3><p>{task.actionType || task.processType || task.note || 'No additional details in the source checklist.'}</p>
      </div>
    </div>)}</div>
  </section>;
}
