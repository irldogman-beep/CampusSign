import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import * as db from './db';

export default function StudentResults() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error('Sign in to view your results.');
        const { data: scores, error: scoreError } = await supabase
          .from('course_assessment_scores').select('assessment_id,score,feedback,updated_at')
          .eq('student_user_id', auth.user.id).order('updated_at', { ascending: false });
        if (scoreError) throw scoreError;
        const ids = (scores || []).map((x: any) => x.assessment_id);
        if (!ids.length) { if (active) setRows([]); return; }
        const [assessmentResult, courses, terms] = await Promise.all([
          supabase.from('course_assessments').select('*').in('id', ids),
          db.loadCatalogCourses(null), db.loadAcademicTerms()
        ]);
        if (assessmentResult.error) throw assessmentResult.error;
        const assessmentMap = Object.fromEntries((assessmentResult.data || []).map((x: any) => [x.id, x]));
        const courseMap = Object.fromEntries((courses || []).map((x: any) => [x.id, x]));
        const termMap = Object.fromEntries((terms || []).map((x: any) => [x.id, x]));
        const result = (scores || []).map((score: any) => {
          const assessment = assessmentMap[score.assessment_id];
          if (!assessment) return null;
          const course = courseMap[assessment.course_id];
          const term = termMap[assessment.academic_term_id];
          return {
            ...score, assessment,
            courseLabel: course ? course.code + ' · ' + course.title : 'Course',
            termLabel: term?.name || 'Academic term',
            contribution: Number(score.score) / Number(assessment.max_score) * Number(assessment.weight_percent)
          };
        }).filter(Boolean);
        if (active) setRows(result);
      } catch (e) { if (active) setError(db.friendly(e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="py-10 text-center text-xs text-slate-500">Loading your results…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>;
  return <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
    <div><h3 className="font-extrabold text-slate-900 dark:text-white">My CA & examination results</h3><p className="text-[11px] text-slate-500 mt-1">Marks appear here after your lecturer or administrator records them. The contribution shows how much each mark adds to its configured assessment category.</p></div>
    {!rows.length ? <p className="py-8 text-center text-xs text-slate-500">No assessment marks have been recorded for your account yet.</p> :
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">{rows.map((row: any) => <article key={row.assessment_id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block text-xs text-slate-900 dark:text-white">{row.courseLabel}</strong><p className="text-[10px] text-slate-500 mt-1">{row.termLabel} · {row.assessment.assessment_type === 'ca' ? 'Continuous assessment' : 'Examination'}</p><p className="text-xs font-semibold mt-2 text-slate-800 dark:text-slate-100">{row.assessment.title}</p></div><div className="text-right shrink-0"><p className="text-sm font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{row.score} / {row.assessment.max_score}</p><p className="text-[10px] text-slate-500">{row.assessment.weight_percent}% weight</p></div></div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2"><span className="text-[10px] text-slate-500">Weighted contribution</span><strong className="text-xs tabular-nums">{Number(row.contribution).toFixed(2)}%</strong></div>
        {row.feedback && <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">Lecturer feedback: {row.feedback}</p>}
      </article>)}</div>}
  </section>;
}
