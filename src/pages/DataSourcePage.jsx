import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';

export default function DataSourcePage({
  template, downloadTemplate, selectFile, submitUpload, uploadRows,
  uploading, uploadFileName, uploadError
}) {
  return <section className="page-section">
    <div className="page-heading"><div><h1>{template.label}</h1></div><button className="btn secondary" onClick={downloadTemplate}><Download size={16}/> Download template</button></div>
    <div className="upload-card">
      <div className="upload-card-icon"><FileSpreadsheet size={21}/></div>
      <div className="upload-card-copy"><h2>{template.label}</h2></div>
      <div className="upload-controls">
        <label className="btn secondary upload-file-label"><Upload size={16}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={selectFile}/></label>
        <button className="btn primary" onClick={submitUpload} disabled={!uploadRows.length||uploading}><Upload size={16}/>{uploading?'Uploading…':`Insert ${uploadRows.length||''} rows`}</button>
      </div>
      <p className="upload-guidance">CSV only · Up to 5,000 rows and 5 MB per upload. </p>
      {uploadFileName && <div className="upload-file-status"><CheckCircle2 size={16}/><span><strong>{uploadFileName}</strong> · {uploadRows.length} rows ready to insert</span></div>}
      {uploadError && <p className="form-error upload-error" role="alert">{uploadError}</p>}
    </div>
  </section>;
}
