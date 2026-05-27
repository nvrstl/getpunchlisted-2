import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import Login from './views/Login';
import ProjectSelect from './views/ProjectSelect';
import LandingDashboard from './views/LandingDashboard.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuickLog from './components/QuickLog.jsx';
import Vandaag from './views/Vandaag.jsx';
import ProjectTimeline from './views/ProjectTimeline.jsx';
import DailyReport from './views/DailyReport.jsx';
import Settings from './views/Settings.jsx';
import { Drawer, ContextPanel, ContactsPanel, ChatPanel, ProjectTopActions } from './components/ProjectDrawer.jsx';
import Toast from './components/Toast.jsx';
import ProjectSettings from './components/ProjectSettings.jsx';
import Admin from './views/Admin.jsx';
import BackofficeShell from './views/BackofficeShell.jsx';
import Backoffice from './views/Backoffice.jsx';
import BackofficeCompany from './views/BackofficeCompany.jsx';
import FloatingChat from './components/FloatingChat.jsx';

const mapLog = (r) => ({
  id: r.id, rawNote: r.raw_note, location: r.location, photo: r.photo_url,
  processedSummary: r.processed_summary, type: r.type || 'general',
  flags: r.flags || [], impact: r.impact || 'none',
  actionRequired: r.action_required ?? false, suggestRFI: r.suggest_rfi ?? false,
  processing: r.processing ?? false, createdAt: r.created_at,
  logDate: r.log_date || null,
  label: r.label || null,
  treated: r.treated ?? false,
  source: r.source || 'manual',
  disputeTypes: r.dispute_types || [],
  meerwerkClassification: r.meerwerk_classification || null,
  meerwerkReasoning: r.meerwerk_reasoning || null,
  workpoints: Array.isArray(r.workpoints) ? r.workpoints : [],
  recommendedOutputs: Array.isArray(r.recommended_outputs) ? r.recommended_outputs : [],
  snoozedUntil: r.snoozed_until || null,
  parentOutboundEmailId: r.parent_outbound_email_id || null,
  inReplyToMessageId: r.in_reply_to_message_id || null,
});
const mapReminder = (r) => ({
  id: r.id, projectId: r.project_id, fieldLogId: r.field_log_id, userId: r.user_id,
  subject: r.subject, body: r.body || '',
  recipient: r.recipient || '', recipientKind: r.recipient_kind || 'external',
  dueAt: r.due_at, sentAt: r.sent_at,
  status: r.status || 'pending',
  outboundEmailId: r.outbound_email_id,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapRFI = (r) => ({
  id: r.id, number: r.number, title: r.title, context: r.context,
  draft: r.draft || '', status: r.status || 'draft',
  emailDraft: r.email_draft || '', pricingProposition: r.pricing_proposition || '',
  fieldLogId: r.field_log_id, createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapPunch = (r) => ({
  id: r.id, task: r.task, assignee: r.assignee, priority: r.priority || 'medium',
  dueDate: r.due_date, notes: r.notes, status: r.status || 'pending',
  category: r.category || null,
  createdAt: r.created_at, completedAt: r.completed_at,
});
const mapVariation = (r) => ({
  id: r.id, number: r.number, description: r.description,
  requestedBy: r.requested_by, estimatedCost: r.estimated_cost,
  status: r.status || 'draft', notes: r.notes,
  fieldLogId: r.field_log_id, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapSub = (r) => ({
  id: r.id, company: r.company, trade: r.trade, contact: r.contact, phone: r.phone,
  crewSize: r.crew_size, workArea: r.work_area, status: r.status || 'on_site',
  notes: r.notes, createdAt: r.created_at,
});
const mapContext = (r) => ({
  id: r.id, category: r.category, title: r.title, content: r.content,
  source: r.source, createdAt: r.created_at,
});
const mapDispute = (r) => ({
  id: r.id, projectId: r.project_id, fieldLogId: r.field_log_id,
  number: r.number, senderEmail: r.sender_email, subject: r.subject,
  status: r.status || 'open', createdAt: r.created_at, updatedAt: r.updated_at,
  sentAt: r.sent_at || null, reviewedBy: r.reviewed_by || null,
  archivedAt: r.archived_at || null,
});
const mapDisputePoint = (r) => ({
  id: r.id, disputeId: r.dispute_id, type: r.type,
  description: r.description,
  timelineReconstruction: r.timeline_reconstruction,
  timelineReconstructedAt: r.timeline_reconstructed_at,
  draftResponse: r.draft_response || null,
  draftGeneratedAt: r.draft_generated_at || null,
  createdAt: r.created_at,
});
const mapDisputeQuestion = (r) => ({
  id: r.id, disputePointId: r.dispute_point_id,
  question: r.question, answer: r.answer || '',
  createdAt: r.created_at,
});
const mapDisputeEvidence = (r) => ({
  id: r.id, disputePointId: r.dispute_point_id,
  sourceType: r.source_type, sourceId: r.source_id,
  label: r.label, relevanceNote: r.relevance_note,
  createdAt: r.created_at,
});
const mapOutboundEmail = (r) => ({
  id: r.id, projectId: r.project_id, userId: r.user_id,
  fieldLogId: r.field_log_id, rfiId: r.rfi_id, variationId: r.variation_id, disputeId: r.dispute_id,
  to: r.to_addresses || [], cc: r.cc_addresses || [], bcc: r.bcc_addresses || [],
  replyTo: r.reply_to, subject: r.subject,
  bodyText: r.body_text, bodyHtml: r.body_html,
  provider: r.provider, messageId: r.message_id,
  status: r.status, error: r.error,
  sentAt: r.sent_at, openedAt: r.opened_at, repliedAt: r.replied_at,
  createdAt: r.created_at,
});

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};
const pageTransition = { type: 'spring', stiffness: 280, damping: 28 };

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [project, setProject]       = useState(null);
  const [projects, setProjects]     = useState([]); // all projects for the user, used by the project switcher
  const [showProjectCreate, setShowProjectCreate] = useState(false);
  const recoveredLogIds = useRef(new Set());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [platformAdminChecked, setPlatformAdminChecked] = useState(false);
  const [viewParams, setViewParams]  = useState({});
  const [view, setView]             = useState('dashboard');
  const [showSettings, setShowSettings] = useState(false);

  // Check platform admin status once user loads
  useEffect(() => {
    if (!user) { setIsPlatformAdmin(false); setPlatformAdminChecked(true); return; }
    supabase.from('platform_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setIsPlatformAdmin(!!data); setPlatformAdminChecked(true); });
  }, [user?.id]);

  // Load all projects for the user (for the project switcher in the top bar)
  useEffect(() => {
    if (!user) { setProjects([]); return; }
    supabase
      .from('projects')
      .select('id, name, project_number, status, city')
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data || []));
  }, [user?.id, project?.id]); // refetch after a new project is created

  // Route once based on platform admin status. Platform admins land on the
  // Backoffice by default but can navigate freely afterwards (so they can
  // also work in their own company's projects via the regular dashboard).
  // Non-admins who somehow end up on a backoffice page get bounced off it.
  useEffect(() => {
    if (!platformAdminChecked) return;
    const onBackofficePage = view === 'backoffice' || view === 'backofficeCompany';
    if (isPlatformAdmin && !onBackofficePage && view === 'dashboard') {
      // 'dashboard' is the initial useState value — treat that as "fresh load".
      // Once the user navigates anywhere else, leave them alone.
      setView('backoffice');
    }
    if (!isPlatformAdmin && onBackofficePage) setView('dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformAdminChecked, isPlatformAdmin]);

  const navigate = (viewId, params = {}) => {
    setView(viewId);
    setViewParams(params);
  };

  // Handle Gmail OAuth popup callback — posts token to opener and closes
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('access_token');
    const expiresIn = hash.get('expires_in');
    if (token && window.opener) {
      window.opener.postMessage(
        { type: 'gmail_token', token, expiresIn },
        window.location.origin
      );
      window.close();
    }
  }, []);
  const [fieldLogs, setFieldLogs] = useState([]);
  const [rfis, setRFIs]         = useState([]);
  const [punchItems, setPunchItems] = useState([]);
  const [subs, setSubs]             = useState([]);
  const [variations, setVariations] = useState([]);
  const [contextItems, setContextItems] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [disputePoints, setDisputePoints] = useState([]);
  const [disputeQuestions, setDisputeQuestions] = useState([]);
  const [disputeEvidence, setDisputeEvidence] = useState([]);
  const [outboundEmails, setOutboundEmails] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [projectContacts, setProjectContacts] = useState([]);
  const [openDrawer, setOpenDrawer] = useState(null); // 'context' | 'contacts' | 'chat' | null

  useEffect(() => {
    if (!project) return;
    Promise.all([
      supabase.from('field_logs').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
      supabase.from('rfis').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
      supabase.from('punch_items').select('*').eq('project_id', project.id).order('created_at', { ascending: true }),
      supabase.from('subcontractors').select('*').eq('project_id', project.id).order('created_at', { ascending: true }),
      supabase.from('variations').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
      supabase.from('project_context').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
      supabase.from('project_members').select('id, email, role').eq('project_id', project.id),
      supabase.from('disputes').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
      supabase.from('outbound_emails').select('*').eq('project_id', project.id).order('sent_at', { ascending: false }),
      supabase.from('reminders').select('*').eq('project_id', project.id).order('due_at', { ascending: true }),
      supabase.from('project_contacts').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    ]).then(([logsRes, rfisRes, punchRes, subsRes, varRes, ctxRes, membersRes, disputesRes, outboundRes, remindersRes, contactsRes]) => {
      setFieldLogs((logsRes.data || []).map(mapLog));
      setRFIs((rfisRes.data || []).map(mapRFI));
      setPunchItems((punchRes.data || []).map(mapPunch));
      setSubs((subsRes.data || []).map(mapSub));
      setVariations((varRes.data || []).map(mapVariation));
      setContextItems((ctxRes.data || []).map(mapContext));
      setProjectMembers(membersRes.data || []);
      setOutboundEmails((outboundRes?.data || []).map(mapOutboundEmail));
      setReminders((remindersRes?.data || []).map(mapReminder));
      setProjectContacts(contactsRes?.data || []);
      const mappedDisputes = (disputesRes.data || []).map(mapDispute);
      setDisputes(mappedDisputes);
      const ids = mappedDisputes.map(d => d.id);
      if (ids.length) {
        supabase.from('dispute_points').select('*').in('dispute_id', ids)
          .order('created_at', { ascending: true })
          .then(({ data }) => {
            const pts = (data || []).map(mapDisputePoint);
            setDisputePoints(pts);
            const pointIds = pts.map(p => p.id);
            if (pointIds.length) {
              Promise.all([
                supabase.from('dispute_questions').select('*').in('dispute_point_id', pointIds)
                  .order('created_at', { ascending: true }),
                supabase.from('dispute_evidence').select('*').in('dispute_point_id', pointIds)
                  .order('created_at', { ascending: true }),
              ]).then(([qRes, eRes]) => {
                setDisputeQuestions((qRes.data || []).map(mapDisputeQuestion));
                setDisputeEvidence((eRes.data || []).map(mapDisputeEvidence));
              });
            }
          });
      }
    });
  }, [project]);

  // ── Recover logs stuck as processing (e.g. after a page refresh mid-fetch) ──
  useEffect(() => {
    const stuckLogs = fieldLogs.filter(l => l.processing && !recoveredLogIds.current.has(l.id));
    if (stuckLogs.length === 0) return;
    stuckLogs.forEach(async (log) => {
      recoveredLogIds.current.add(log.id);
      try {
        const res = await fetch('/api/process-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: log.rawNote, location: log.location || '' }),
        });
        const json = await res.json();
        const updates = json.success
          ? {
              processed_summary: json.data.summary,
              type: json.data.type,
              flags: json.data.flags,
              impact: json.data.impact,
              action_required: json.data.actionRequired,
              suggest_rfi: json.data.suggestRFI,
              label: json.data.label || null,
              processing: false,
              ...(json.data.type === 'dispute' && json.data.disputeTypes?.length ? { dispute_types: json.data.disputeTypes } : {}),
              ...(!log.location && json.data.extractedLocation ? { location: json.data.extractedLocation } : {}),
              ...(!log.logDate && json.data.extractedDate ? { log_date: json.data.extractedDate } : {}),
            }
          : { processing: false };
        await supabase.from('field_logs').update(updates).eq('id', log.id);
        setFieldLogs(prev => prev.map(l => l.id === log.id ? { ...l, ...updates } : l));
      } catch {
        await supabase.from('field_logs').update({ processing: false }).eq('id', log.id);
        setFieldLogs(prev => prev.map(l => l.id === log.id ? { ...l, processing: false } : l));
      }
    });
  }, [fieldLogs]);

  // ── Project update ─────────────────────────────────────────────────────────
  const updateProject = (updated) => setProject(updated);

  // Pick a project AND drop the user on the per-project dashboard. Needed
  // because 'landing' stays in viewComponents even when a project is set —
  // without resetting view, clicking a project from the overview would just
  // re-render LandingDashboard with the new project loaded but never visible.
  const selectProject = (p) => { setProject(p); setView('dashboard'); };

  // ── Field Logs ─────────────────────────────────────────────────────────────
  const submitLog = async ({ rawNote, location, photo = null, logDate = null }) => {
    const { data: entry, error } = await supabase.from('field_logs').insert({
      project_id: project.id, raw_note: rawNote, location: location || null,
      photo_url: photo || null, type: 'general', processing: true,
      ...(logDate ? { log_date: logDate } : {}),
    }).select().single();
    if (error) { console.error('insert field log:', error.message); return; }
    const mapped = mapLog(entry);
    setFieldLogs(prev => [mapped, ...prev]);
    fetch('/api/process-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: rawNote, location,
        contacts: projectContacts.map(c => ({ name: c.name, role: c.role, email: c.email })),
        contextItems: contextItems.map(i => ({ category: i.category, title: i.title, content: i.content, source: i.source })),
        projectName: project.name,
      }),
    })
      .then(r => r.json()).then(async json => {
        const wp = Array.isArray(json?.data?.workpoints) ? json.data.workpoints : [];
        const recs = Array.isArray(json?.data?.recommendedOutputs) ? json.data.recommendedOutputs : [];
        const meerwerkAny = wp.find(p => p.classification === 'meerwerk');
        const meerwerkSummary = meerwerkAny
          ? 'meerwerk'
          : (wp.length && wp.every(p => p.classification === 'in_scope') ? 'in_scope' : (wp.length ? 'twijfel' : null));

        const updates = json.success
          ? {
              processed_summary: json.data.summary,
              type: json.data.type,
              flags: json.data.flags,
              impact: json.data.impact,
              action_required: json.data.actionRequired,
              suggest_rfi: json.data.suggestRFI,
              label: json.data.label || null,
              workpoints: wp,
              recommended_outputs: recs,
              meerwerk_classification: meerwerkSummary,
              meerwerk_reasoning: meerwerkAny?.reasoning || null,
              processing: false,
              ...(json.data.type === 'dispute' && json.data.disputeTypes?.length ? { dispute_types: json.data.disputeTypes } : {}),
              ...(!location && json.data.extractedLocation ? { location: json.data.extractedLocation } : {}),
              ...(!logDate && json.data.extractedDate ? { log_date: json.data.extractedDate } : {}),
            }
          : { processing: false };
        await supabase.from('field_logs').update(updates).eq('id', entry.id);
        setFieldLogs(prev => prev.map(l => l.id === entry.id ? mapLog({ ...entry, ...updates }) : l));

        // Auto-schedule self-reminders
        for (const out of recs.filter(o => o.type === 'self_reminder' && o.dueAt)) {
          try {
            await addReminder({
              subject: out.subject || 'Reminder',
              body: out.body || '',
              recipient: null,
              recipientKind: 'internal',
              dueAt: new Date(out.dueAt).toISOString(),
              fieldLogId: entry.id,
            });
          } catch (err) { console.warn('reminder scheduling failed:', err.message); }
        }
      }).catch(async () => {
        await supabase.from('field_logs').update({ processing: false }).eq('id', entry.id);
        setFieldLogs(prev => prev.map(l => l.id === entry.id ? { ...l, processing: false } : l));
      });
    return mapped;
  };
  const updateFieldLog = async (id, updates) => {
    const db = {};
    if ('processedSummary' in updates) db.processed_summary = updates.processedSummary;
    if ('type'            in updates)  db.type              = updates.type;
    if ('flags'           in updates)  db.flags             = updates.flags;
    if ('impact'          in updates)  db.impact            = updates.impact;
    if ('actionRequired'  in updates)  db.action_required   = updates.actionRequired;
    if ('suggestRFI'      in updates)  db.suggest_rfi       = updates.suggestRFI;
    if ('processing'      in updates)  db.processing        = updates.processing;
    if ('label'           in updates)  db.label             = updates.label;
    if ('location'        in updates)  db.location          = updates.location;
    if ('logDate'         in updates)  db.log_date          = updates.logDate;
    if ('treated'                in updates) db.treated                 = updates.treated;
    if ('disputeTypes'           in updates) db.dispute_types           = updates.disputeTypes;
    if ('meerwerkClassification' in updates) db.meerwerk_classification = updates.meerwerkClassification;
    if ('meerwerkReasoning'      in updates) db.meerwerk_reasoning      = updates.meerwerkReasoning;
    if ('workpoints'             in updates) db.workpoints              = updates.workpoints;
    if ('recommendedOutputs'     in updates) db.recommended_outputs     = updates.recommendedOutputs;
    if ('snoozedUntil'           in updates) db.snoozed_until           = updates.snoozedUntil;
    await supabase.from('field_logs').update(db).eq('id', id);
    setFieldLogs(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };
  const deleteFieldLog = async (id) => {
    await supabase.from('field_logs').delete().eq('id', id);
    setFieldLogs(prev => prev.filter(l => l.id !== id));
  };

  // Re-run AI extraction + classification + output drafts on an existing log.
  const reprocessLog = async (id) => {
    const log = fieldLogs.find(l => l.id === id);
    if (!log?.rawNote) throw new Error('Geen ruwe notitie om te verwerken');

    setFieldLogs(prev => prev.map(l => l.id === id ? { ...l, processing: true } : l));

    try {
      const procRes = await fetch('/api/process-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: log.rawNote, location: log.location || '',
          contacts: projectContacts.map(c => ({ name: c.name, role: c.role, email: c.email })),
          contextItems: contextItems.map(i => ({ category: i.category, title: i.title, content: i.content, source: i.source })),
          projectName: project.name,
        }),
      });
      const procJson = await procRes.json();
      if (!procJson.success) throw new Error(procJson.error || 'process-log faalde');

      const wp   = Array.isArray(procJson.data.workpoints)         ? procJson.data.workpoints         : [];
      const recs = Array.isArray(procJson.data.recommendedOutputs) ? procJson.data.recommendedOutputs : [];
      const meerwerkAny = wp.find(p => p.classification === 'meerwerk');

      const dbUpdates = {
        processed_summary:       procJson.data.summary || log.processedSummary,
        type:                    procJson.data.type    || log.type,
        flags:                   procJson.data.flags   || log.flags,
        impact:                  procJson.data.impact  || log.impact,
        action_required:         procJson.data.actionRequired ?? log.actionRequired,
        suggest_rfi:             procJson.data.suggestRFI     ?? log.suggestRFI,
        workpoints:              wp,
        recommended_outputs:     recs,
        meerwerk_classification: meerwerkAny ? 'meerwerk'
                                 : (wp.length && wp.every(p => p.classification === 'in_scope') ? 'in_scope' : (wp.length ? 'twijfel' : null)),
        meerwerk_reasoning:      meerwerkAny?.reasoning || null,
        processing:              false,
      };
      const { error: updErr } = await supabase.from('field_logs').update(dbUpdates).eq('id', id);
      if (updErr) throw new Error(updErr.message);

      setFieldLogs(prev => prev.map(l => l.id === id
        ? { ...l,
            processedSummary:       dbUpdates.processed_summary,
            type:                   dbUpdates.type,
            flags:                  dbUpdates.flags,
            impact:                 dbUpdates.impact,
            actionRequired:         dbUpdates.action_required,
            suggestRFI:             dbUpdates.suggest_rfi,
            workpoints:             wp,
            recommendedOutputs:     recs,
            meerwerkClassification: dbUpdates.meerwerk_classification,
            meerwerkReasoning:      dbUpdates.meerwerk_reasoning,
            processing:             false }
        : l
      ));
    } catch (err) {
      setFieldLogs(prev => prev.map(l => l.id === id ? { ...l, processing: false } : l));
      throw err;
    }
  };

  // ── RFIs ───────────────────────────────────────────────────────────────────
  const addRFI = async (rfi) => {
    const num = `RFI-${String(rfis.length + 1).padStart(3, '0')}`;
    const { data, error } = await supabase.from('rfis').insert({
      project_id: project.id, number: num, title: rfi.title,
      context: rfi.context || null, draft: rfi.draft || '', status: 'draft', field_log_id: rfi.fieldLogId || null,
    }).select().single();
    if (error) { console.error('insert rfi:', error.message); return; }
    const mapped = mapRFI(data);
    setRFIs(prev => [mapped, ...prev]);
    return mapped;
  };
  const updateRFI = async (id, updates) => {
    const db = { updated_at: new Date().toISOString() };
    if ('title'              in updates) db.title               = updates.title;
    if ('context'            in updates) db.context             = updates.context;
    if ('draft'              in updates) db.draft               = updates.draft;
    if ('emailDraft'         in updates) db.email_draft         = updates.emailDraft;
    if ('pricingProposition' in updates) db.pricing_proposition = updates.pricingProposition;
    if ('status'             in updates) db.status              = updates.status;
    if ('number'             in updates) db.number              = updates.number;
    const { error: rfiUpdateError } = await supabase.from('rfis').update(db).eq('id', id);
    if (rfiUpdateError) console.error('[updateRFI] save failed:', rfiUpdateError.message, { id, updates });
    setRFIs(prev => prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: db.updated_at } : r));
  };
  const deleteRFI = async (id) => {
    await supabase.from('rfis').delete().eq('id', id);
    setRFIs(prev => prev.filter(r => r.id !== id));
  };

  // ── Punch List ─────────────────────────────────────────────────────────────
  const addPunchItem = async (item) => {
    const payload = {
      project_id: project.id, task: item.task, assignee: item.assignee || null,
      priority: item.priority || 'medium', due_date: item.dueDate || null,
      notes: item.notes || null, status: 'pending', category: item.category || null,
    };
    let { data, error } = await supabase.from('punch_items').insert(payload).select().single();
    // Retry without category if the column doesn't exist yet (migration not run)
    if (error?.message?.includes('category')) {
      const { category, ...withoutCategory } = payload;
      ({ data, error } = await supabase.from('punch_items').insert(withoutCategory).select().single());
    }
    if (error) { console.error('insert punch:', error.message); throw new Error(error.message); }
    setPunchItems(prev => [...prev, mapPunch(data)]);
  };
  const updatePunchItem = async (id, updates) => {
    const db = {};
    if ('task'     in updates) db.task       = updates.task;
    if ('assignee' in updates) db.assignee   = updates.assignee;
    if ('priority' in updates) db.priority   = updates.priority;
    if ('dueDate'  in updates) db.due_date   = updates.dueDate;
    if ('notes'    in updates) db.notes      = updates.notes;
    if ('category' in updates) db.category   = updates.category;
    if ('status'   in updates) { db.status = updates.status; if (updates.status === 'completed') db.completed_at = new Date().toISOString(); }
    await supabase.from('punch_items').update(db).eq('id', id);
    setPunchItems(prev => prev.map(p => p.id === id ? { ...p, ...updates, ...(db.completed_at ? { completedAt: db.completed_at } : {}) } : p));
  };
  const deletePunchItem = async (id) => {
    await supabase.from('punch_items').delete().eq('id', id);
    setPunchItems(prev => prev.filter(p => p.id !== id));
  };

  // ── Subcontractors ─────────────────────────────────────────────────────────
  const addSub = async (sub) => {
    const { data, error } = await supabase.from('subcontractors').insert({
      project_id: project.id, company: sub.company, trade: sub.trade || null,
      contact: sub.contact || null, phone: sub.phone || null, crew_size: sub.crewSize || 0,
      work_area: sub.workArea || null, status: sub.status || 'on_site', notes: sub.notes || null,
    }).select().single();
    if (error) { console.error('insert sub:', error.message); return; }
    setSubs(prev => [...prev, mapSub(data)]);
  };
  const updateSub = async (id, updates) => {
    const db = {};
    if ('company'  in updates) db.company   = updates.company;
    if ('trade'    in updates) db.trade     = updates.trade;
    if ('contact'  in updates) db.contact   = updates.contact;
    if ('phone'    in updates) db.phone     = updates.phone;
    if ('crewSize' in updates) db.crew_size = updates.crewSize;
    if ('workArea' in updates) db.work_area = updates.workArea;
    if ('status'   in updates) db.status    = updates.status;
    if ('notes'    in updates) db.notes     = updates.notes;
    await supabase.from('subcontractors').update(db).eq('id', id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  const deleteSub = async (id) => {
    await supabase.from('subcontractors').delete().eq('id', id);
    setSubs(prev => prev.filter(s => s.id !== id));
  };

  // ── Variations ─────────────────────────────────────────────────────────────
  const addVariation = async (v) => {
    const num = `VAR-${String(variations.length + 1).padStart(3, '0')}`;
    const { data, error } = await supabase.from('variations').insert({
      project_id: project.id, number: num, description: v.description,
      requested_by: v.requestedBy || null, estimated_cost: v.estimatedCost || null,
      notes: v.notes || null, status: 'draft', field_log_id: v.fieldLogId || null,
    }).select().single();
    if (error) { console.error('insert variation:', error.message); return; }
    setVariations(prev => [mapVariation(data), ...prev]);
  };
  const updateVariation = async (id, updates) => {
    const db = { updated_at: new Date().toISOString() };
    if ('description'   in updates) db.description    = updates.description;
    if ('requestedBy'   in updates) db.requested_by   = updates.requestedBy;
    if ('estimatedCost' in updates) db.estimated_cost = updates.estimatedCost;
    if ('status'        in updates) db.status         = updates.status;
    if ('notes'         in updates) db.notes          = updates.notes;
    await supabase.from('variations').update(db).eq('id', id);
    setVariations(prev => prev.map(v => v.id === id ? { ...v, ...updates, updatedAt: db.updated_at } : v));
  };
  const deleteVariation = async (id) => {
    await supabase.from('variations').delete().eq('id', id);
    setVariations(prev => prev.filter(v => v.id !== id));
  };

  // ── Context Items ──────────────────────────────────────────────────────────
  const addContextItem = async (item) => {
    const { data, error } = await supabase.from('project_context').insert({
      project_id: project.id, category: item.category, title: item.title,
      content: item.content, source: item.source || null,
    }).select().single();
    if (error) throw new Error(error.message);
    setContextItems(prev => [mapContext(data), ...prev]);
  };
  const updateContextItem = async (id, updates) => {
    const db = { updated_at: new Date().toISOString() };
    if ('category' in updates) db.category = updates.category;
    if ('title'    in updates) db.title    = updates.title;
    if ('content'  in updates) db.content  = updates.content;
    if ('source'   in updates) db.source   = updates.source;
    await supabase.from('project_context').update(db).eq('id', id);
    setContextItems(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };
  const deleteContextItem = async (id) => {
    await supabase.from('project_context').delete().eq('id', id);
    setContextItems(prev => prev.filter(c => c.id !== id));
  };
  // ── Disputes ───────────────────────────────────────────────────────────────
  const addDispute = async ({ senderEmail, subject, disputeTypes, description }) => {
    const num = `DIS-${String(disputes.length + 1).padStart(3, '0')}`;
    const { data: dispute, error } = await supabase.from('disputes').insert({
      project_id: project.id, number: num,
      sender_email: senderEmail || null, subject: subject || null, status: 'open',
    }).select().single();
    if (error) { console.error('insert dispute:', error.message); return; }
    const mapped = mapDispute(dispute);
    setDisputes(prev => [mapped, ...prev]);
    if (disputeTypes?.length) {
      const points = disputeTypes.map(type => ({ dispute_id: dispute.id, type, description: description || null }));
      const { data: ptsData } = await supabase.from('dispute_points').insert(points).select();
      if (ptsData) setDisputePoints(prev => [...prev, ...(ptsData.map(mapDisputePoint))]);
    }
    return mapped;
  };
  const updateDispute = async (id, updates) => {
    const db = { updated_at: new Date().toISOString() };
    if ('status'  in updates) db.status  = updates.status;
    if ('subject' in updates) db.subject = updates.subject;
    await supabase.from('disputes').update(db).eq('id', id);
    setDisputes(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };
  const generateGapQuestions = async (disputePointId) => {
    const res = await fetch('/api/generate-gap-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputePointId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const newQuestions = (json.questions || []).map(mapDisputeQuestion);
    setDisputeQuestions(prev => [
      ...prev.filter(q => q.disputePointId !== disputePointId),
      ...newQuestions,
    ]);
  };
  const answerDisputeQuestion = async (questionId, answer) => {
    await supabase.from('dispute_questions').update({ answer }).eq('id', questionId);
    setDisputeQuestions(prev => prev.map(q => q.id === questionId ? { ...q, answer } : q));
  };
  const collectEvidence = async (disputePointId) => {
    const res = await fetch('/api/collect-evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputePointId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const newEvidence = (json.evidence || []).map(mapDisputeEvidence);
    setDisputeEvidence(prev => [
      ...prev.filter(e => e.disputePointId !== disputePointId),
      ...newEvidence,
    ]);
  };
  const removeEvidence = async (evidenceId) => {
    await supabase.from('dispute_evidence').delete().eq('id', evidenceId);
    setDisputeEvidence(prev => prev.filter(e => e.id !== evidenceId));
  };
  const reconstructTimeline = async (disputePointId) => {
    const res = await fetch('/api/reconstruct-timeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputePointId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setDisputePoints(prev => prev.map(p =>
      p.id === disputePointId
        ? { ...p, timelineReconstruction: json.narrative, timelineReconstructedAt: new Date().toISOString() }
        : p
    ));
  };
  const generateDraftResponse = async (disputePointId) => {
    const res = await fetch('/api/generate-draft-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputePointId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setDisputePoints(prev => prev.map(p =>
      p.id === disputePointId
        ? { ...p, draftResponse: json.draft, draftGeneratedAt: json.generatedAt }
        : p
    ));
  };
  const saveDraftResponse = async (disputePointId, draft) => {
    await supabase.from('dispute_points').update({ draft_response: draft }).eq('id', disputePointId);
    setDisputePoints(prev => prev.map(p =>
      p.id === disputePointId ? { ...p, draftResponse: draft } : p
    ));
  };
  const markDisputeUnderReview = async (disputeId) => {
    const db = { status: 'under_review', updated_at: new Date().toISOString() };
    await supabase.from('disputes').update(db).eq('id', disputeId);
    setDisputes(prev => prev.map(d => d.id === disputeId ? { ...d, status: 'under_review' } : d));
  };
  const markDisputeSent = async (disputeId, recipientEmail) => {
    const res = await fetch('/api/send-dispute-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputeId, recipientEmail }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.detail || 'Send failed');
    setDisputes(prev => prev.map(d => d.id === disputeId ? { ...d, status: 'sent', sentAt: json.sentAt } : d));
  };
  const archiveDispute = async (disputeId) => {
    const archivedAt = new Date().toISOString();
    await supabase.from('disputes').update({ status: 'archived', archived_at: archivedAt, updated_at: archivedAt }).eq('id', disputeId);
    setDisputes(prev => prev.map(d => d.id === disputeId ? { ...d, status: 'archived', archivedAt } : d));
  };
  const reopenDispute = async (disputeId) => {
    const now = new Date().toISOString();
    await supabase.from('disputes').update({ status: 'open', archived_at: null, updated_at: now }).eq('id', disputeId);
    setDisputes(prev => prev.map(d => d.id === disputeId ? { ...d, status: 'open', archivedAt: null } : d));
  };
  const exportDisputeDossier = async (disputeId) => {
    const res = await fetch('/api/generate-dispute-dossier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputeId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const blob = new Blob([json.html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) win.addEventListener('load', () => { win.focus(); URL.revokeObjectURL(url); });
  };

  // ── Outbound emails ────────────────────────────────────────────────────────
  const sendEmail = async ({ to, cc, bcc, replyTo, subject, body, html, fieldLogId, rfiId, variationId, disputeId }) => {
    if (!project?.id) throw new Error('No project loaded');
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id, userId: user?.id || null,
        to, cc, bcc, replyTo, subject, body, html,
        fieldLogId, rfiId, variationId, disputeId,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Email send failed');
    if (json.record) {
      setOutboundEmails(prev => [mapOutboundEmail(json.record), ...prev]);
    }
    if (fieldLogId) {
      setFieldLogs(prev => prev.map(l => l.id === fieldLogId ? { ...l, treated: true } : l));
    }
    if (rfiId) {
      setRFIs(prev => prev.map(r => r.id === rfiId ? { ...r, status: 'sent' } : r));
    }
    if (variationId) {
      setVariations(prev => prev.map(v => v.id === variationId ? { ...v, status: 'sent' } : v));
    }
    return json.record;
  };

  // ── Project contacts ───────────────────────────────────────────────────────
  const addProjectContact = async (fields) => {
    if (!project?.id) throw new Error('No project loaded');
    const res = await fetch('/api/project-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, ...fields }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Kon contact niet aanmaken');
    setProjectContacts(prev => [json.contact, ...prev]);
    return json.contact;
  };
  const updateProjectContact = async (id, fields) => {
    const res = await fetch('/api/project-contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setProjectContacts(prev => prev.map(c => c.id === id ? json.contact : c));
  };
  const deleteProjectContact = async (id) => {
    const res = await fetch('/api/project-contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setProjectContacts(prev => prev.filter(c => c.id !== id));
  };

  // ── Reminders ──────────────────────────────────────────────────────────────
  const addReminder = async ({ subject, body, recipient, recipientKind = 'external', dueAt, fieldLogId = null }) => {
    if (!project?.id) throw new Error('No project loaded');
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id, userId: user?.id || null,
        fieldLogId, subject, body, recipient, recipientKind, dueAt,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Reminder aanmaken mislukt');
    setReminders(prev => [...prev, mapReminder(json.reminder)]
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)));
    return json.reminder;
  };
  const updateReminder = async (id, updates) => {
    const res = await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setReminders(prev => prev.map(r => r.id === id ? mapReminder(json.reminder) : r));
  };
  const cancelReminder = async (id) => {
    const res = await fetch('/api/reminders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
  };

  // ── Loading / Auth gates ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F2E8] via-[#F8F5EB] to-[#F2EEE0] flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-[#280063]/25 rounded-2xl blur-xl" />
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-brand" style={{ background: '#280063' }}>
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          </div>
          <p className="text-[13px] text-[var(--text-tertiary)] font-medium tracking-wide">Punchlister laden…</p>
        </motion.div>
      </div>
    );
  }

  if (!user) return <Login />;

  // Backoffice — platform admins only, no project required
  if (view === 'backoffice' || view === 'backofficeCompany') {
    if (!platformAdminChecked || !isPlatformAdmin) return null; // wait for check or redirect in progress
    return (
      <BackofficeShell
        currentView={view}
        onNavigate={navigate}
        onBackToApp={() => navigate('dashboard')}
      >
        {view === 'backoffice' && <Backoffice onNavigate={navigate} />}
        {view === 'backofficeCompany' && (
          <BackofficeCompany companyId={viewParams.companyId} onNavigate={navigate} />
        )}
      </BackofficeShell>
    );
  }

  if (!project && showProjectCreate) {
    return (
      <ProjectSelect
        onSelect={(p) => { selectProject(p); setShowProjectCreate(false); }}
      />
    );
  }

  // Project creation is intentionally removed from the regular UI — only
  // platform admins can create projects via the Backoffice. This guarantees
  // every project is tied to a company (the backoffice flow requires it).
  const viewComponents = !project ? {
    landing:     <LandingDashboard
                   onSelect={selectProject}
                 />,
    settings:    <Settings />,
    admin:       <Admin />,
  } : {
    landing:     <LandingDashboard
                   onSelect={selectProject}
                 />,
    dashboard:   <Vandaag
                   project={project}
                   fieldLogs={fieldLogs}
                   projectMembers={projectMembers}
                   projectContacts={projectContacts}
                   onSendEmail={sendEmail}
                   onMarkTreated={(id, treated = true) => updateFieldLog(id, { treated })}
                   onSnoozeLog={(id, until) => updateFieldLog(id, { snoozedUntil: until })}
                   onDeleteLog={deleteFieldLog}
                   onReprocessLog={reprocessLog}
                   onUpdateLog={updateFieldLog}
                 />,
    timeline:    <ProjectTimeline
                   project={project}
                   fieldLogs={fieldLogs}
                   outboundEmails={outboundEmails}
                   rfis={rfis}
                   punchItems={punchItems}
                   variations={variations}
                   disputes={disputes}
                   reminders={reminders}
                 />,
    report:      <DailyReport
                   project={project}
                   fieldLogs={fieldLogs}
                   rfis={rfis}
                   punchItems={punchItems}
                   contextItems={contextItems}
                   onLogWeatherDelay={async ({ rawNote, location, logDate }) => {
                     // Reuses the normal field-log pipeline: AI processing will classify
                     // this as a delay entry, which surfaces in disputes/variations flows.
                     await submitLog({ rawNote, location, logDate });
                   }}
                 />,
    settings:    <Settings onOpenProjectSettings={() => setShowSettings(true)} />,
    admin:       <Admin />,
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-2)] overflow-hidden relative">
      {/* Ambient gradient orbs */}
      <div className="orb orb-1" aria-hidden />
      <div className="orb orb-2" aria-hidden />
      <div className="orb orb-3" aria-hidden />
      <Sidebar
        currentView={view}
        onNavigate={setView}
        project={project}
        projects={projects}
        onSelectProject={selectProject}
        onOpenSettings={() => setView('settings')}
        onChangeProject={() => { setProject(null); setView('landing'); }}
        userEmail={user?.email}
        isPlatformAdmin={isPlatformAdmin}
        onNavigateBackoffice={() => navigate('backoffice')}
        inboxCount={fieldLogs.filter(l => !l.treated).length}
        onRecord={() => window.dispatchEvent(new CustomEvent('punchlister:quicklog-open'))}
        extraActions={project ? (
          <ProjectTopActions
            onOpenContext={() => setOpenDrawer('context')}
            onOpenContacts={() => setOpenDrawer('contacts')}
            onOpenChat={() => setOpenDrawer('chat')}
            contextCount={contextItems.length}
            contactsCount={projectContacts.length}
          />
        ) : null}
      />
      <main className="flex-1 min-h-0 overflow-auto relative z-10">
        <div className="pb-20 md:pb-0 min-h-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={project ? view : 'landing'}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
            >
              {viewComponents[view] ?? viewComponents.landing}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav currentView={view} onNavigate={setView} />
      <Toast />
      {project && (
        <FloatingChat
          project={project}
          projects={projects}
          userInitials={(user?.email || '?').split('@')[0].slice(0, 2).toUpperCase()}
        />
      )}
      {project && (
        <>
          <ProjectSettings
            open={showSettings}
            onClose={() => setShowSettings(false)}
            project={project}
            onSave={updateProject}
            onChangeProject={() => setProject(null)}
          />
          <QuickLog onSubmit={submitLog} />

          {/* Project drawers */}
          <Drawer open={openDrawer === 'context'} onClose={() => setOpenDrawer(null)}
                  eyebrow="Project context" title="Documenten" width={500}>
            <ContextPanel
              project={project}
              contextItems={contextItems}
              onAdd={addContextItem}
              onDelete={deleteContextItem}
              forwardingEmail={import.meta.env.VITE_INBOUND_EMAIL_ADDRESS
                || `inbox+${project.id.slice(0, 8)}@${import.meta.env.VITE_INBOUND_EMAIL_DOMAIN || 'inbound.punchlister.app'}`}
            />
          </Drawer>

          <Drawer open={openDrawer === 'contacts'} onClose={() => setOpenDrawer(null)}
                  eyebrow="Project" title="Contacten" width={460}>
            <ContactsPanel
              contacts={projectContacts}
              onAdd={addProjectContact}
              onUpdate={updateProjectContact}
              onDelete={deleteProjectContact}
            />
          </Drawer>

          <Drawer open={openDrawer === 'chat'} onClose={() => setOpenDrawer(null)}
                  eyebrow="Project assistent" title={`Chat — ${project.name}`} width={520}>
            <ChatPanel projectId={project.id} projectName={project.name} />
          </Drawer>
        </>
      )}
    </div>
  );
}