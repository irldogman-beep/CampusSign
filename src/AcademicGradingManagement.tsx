import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import * as db from './db';

const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4';
const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-900 dark:text-white';
const primary = 'rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200';

const emptyBand = { id: '', grade_code: '', label: '', min_score: '0', max_score: '100', grade_point: '0', classification: '', sort_order: '1', is_active: true };

export default function AcademicGradingManagement() {
  const [settings, setSettings] = useState({ scale_name: 'Not configured', maximum_grade_point: '5', repeat_policy: 'latest_attempt' });
  const [bands, setBands] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [creditValues, setCreditValues] = useState<Record<string, string>>({});
  const [bandForm, setBandForm] = useState<any>(emptyBand);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [configResult, courseResult] = await Promise.all([
        supabase.rpc('get_academic_grading_config'),
        supabase.rpc('admin_list_course_credit_units')
      ]);
      if (configResult.error) throw configResult.error;
      if (courseResult.error) throw courseResult.error;
      const config = configResult.data || {};
      if (config.settings) setSettings({
        scale_name: config.settings.scale_name || 'Not configured',
        maximum_grade_point: String(config.settings.maximum_grade_point ?? 5),
        repeat_policy: config.settings.repeat_policy || 'latest_attempt'
      });
      setBands(config.bands || []);
      const rows = courseResult.data || [];
      setCourses(rows);
      setCreditValues(Object.fromEntries(rows.map((course: any) => [course.id, String(course.credit_units ?? 0)])));
    } catch (e) { setError(db.friendly(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (e) { setError(db.friendly(e)); }
    finally { setBusy(false); }
  };

  const saveSettings = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const { error: saveError } = await supabase.rpc('save_academic_grading_settings', {
        p_scale_name: settings.scale_name.trim(),
        p_maximum_grade_point: Number(settings.maximum_grade_point),
        p_repeat_policy: settings.repeat_policy
      });
      if (saveError) throw saveError;
    }, 'Grading scale settings saved.');
  };

  const saveBand = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const { error: saveError } = await supabase.rpc('save_academic_grade_band', {
        p_id: bandForm.id || null,
        p_grade_code: bandForm.grade_code.trim().toUpperCase(),
        p_label: bandForm.label.trim(),
        p_min_score: Number(bandForm.min_score),
        p_max_score: Number(bandForm.max_score),
        p_grade_point: Number(bandForm.grade_point),
        p_classification: bandForm.classification.trim() || null,
        p_sort_order: Number(bandForm.sort_order),
        p_is_active: !!bandForm.is_active
      });
      if (saveError) throw saveError;
      setBandForm(emptyBand);
    }, 'Grade band saved.');
  };

  const saveCredits = (courseId: string) => {
    void run(async () => {
      const { error: saveError } = await supabase.rpc('admin_set_course_credit_units', {
        p_course: courseId, p_credit_units: Number(creditValues[courseId])
      });
      if (saveError) throw saveError;
    }, 'Course credit units updated.');
  };

  const regrade = () => {
    if (!window.confirm('Apply the currently configured grade bands and course credit units to all already-published results? Numeric scores and attendance records will not change, but stored grade labels and grade points will be refreshed.')) return;
    void run(async () => {
      const { error: actionError } = await supabase.rpc('admin_regrade_published_results');
      if (actionError) throw actionError;
    }, 'Previously published results have been updated with the current grade scale and course credits.');
  };

  if (loading) return <section className={panel}><p className="text-xs text-slate-500">Loading grading configuration…</p></section>;

  return <div className="space-y-4">
    <section className={panel}>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-300">Institution grading</p>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white mt-1">Grading scale and GPA rules</h2>
        <p className="text-xs text-slate-500 mt-1">Set the institution's own score boundaries and grade-point maximum. CampusSign does not assume every university uses the same scale.</p>
      </div>
      <form onSubmit={saveSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[10px] font-bold text-slate-500">Scale name
          <input className={field+' mt-1'} required minLength={2} maxLength={80} value={settings.scale_name} onChange={e=>setSettings({...settings,scale_name:e.target.value})} placeholder="e.g. Undergraduate 5-point scale"/>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Maximum grade point
          <input className={field+' mt-1'} required type="number" min="0.1" max="20" step="0.1" value={settings.maximum_grade_point} onChange={e=>setSettings({...settings,maximum_grade_point:e.target.value})}/>
        </label>
        <label className="text-[10px] font-bold text-slate-500">Repeated-course GPA treatment
          <select className={field+' mt-1'} value={settings.repeat_policy} onChange={e=>setSettings({...settings,repeat_policy:e.target.value})}>
            <option value="latest_attempt">Use latest attempt</option>
            <option value="highest_grade">Use highest grade achieved</option>
            <option value="all_attempts">Count all attempts</option>
          </select>
        </label>
        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">Latest attempt is the default. Choose the rule that matches your institution's academic regulations.</p>
          <button className={primary} disabled={busy}>Save grading rules</button>
        </div>
      </form>
    </section>

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-extrabold text-slate-900 dark:text-white">Grade boundaries</h3><p className="text-xs text-slate-500 mt-1">Define inclusive score ranges. Active ranges must not overlap. A result can only receive a grade when its score falls inside one active range.</p></div>
        <span className="text-[10px] text-slate-500">{bands.filter(b=>b.is_active).length} active bands</span>
      </div>
      <form onSubmit={saveBand} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-[10px] font-bold text-slate-500">Grade code<input className={field+' mt-1'} required maxLength={10} value={bandForm.grade_code} onChange={e=>setBandForm({...bandForm,grade_code:e.target.value.toUpperCase()})} placeholder="A"/></label>
        <label className="text-[10px] font-bold text-slate-500">Description<input className={field+' mt-1'} required maxLength={80} value={bandForm.label} onChange={e=>setBandForm({...bandForm,label:e.target.value})} placeholder="Excellent"/></label>
        <label className="text-[10px] font-bold text-slate-500">Minimum score<input className={field+' mt-1'} required type="number" min="0" max="100" step="0.01" value={bandForm.min_score} onChange={e=>setBandForm({...bandForm,min_score:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Maximum score<input className={field+' mt-1'} required type="number" min="0" max="100" step="0.01" value={bandForm.max_score} onChange={e=>setBandForm({...bandForm,max_score:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Grade point<input className={field+' mt-1'} required type="number" min="0" max={settings.maximum_grade_point} step="0.001" value={bandForm.grade_point} onChange={e=>setBandForm({...bandForm,grade_point:e.target.value})}/></label>
        <label className="text-[10px] font-bold text-slate-500">Classification<input className={field+' mt-1'} maxLength={80} value={bandForm.classification} onChange={e=>setBandForm({...bandForm,classification:e.target.value})} placeholder="e.g. Distinction"/></label>
        <label className="text-[10px] font-bold text-slate-500">Display order<input className={field+' mt-1'} type="number" step="1" value={bandForm.sort_order} onChange={e=>setBandForm({...bandForm,sort_order:e.target.value})}/></label>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 pt-4"><input type="checkbox" checked={!!bandForm.is_active} onChange={e=>setBandForm({...bandForm,is_active:e.target.checked})}/> Active</label>
        <div className="col-span-2 sm:col-span-4 flex flex-wrap justify-end gap-2">
          {bandForm.id && <button type="button" className={secondary} onClick={()=>setBandForm(emptyBand)}>Cancel edit</button>}
          <button className={primary} disabled={busy}>{bandForm.id?'Update grade band':'Add grade band'}</button>
        </div>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Grade</th><th className="p-2">Score range</th><th className="p-2">Grade point</th><th className="p-2">Classification</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{bands.map(band=><tr key={band.id}><td className="p-2 text-xs"><strong>{band.grade_code}</strong><span className="block text-slate-500">{band.label}</span></td><td className="p-2 text-xs tabular-nums">{Number(band.min_score).toFixed(2)}–{Number(band.max_score).toFixed(2)}</td><td className="p-2 text-xs tabular-nums">{Number(band.grade_point).toFixed(3)}</td><td className="p-2 text-xs">{band.classification||'—'}</td><td className="p-2 text-xs">{band.is_active?'Active':'Inactive'}</td><td className="p-2 text-right"><button type="button" className={secondary} onClick={()=>setBandForm({id:band.id,grade_code:band.grade_code,label:band.label,min_score:String(band.min_score),max_score:String(band.max_score),grade_point:String(band.grade_point),classification:band.classification||'',sort_order:String(band.sort_order),is_active:!!band.is_active})}>Edit</button></td></tr>)}</tbody>
        </table>
        {!bands.length&&<p className="py-4 text-center text-xs text-slate-500">No grade boundaries configured. Add the institution's grade bands before expecting GPA/CGPA values.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
        <p className="text-[10px] text-slate-500">After configuring grade bands and course credits, you can apply them to results that were already published.</p>
        <button type="button" className={secondary} disabled={busy||!bands.some(b=>b.is_active)} onClick={regrade}>Apply scale to published results</button>
      </div>
    </section>

    <section className={panel}>
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Course credit units</h3><p className="text-xs text-slate-500 mt-1">Set credit units for each catalogue course. Courses left at zero units will appear in the transcript but will not contribute to GPA/CGPA.</p></div>
      <div className="space-y-2">{courses.map(course=><div key={course.id} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center rounded-xl border border-slate-100 dark:border-slate-800 p-2">
        <div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white">{course.code} · {course.title}</p><p className="text-[10px] text-slate-500">{course.department_name||'Department'}</p></div>
        <input className={field} type="number" min="0" max="30" step="0.5" value={creditValues[course.id]??'0'} onChange={e=>setCreditValues({...creditValues,[course.id]:e.target.value})} aria-label={'Credit units for '+course.code}/>
        <button type="button" className={secondary} disabled={busy} onClick={()=>saveCredits(course.id)}>Save</button>
      </div>)}
      {!courses.length&&<p className="py-4 text-center text-xs text-slate-500">No active catalogue courses found. Add courses to the central catalogue first.</p>}</div>
    </section>
    {message&&<div role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-200">{message}</div>}
    {error&&<div role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</div>}
  </div>;
}
