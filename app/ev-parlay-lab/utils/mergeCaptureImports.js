// Incremental capture updates only identities actually returned by this pass.
// Missing rows are retained; a new price replaces its older quote, not its line.
export function mergeCaptureImports(existing, incoming) {
  const key=row=>[row.sportsbook,row.batchRole,row.sport,row.eventLabelRaw,row.period||'full_game',row.eventStart||'',row.marketType,row.selectionNormalized||row.selectionRaw,row.lineValue??''].map(v=>String(v??'').trim().toLowerCase()).join('|');
  const updates=new Map(incoming.filter(r=>r.sourceType==='extension_capture'||r.incrementalCapture===true).map(r=>[key(r),r]));
  const replaced=new Set();
  const out=[];
  for(const row of existing) {
    const k=key(row);
    if(replaced.has(k))continue;
    if(updates.has(k)) {
      out.push(row.userEdited?row:updates.get(k));updates.delete(k);replaced.add(k);
    } else out.push(row);
  }
  out.push(...updates.values());return out;
}
