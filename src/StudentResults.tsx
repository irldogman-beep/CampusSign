import React, { useEffect, useMemo, useState } from 'react';
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

type TranscriptRow = {
  id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  credit_units: number;
  final_score: number | null;
  grade_code: string | null;
  grade_point: number | null;
  attempt_number: number;
  status: string;
  term_id: string;
  term_name: string;
  term_sequence: number;
  period_id: string;
  period_name: string;
  period_starts_on: string | null;
  published_at: string | null;
  created_at: string;
  is_current_carryover: boolean;
};

type TranscriptPayload = {
  settings: {
    scale_name: string;
    maximum_grade_point: number;
    repeat_policy: 'latest_attempt' | 'highest_grade' | 'all_attempts';
    grade_bands_configured: boolean;
  };
  rows: TranscriptRow[];
};

function gradeable(row: TranscriptRow) {
  return row.grade_point != null && Number(row.credit_units) > 0;
}

function weightedGpa(rows: TranscriptRow[]) {
  const eligible = rows.filter(gradeable);
  const credits = eligible.reduce((sum, row) => sum + Number(row.credit_units), 0);
  if (!credits) return null;
  const points = eligible.reduce((sum, row) => sum + Number(row.grade_point) * Number(row.credit_units), 0);
  return points / credits;
}

function latestPerCourse(rows: TranscriptRow[]) {
  const selected = new Map<string, TranscriptRow>();
  rows.forEach(row => {
    const old = selected.get(row.course_id);
    if (!old || Number(row.attempt_number) > Number(old.attempt_number) ||
      (Number(row.attempt_number) === Number(old.attempt_number) && String(row.created_at) > String(old.created_at))) {
      selected.set(row.course_id, row);
    }
  });
  return Array.from(selected.values());
}

function attemptsForCgpa(rows: TranscriptRow[], policy: TranscriptPayload['settings']['repeat_policy']) {
  const eligible = rows.filter(gradeable);
  if (policy === 'all_attempts') return eligible;
  if (policy === 'latest_attempt') return latestPerCourse(eligible);
  const selected = new Map<string, TranscriptRow>();
  eligible.forEach(row => {
    const old = selected.get(row.course_id);
    if (!old || Number(row.grade_point) > Number(old.grade_point) ||
      (Number(row.grade_point) === Number(old.grade_point) && Number(row.attempt_number) > Number(old.attempt_number))) {
      selected.set(row.course_id, row);
    }
  });
  return Array.from(selected.values());
}

function termSummaries(rows: TranscriptRow[]) {
  const terms = new Map<string, TranscriptRow[]>();
  rows.forEach(row => {
    const list = terms.get(row.term_id) || [];
    list.push(row);
    terms.set(row.term_id, list);
  });
  return Array.from(terms.entries()).map(([termId, termRows]) => {
    const latest = latestPerCourse(termRows.filter(gradeable));
    const first = termRows[0];
    return {
      termId,
      label: first.period_name + ' · ' + first.term_name,
      gpa: weightedGpa(latest),
      credits: latest.reduce((sum, row) => sum + Number(row.credit_units), 0),
      sort: (first.period_starts_on || '') + String(first.term_sequence).padStart(2, '0')
    };
  }).sort((a, b) => a.sort.localeCompare(b.sort));
}

export default function StudentResults() {
  const [rows, setRows] = useState<PublishedResult[]>([]);
  const [transcript, setTranscript] = useState<TranscriptPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [resultResponse, transcriptResponse] = await Promise.all([
          supabase.rpc('get_my_published_course_results'),
          supabase.rpc('get_my_academic_transcript')
        ]);
        if (resultResponse.error) throw resultResponse.error;
        if (transcriptResponse.error) throw transcriptResponse.error;
        if (active) {
          setRows((resultResponse.data || []) as PublishedResult[]);
          setTranscript((transcriptResponse.data || null) as TranscriptPayload | null);
        }
      } catch (e) {
        if (active) setError(db.friendly(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const transcriptRows = transcript?.rows || [];
  const settings = transcript?.settings;
  const cgpaRows = useMemo(() => attemptsForCgpa(transcriptRows, settings?.repeat_policy || 'latest_attempt'), [transcriptRows, settings?.repeat_policy]);
  const cgpa = useMemo(() => weightedGpa(cgpaRows), [cgpaRows]);
  const attemptedCredits = cgpaRows.reduce((sum, row) => sum + Number(row.credit_units), 0);
  const earnedCredits = Array.from(new Map(cgpaRows.filter(row => row.status === 'passed').map(row => [row.course_id, Number(row.credit_units)])).values()).reduce((sum, value) => sum + value, 0);
  const carryoverCourses = new Set(transcriptRows.filter(row => row.is_current_carryover).map(row => row.course_id)).size;
  const terms = useMemo(() => termSummaries(transcriptRows), [transcriptRows]);

  if (loading) return <p className="py-10 text-center text-xs text-slate-500">Loading your academic results and transcript…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>;

  return <div className="space-y-4">
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-extrabold text-slate-900 dark:text-white">Academic standing</h3>
        <p className="text-[11px] text-slate-500 mt-1">{settings?.scale_name || 'Institution grading scale'} · Maximum grade point {Number(settings?.maximum_grade_point || 0).toFixed(2) || '—'}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">CGPA</p><p className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{cgpa == null ? '—' : cgpa.toFixed(2)}</p><p className="text-[10px] text-slate-500">out of {Number(settings?.maximum_grade_point || 0).toFixed(2)}</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Credits earned</p><p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{earnedCredits.toFixed(1)}</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Credits counted</p><p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{attemptedCredits.toFixed(1)}</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] text-slate-500">Outstanding carryovers</p><p className="text-xl font-black text-amber-700 dark:text-amber-300 tabular-nums">{carryoverCourses}</p></div>
      </div>
      {(!settings?.grade_bands_configured || cgpa == null) && <p className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-[10px] text-amber-800 dark:text-amber-200">GPA/CGPA will appear after the institution configures grade boundaries, assigns credit units to courses and publishes graded results. Existing numeric scores remain available below.</p>}
      <p className="text-[10px] text-slate-500">Repeated-course rule: {settings?.repeat_policy === 'highest_grade' ? 'highest grade achieved' : settings?.repeat_policy === 'all_attempts' ? 'all attempts count' : 'latest attempt'}.</p>
    </section>

    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Term GPA</h3><p className="text-[11px] text-slate-500 mt-1">Each term uses the latest graded attempt for each course within that term. CGPA follows the institution's repeated-course rule.</p></div>
      {!terms.length ? <p className="py-4 text-center text-xs text-slate-500">No graded course attempts are available yet.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Academic term</th><th className="p-2 text-right">Credits</th><th className="p-2 text-right">GPA</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{terms.map(term=><tr key={term.termId}><td className="p-2 text-xs">{term.label}</td><td className="p-2 text-xs text-right tabular-nums">{term.credits.toFixed(1)}</td><td className="p-2 text-xs text-right font-bold tabular-nums">{term.gpa == null ? '—' : term.gpa.toFixed(2)}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
      <div><h3 className="font-extrabold text-slate-900 dark:text-white">Academic transcript</h3><p className="text-[11px] text-slate-500 mt-1">Published course results and recorded attempts are shown by academic term. Previous attempts remain visible for audit and carryover history.</p></div>
      {!transcriptRows.length ? <p className="py-4 text-center text-xs text-slate-500">Your transcript is empty. Published course results will appear here.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="p-2">Term</th><th className="p-2">Course</th><th className="p-2 text-right">Units</th><th className="p-2 text-right">Score</th><th className="p-2 text-right">Grade</th><th className="p-2 text-right">Point</th><th className="p-2 text-right">Attempt</th><th className="p-2">Result</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{transcriptRows.map(row=><tr key={row.id}><td className="p-2 text-xs">{row.period_name}<span className="block text-[10px] text-slate-500">{row.term_name}</span></td><td className="p-2 text-xs"><strong>{row.course_code}</strong><span className="block text-[10px] text-slate-500">{row.course_title}</span></td><td className="p-2 text-xs text-right tabular-nums">{Number(row.credit_units).toFixed(1)}</td><td className="p-2 text-xs text-right tabular-nums">{row.final_score == null ? '—' : Number(row.final_score).toFixed(2)}</td><td className="p-2 text-xs text-right font-bold">{row.grade_code||'—'}</td><td className="p-2 text-xs text-right tabular-nums">{row.grade_point == null ? '—' : Number(row.grade_point).toFixed(2)}</td><td className="p-2 text-xs text-right">{row.attempt_number}</td><td className="p-2 text-xs">{row.is_current_carryover?'Carryover':row.status.replace('_',' ')}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-extrabold text-slate-900 dark:text-white">Published course results</h3>
        <p className="text-[11px] text-slate-500 mt-1">Detailed CA, attendance and examination breakdowns appear here after administrative publication.</p>
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
    </section>
  </div>;
}
