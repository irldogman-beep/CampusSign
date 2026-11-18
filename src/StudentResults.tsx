import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import * as db from './db';

type PublishedResult = {
  course_code: string;
  course_title: string;
  term_name: string;
  teaching_group_name: string | null;
  ca_score: number;
  attendance_score: number | null;
  exam_score: number;
  final_score: number;
  published_at: string;
};

export default function StudentResults() {
  const [rows, setRows] = useState<PublishedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: resultError } = await supabase.rpc('get_my_published_course_results');
        if (resultError) throw resultError;
        if (active) setRows((data || []) as PublishedResult[]);
      } catch (e) {
        if (active) setError(db.friendly(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="py-10 text-center text-xs text-slate-500">Loading your published results…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>;

  return <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
    <div>
      <h3 className="font-extrabold text-slate-900 dark:text-white">My academic results</h3>
      <p className="text-[11px] text-slate-500 mt-1">Final course scores appear here only after the lecturer submits them and the institution reviews and publishes the result sheet.</p>
    </div>
    {!rows.length ? <p className="py-8 text-center text-xs text-slate-500">No course results have been published for your account yet. Marks still being entered or reviewed will not appear here.</p> :
      <div className="space-y-2">{rows.map((row, index) => <article key={row.course_code + row.term_name + row.published_at + index} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block text-xs text-slate-900 dark:text-white">{row.course_code} · {row.course_title}</strong>
            <p className="text-[10px] text-slate-500 mt-1">{row.term_name}{row.teaching_group_name ? ' · ' + row.teaching_group_name : ''}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{Number(row.final_score).toFixed(2)}%</p>
            <p className="text-[10px] text-slate-500">Final course score</p>
          </div>
        </div>
        <div className={`grid ${row.attendance_score == null ? 'grid-cols-2' : 'grid-cols-3'} gap-2 mt-3 border-t border-slate-100 dark:border-slate-800 pt-3`}>
          <div><p className="text-[10px] text-slate-500">CA category</p><strong className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{Number(row.ca_score).toFixed(2)} / 100</strong></div>
          {row.attendance_score != null && <div><p className="text-[10px] text-slate-500">Attendance</p><strong className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{Number(row.attendance_score).toFixed(2)}%</strong></div>}
          <div><p className="text-[10px] text-slate-500">Examination category</p><strong className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{Number(row.exam_score).toFixed(2)} / 100</strong></div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">Published {new Date(row.published_at).toLocaleDateString()}</p>
      </article>)}</div>}
  </section>;
}
