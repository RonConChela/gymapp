import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, X, Dumbbell, ChevronRight, ChevronDown, ChevronUp,
  Check, Trash2, Pencil, Star, TrendingUp, TrendingDown, Minus, Flame,
} from "lucide-react";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAY_SHORT = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const STORAGE_KEY = "gym-log-data-v6";
const HIDDEN_DAYS_KEY = "gym-log-hidden-days-v1";
const VISIBLE_COUNT = 4;

// System font stack — renders as San Francisco on iOS/macOS automatically,
// no network fetch, no flash of unstyled text, works offline as a PWA.
const FONT_UI =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const FONT_NUM = FONT_UI; // numeric displays use the same face with tabular-nums for alignment

// ---- design tokens (single source of truth for the visual system) ----
const C = {
  bg: "#000000",
  card: "#1C1C1E",
  cardElevated: "#2C2C2E",
  inset: "#0D0D0F",
  borderSubtle: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.18)",
  textPrimary: "#F5F5F7",
  textSecondary: "rgba(235,235,245,0.6)",
  textMuted: "rgba(235,235,245,0.35)",
  gold: "#E8C547",
  goldTint: "rgba(232,197,71,0.16)",
  goldText: "#16171A",
  cyan: "#64D2FF",
  danger: "#FF6B5B",
  success: "#32D74B",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRoutine() {
  const r = {};
  DAYS.forEach((d) => (r[d] = []));
  return r;
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 0=Lunes ... 6=Domingo, matching the DAYS array order
function mondayBasedIndex(d) {
  const jsDay = d.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

// Returns the calendar date that corresponds to a given weekday (DAYS index) within the current week
function thisWeekDateFor(dayIndex) {
  const today = new Date();
  const todayIdx = mondayBasedIndex(today);
  const d = new Date(today);
  d.setDate(d.getDate() + (dayIndex - todayIdx));
  return d;
}

// Did the given day-bucket (by weekday name) have any logged set on the given ISO date?
function trainedOn(exercisesForDay, iso) {
  return exercisesForDay.some((ex) => ex.logs.some((l) => l.date === iso));
}

function formatDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function initialSets(targetSets) {
  const n = parseInt(targetSets, 10);
  const count = Number.isFinite(n) && n > 0 ? n : 1;
  return Array.from({ length: count }, () => ({ weight: "", reps: "" }));
}

function entryMaxWeight(entry) {
  if (!entry || !entry.sets || entry.sets.length === 0) return null;
  const vals = entry.sets.map((s) => parseFloat(s.weight)).filter((n) => !isNaN(n));
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

// Keeps the page from jumping when the iOS keyboard closes after a save.
function preserveScroll(action) {
  const y = window.scrollY;
  action();
  const restore = () => window.scrollTo(0, y);
  requestAnimationFrame(() => requestAnimationFrame(restore));
  setTimeout(restore, 350);
}

const emptyForm = { mode: null, id: null, name: "", weight: "", reps: "", sets: "", unit: "kg" };

// Walks backward day by day. A "training day" is any weekday bucket that has
// exercises and isn't hidden as a rest day. Counts consecutive trained days,
// skipping rest days silently, breaking on the first missed training day.
function computeStreak(routine, hiddenDays) {
  let streak = 0;
  const todayIdx = mondayBasedIndex(new Date());
  const todayName = DAYS[todayIdx];
  const todayISO = isoToday();
  const todayExs = routine[todayName] || [];
  const todayIsTrainingDay = todayExs.length > 0 && !hiddenDays.includes(todayName);
  if (todayIsTrainingDay && trainedOn(todayExs, todayISO)) streak++;

  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 90; i++) {
    const dName = DAYS[mondayBasedIndex(cursor)];
    const exs = routine[dName] || [];
    const isTrainingDay = exs.length > 0 && !hiddenDays.includes(dName);
    if (isTrainingDay) {
      if (trainedOn(exs, dateToISO(cursor))) streak++;
      else break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function GymLog() {
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [hiddenDays, setHiddenDays] = useState([]);
  const [editingDays, setEditingDays] = useState(false);
  const [logDrafts, setLogDrafts] = useState({});
  const [openLogFor, setOpenLogFor] = useState(null);
  const [exerciseForm, setExerciseForm] = useState(null); // { mode: 'create'|'edit', id, name, weight, reps, sets, unit }
  const nameInputRef = useRef(null);

  // ---- load routine (unchanged storage key/logic) ----
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        setRoutine(result ? JSON.parse(result.value) : emptyRoutine());
      } catch (e) {
        setRoutine(emptyRoutine());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- load hidden-days preference (separate key, independent of routine data) ----
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(HIDDEN_DAYS_KEY);
        setHiddenDays(result ? JSON.parse(result.value) : []);
      } catch (e) {
        setHiddenDays([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (exerciseForm && exerciseForm.mode && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [exerciseForm && exerciseForm.mode, exerciseForm && exerciseForm.id]);

  // Fix: close any open "new exercise" / "edit exercise" form when switching days,
  // so a half-filled form never silently follows you to a different day.
  useEffect(() => {
    setExerciseForm(null);
    setOpenLogFor(null);
  }, [activeDay]);

  // Safety: if the active day was hidden in a previous session, jump to a visible one.
  useEffect(() => {
    if (editingDays) return;
    const visible = DAYS.filter((d) => !hiddenDays.includes(d));
    if (visible.length && !visible.includes(activeDay)) {
      setActiveDay(visible[0]);
    }
  }, [hiddenDays, editingDays]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next) {
    setRoutine(next);
    try {
      const result = await window.storage.set(STORAGE_KEY, JSON.stringify(next));
      if (!result) setSaveError(true);
      else setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }

  async function persistHiddenDays(next) {
    setHiddenDays(next);
    try {
      await window.storage.set(HIDDEN_DAYS_KEY, JSON.stringify(next));
    } catch (e) {
      // non-critical: worst case the visibility choice doesn't persist
    }
  }

  function toggleDayVisibility(day) {
    const isHidden = hiddenDays.includes(day);
    if (isHidden) {
      persistHiddenDays(hiddenDays.filter((d) => d !== day));
      return;
    }
    // never allow hiding the last visible day
    const currentlyVisible = DAYS.length - hiddenDays.length;
    if (currentlyVisible <= 1) return;
    const next = [...hiddenDays, day];
    persistHiddenDays(next);
    if (day === activeDay) {
      const remaining = DAYS.filter((d) => !next.includes(d));
      if (remaining.length) setActiveDay(remaining[0]);
    }
  }

  function deleteExercise(id) {
    const next = { ...routine, [activeDay]: routine[activeDay].filter((e) => e.id !== id) };
    persist(next);
  }

  function moveExercise(id, direction) {
    const list = [...routine[activeDay]];
    const idx = list.findIndex((e) => e.id === id);
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    persist({ ...routine, [activeDay]: list });
  }

  // ---- unified create/edit exercise form (name + target together) ----
  function openCreateForm() {
    setExerciseForm({ ...emptyForm, mode: "create" });
  }
  function openEditForm(ex) {
    setExerciseForm({
      mode: "edit",
      id: ex.id,
      name: ex.name,
      weight: ex.targetWeight || "",
      reps: ex.targetReps || "",
      sets: ex.targetSets || "",
      unit: ex.unit || "kg",
    });
  }
  function closeExerciseForm() {
    setExerciseForm(null);
  }
  function saveExerciseForm() {
    if (!exerciseForm) return;
    const name = exerciseForm.name.trim();
    if (!name) {
      closeExerciseForm();
      return;
    }
    if (exerciseForm.mode === "create") {
      const next = {
        ...routine,
        [activeDay]: [
          ...routine[activeDay],
          {
            id: uid(),
            name,
            unit: exerciseForm.unit,
            targetWeight: exerciseForm.weight,
            targetReps: exerciseForm.reps,
            targetSets: exerciseForm.sets,
            logs: [],
          },
        ],
      };
      persist(next);
    } else {
      const next = {
        ...routine,
        [activeDay]: routine[activeDay].map((e) =>
          e.id === exerciseForm.id
            ? {
                ...e,
                name,
                unit: exerciseForm.unit,
                targetWeight: exerciseForm.weight,
                targetReps: exerciseForm.reps,
                targetSets: exerciseForm.sets,
              }
            : e
        ),
      };
      persist(next);
    }
    closeExerciseForm();
  }

  function openLog(ex) {
    if (openLogFor === ex.id) {
      setOpenLogFor(null);
      return;
    }
    setLogDrafts((s) => ({ ...s, [ex.id]: { date: isoToday(), sets: initialSets(ex.targetSets), note: "" } }));
    setOpenLogFor(ex.id);
  }

  function updateDraft(exId, updater) {
    setLogDrafts((s) => ({ ...s, [exId]: updater(s[exId]) }));
  }

  function saveNewLog(exId) {
    const draft = logDrafts[exId];
    if (!draft) return;
    const cleanSets = draft.sets.filter((s) => s.weight !== "" && s.reps !== "");
    if (cleanSets.length === 0) return;
    const entry = { date: draft.date || isoToday(), sets: cleanSets, note: (draft.note || "").trim() };
    const next = {
      ...routine,
      [activeDay]: routine[activeDay].map((e) =>
        e.id === exId ? { ...e, logs: [...e.logs, entry].slice(-60) } : e
      ),
    };
    persist(next);
    setOpenLogFor(null);
  }

  function deleteLog(exId, index) {
    const next = {
      ...routine,
      [activeDay]: routine[activeDay].map((e) =>
        e.id === exId ? { ...e, logs: e.logs.filter((_, i) => i !== index) } : e
      ),
    };
    persist(next);
  }

  function updateLog(exId, index, updated) {
    const next = {
      ...routine,
      [activeDay]: routine[activeDay].map((e) =>
        e.id === exId ? { ...e, logs: e.logs.map((l, i) => (i === index ? updated : l)) } : e
      ),
    };
    persist(next);
  }

  const streak = useMemo(() => (routine ? computeStreak(routine, hiddenDays) : 0), [routine, hiddenDays]);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingText}>CARGANDO…</div>
      </div>
    );
  }

  const exercises = routine[activeDay] || [];
  const visibleDays = DAYS.filter((d) => !hiddenDays.includes(d));
  const daysToRender = editingDays ? DAYS : visibleDays;
  const todayISO = isoToday();

  return (
    <div style={styles.page}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { background: ${C.bg}; }
        ::selection { background: ${C.gold}; color: ${C.bg}; }
        input:focus, textarea:focus { outline: 2px solid ${C.gold}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
        input[type="date"] { color-scheme: dark; }
        textarea { resize: none; }
        button { transition: transform 0.08s ease, opacity 0.08s ease, background-color 0.15s ease, border-color 0.15s ease; -webkit-font-smoothing: antialiased; }
        button:active { transform: scale(0.96); opacity: 0.8; }
        button:disabled:active { transform: none; opacity: inherit; }
        .tnum { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
      `}</style>

      <div style={styles.topBar}>
        <header style={styles.header}>
          <div style={styles.headerRow}>
            <span style={styles.logoBadge}>
              <span>RUTINA</span>
              <Dumbbell size={15} color={C.goldText} strokeWidth={2.5} />
            </span>
            {streak > 0 && (
              <span style={styles.streakBadge}>
                <Flame size={13} color={C.gold} strokeWidth={2.5} />
                <span className="tnum">{streak}</span>
              </span>
            )}
          </div>
          {saveError && <span style={styles.saveError}>sin conexión — no se guardó</span>}
        </header>

        <nav style={styles.dayNavWrap}>
          <div style={styles.dayNavTrack}>
            {daysToRender.map((d) => {
            const dayIdx = DAYS.indexOf(d);
            const isHidden = hiddenDays.includes(d);
            const active = d === activeDay && !editingDays;

            let dayState = "future"; // future | trained | missed
            if (!editingDays) {
              const exsForDay = routine[d] || [];
              if (exsForDay.length > 0 && !isHidden) {
                const targetISO = dateToISO(thisWeekDateFor(dayIdx));
                if (targetISO < todayISO) {
                  dayState = trainedOn(exsForDay, targetISO) ? "trained" : "missed";
                }
              }
            }

            let bg = "transparent";
            let color = C.textSecondary;
            let opacity = 1;
            if (active) {
              bg = C.gold;
              color = C.goldText;
            } else if (editingDays && isHidden) {
              color = C.textMuted;
              opacity = 0.4;
            } else if (dayState === "trained") {
              bg = C.goldTint;
              color = C.gold;
            } else if (dayState === "missed") {
              bg = "rgba(0,0,0,0.35)";
              color = C.textMuted;
            }

            return (
              <button
                key={d}
                onClick={() => (editingDays ? toggleDayVisibility(d) : setActiveDay(d))}
                style={{
                  ...styles.dayBtn,
                  background: bg,
                  color,
                  opacity,
                  textDecoration: editingDays && isHidden ? "line-through" : "none",
                }}
              >
                {DAY_SHORT[dayIdx]}
              </button>
            );
          })}
          </div>
          <button
            onClick={() => setEditingDays((v) => !v)}
            style={styles.editDaysBtn}
            aria-label="Editar días visibles"
          >
            {editingDays ? <Check size={15} color={C.gold} /> : <Pencil size={13} color={C.textMuted} />}
          </button>
        </nav>
        {editingDays && (
          <p style={styles.editDaysHint}>Toca un día para mostrarlo u ocultarlo (ej. tu día de descanso).</p>
        )}
      </div>

      <main style={styles.main}>
        {exercises.length === 0 && exerciseForm?.mode !== "create" && (
          <div style={styles.emptyState}>
            <div style={styles.emptyBar} />
            <p style={styles.emptyText}>
              Sin ejercicios para {activeDay.toLowerCase()}. Anota el primero.
            </p>
          </div>
        )}

        {exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            isFirst={i === 0}
            isLast={i === exercises.length - 1}
            onMoveUp={() => moveExercise(ex.id, -1)}
            onMoveDown={() => moveExercise(ex.id, 1)}
            onDelete={() => deleteExercise(ex.id)}
            isEditingThis={exerciseForm?.mode === "edit" && exerciseForm.id === ex.id}
            formValue={exerciseForm}
            onFormChange={setExerciseForm}
            onOpenEdit={() => openEditForm(ex)}
            onSaveForm={() => preserveScroll(saveExerciseForm)}
            onCancelForm={closeExerciseForm}
            nameInputRef={nameInputRef}
            openLog={openLogFor === ex.id}
            onToggleLog={() => openLog(ex)}
            draft={logDrafts[ex.id]}
            onDraftChange={(updater) => updateDraft(ex.id, updater)}
            onSaveNewLog={() => preserveScroll(() => saveNewLog(ex.id))}
            onDeleteLog={(idx) => deleteLog(ex.id, idx)}
            onUpdateLog={(idx, updated) => updateLog(ex.id, idx, updated)}
          />
        ))}

        {exerciseForm?.mode === "create" ? (
          <div style={styles.exerciseFormBlock}>
            <ExerciseForm
              value={exerciseForm}
              onChange={setExerciseForm}
              onSave={() => preserveScroll(saveExerciseForm)}
              onCancel={closeExerciseForm}
              nameInputRef={nameInputRef}
            />
          </div>
        ) : (
          <button onClick={openCreateForm} style={styles.addExerciseBtn}>
            <Plus size={18} strokeWidth={2.5} />
            <span>Anotar ejercicio</span>
          </button>
        )}
      </main>
    </div>
  );
}

// Shared name + target(+unit) form, used both to create a new exercise
// and to edit an existing one's name/objective in a single step.
function ExerciseForm({ value, onChange, onSave, onCancel, nameInputRef }) {
  return (
    <>
      <input
        ref={nameInputRef}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Nombre del ejercicio…"
        style={styles.formNameInput}
      />
      <div style={styles.formTargetRow}>
        <input
          value={value.weight}
          onChange={(e) => onChange({ ...value, weight: e.target.value })}
          placeholder={value.unit}
          inputMode="decimal"
          style={styles.formNumInput}
        />
        <span style={styles.targetSep}>×</span>
        <input
          value={value.reps}
          onChange={(e) => onChange({ ...value, reps: e.target.value })}
          placeholder="reps"
          inputMode="numeric"
          style={styles.formNumInput}
        />
        <span style={styles.targetSep}>×</span>
        <input
          value={value.sets}
          onChange={(e) => onChange({ ...value, sets: e.target.value })}
          placeholder="series"
          inputMode="numeric"
          style={styles.formNumInput}
        />
      </div>
      <div style={styles.formFooter}>
        <div style={styles.unitToggle}>
          {["kg", "lb"].map((u) => (
            <button
              key={u}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ ...value, unit: u })}
              style={{
                ...styles.unitToggleBtn,
                background: value.unit === u ? C.gold : "transparent",
                color: value.unit === u ? C.goldText : C.textSecondary,
              }}
            >
              {u}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onSave} style={styles.btnPrimary}>
            <Check size={16} strokeWidth={2.5} />
            <span>Guardar</span>
          </button>
          <button onClick={onCancel} style={styles.btnGhost}>
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </>
  );
}

function SetRows({ sets, onChange, unit }) {
  function updateSet(idx, field, value) {
    const next = sets.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    onChange(next);
  }
  function removeSet(idx) {
    onChange(sets.filter((_, i) => i !== idx));
  }
  function addSet() {
    onChange([...sets, { weight: "", reps: "" }]);
  }
  return (
    <div style={styles.setRowsWrap}>
      {sets.map((s, i) => (
        <div key={i} style={styles.setRow}>
          <span style={styles.setIndex}>S{i + 1}</span>
          <input
            value={s.weight}
            onChange={(e) => updateSet(i, "weight", e.target.value)}
            placeholder={unit}
            inputMode="decimal"
            style={styles.setInput}
          />
          <span style={styles.targetSep}>×</span>
          <input
            value={s.reps}
            onChange={(e) => updateSet(i, "reps", e.target.value)}
            placeholder="reps"
            inputMode="numeric"
            style={styles.setInput}
          />
          {sets.length > 1 && (
            <button onClick={() => removeSet(i)} style={styles.setRemoveBtn} aria-label="Quitar serie">
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addSet} style={styles.addSetBtn}>
        <Plus size={14} strokeWidth={2.5} />
        <span>Serie</span>
      </button>
    </div>
  );
}

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={12} color={C.success} strokeWidth={2.5} />;
  if (trend === "down") return <TrendingDown size={12} color={C.danger} strokeWidth={2.5} />;
  if (trend === "same") return <Minus size={12} color={C.textMuted} strokeWidth={2.5} />;
  return null;
}

function ExerciseCard({
  ex,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
  isEditingThis,
  formValue,
  onFormChange,
  onOpenEdit,
  onSaveForm,
  onCancelForm,
  nameInputRef,
  openLog,
  onToggleLog,
  draft,
  onDraftChange,
  onSaveNewLog,
  onDeleteLog,
  onUpdateLog,
}) {
  const unit = ex.unit || "kg";
  const hasTarget = ex.targetWeight || ex.targetReps || ex.targetSets;
  const [editingLogIdx, setEditingLogIdx] = useState(null);
  const [expandedLogIdx, setExpandedLogIdx] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const indexedLogs = ex.logs.map((l, idx) => ({ l, idx }));
  const last4 = indexedLogs.slice(-VISIBLE_COUNT);
  const visible = showAllLogs ? indexedLogs : last4;
  const hasHidden = indexedLogs.length > VISIBLE_COUNT;

  const globalPR = ex.logs.length
    ? Math.max(...ex.logs.map((l) => entryMaxWeight(l)).filter((v) => v !== null))
    : null;
  const monthlyPR = last4.length
    ? Math.max(...last4.map(({ l }) => entryMaxWeight(l)).filter((v) => v !== null))
    : null;

  function trendFor(idx) {
    if (idx === 0) return null;
    const prevMax = entryMaxWeight(ex.logs[idx - 1]);
    const curMax = entryMaxWeight(ex.logs[idx]);
    if (prevMax === null || curMax === null) return null;
    if (curMax > prevMax) return "up";
    if (curMax < prevMax) return "down";
    return "same";
  }

  function startEditLog(realIdx, entry) {
    setEditingLogIdx(realIdx);
    setEditDraft({ date: entry.date, sets: entry.sets.map((s) => ({ ...s })), note: entry.note || "" });
  }

  function saveLogEdit(realIdx) {
    const cleanSets = editDraft.sets.filter((s) => s.weight !== "" && s.reps !== "");
    if (cleanSets.length === 0) return;
    onUpdateLog(realIdx, { date: editDraft.date, sets: cleanSets, note: (editDraft.note || "").trim() });
    setEditingLogIdx(null);
    setExpandedLogIdx(null);
  }

  if (isEditingThis) {
    return (
      <div style={styles.card}>
        <div style={styles.exerciseFormBlockInline}>
          <ExerciseForm value={formValue} onChange={onFormChange} onSave={onSaveForm} onCancel={onCancelForm} nameInputRef={nameInputRef} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <button onClick={onOpenEdit} style={styles.exNameBtn}>
          <span style={styles.exName}>{ex.name}</span>
          <Pencil size={11} color={C.textMuted} />
        </button>
        <div style={styles.actionGroup}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ ...styles.actionBtn, opacity: isFirst ? 0.3 : 1 }} aria-label="Subir">
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} style={{ ...styles.actionBtn, opacity: isLast ? 0.3 : 1 }} aria-label="Bajar">
            <ChevronDown size={14} />
          </button>
          <button onClick={onDelete} style={styles.actionBtn} aria-label="Eliminar ejercicio">
            <Trash2 size={14} color={C.danger} />
          </button>
        </div>
      </div>

      <button onClick={onOpenEdit} style={styles.targetRow}>
        <span style={styles.targetLabel}>OBJETIVO</span>
        {hasTarget ? (
          <span style={styles.targetValue}>
            <span style={styles.targetNum}>{ex.targetWeight || "–"}</span><span style={styles.unit}>{unit}</span>
            <span style={styles.targetSep}>×</span>
            <span style={styles.targetNum}>{ex.targetReps || "–"}</span><span style={styles.unit}>reps</span>
            <span style={styles.targetSep}>×</span>
            <span style={styles.targetNum}>{ex.targetSets || "–"}</span><span style={styles.unit}>series</span>
          </span>
        ) : (
          <span style={styles.targetPlaceholder}>tocar para fijar objetivo</span>
        )}
      </button>

      <div style={styles.logSection}>
        <div style={styles.logHeaderRow}>
          <span style={styles.logLabel}>REGISTROS</span>
          {(globalPR !== null || monthlyPR !== null) && (
            <div style={styles.prBadges}>
              {monthlyPR !== null && (
                <span style={styles.prBadgeGold}>
                  <Star size={9} fill={C.gold} color={C.gold} /> {monthlyPR}{unit}
                </span>
              )}
              {globalPR !== null && (
                <span style={styles.prBadgeCyan}>
                  <Star size={9} fill={C.cyan} color={C.cyan} /> {globalPR}{unit}
                </span>
              )}
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <span style={styles.noLogs}>todavía sin registros</span>
        ) : (
          <div style={styles.logList}>
            {visible.map(({ l, idx }) => {
              const isGlobalPR = globalPR !== null && entryMaxWeight(l) === globalPR;
              const isMonthlyPR = monthlyPR !== null && entryMaxWeight(l) === monthlyPR && last4.some((it) => it.idx === idx);
              const trend = trendFor(idx);

              if (editingLogIdx === idx) {
                return (
                  <div key={idx} style={styles.logEditBlock}>
                    <div style={styles.logEditDateRow}>
                      <input
                        type="date"
                        value={editDraft.date}
                        onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                        style={styles.logEditDate}
                      />
                      <button
                        onClick={() => {
                          onDeleteLog(idx);
                          setEditingLogIdx(null);
                          setExpandedLogIdx(null);
                        }}
                        style={styles.actionBtnDanger}
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                    <SetRows sets={editDraft.sets} unit={unit} onChange={(sets) => setEditDraft({ ...editDraft, sets })} />
                    <textarea
                      value={editDraft.note}
                      onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                      placeholder="Nota (opcional)"
                      rows={2}
                      style={styles.noteInput}
                    />
                    <div style={styles.logEditActions}>
                      <button onClick={() => preserveScroll(() => saveLogEdit(idx))} style={styles.btnPrimary}>
                        <Check size={15} strokeWidth={2.5} />
                        <span>Guardar</span>
                      </button>
                      <button onClick={() => setEditingLogIdx(null)} style={styles.btnGhost}>
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
              }

              if (expandedLogIdx === idx) {
                return (
                  <div key={idx} style={styles.logExpandedBlock}>
                    <div style={styles.logExpandedHeader}>
                      <div style={styles.logExpandedHeaderLeft}>
                        <span style={styles.logRowDate}>{formatDate(l.date)}</span>
                        <TrendIcon trend={trend} />
                        {isMonthlyPR && <Star size={11} fill={C.gold} color={C.gold} />}
                        {isGlobalPR && <Star size={11} fill={C.cyan} color={C.cyan} />}
                      </div>
                      <button onClick={() => startEditLog(idx, l)} style={styles.editIconBtn} aria-label="Editar">
                        <Pencil size={14} color={C.gold} />
                      </button>
                    </div>
                    <div style={styles.logExpandedSets}>
                      {l.sets.map((s, si) => (
                        <div key={si} style={styles.logExpandedSetRow}>
                          <span style={styles.setIndex}>S{si + 1}</span>
                          <span style={styles.logExpandedSetValue}>
                            {s.weight}<span style={styles.chipUnit}>{unit}</span> × {s.reps}<span style={styles.chipUnit}>reps</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {l.note && <p style={styles.noteText}>{l.note}</p>}
                    <button onClick={() => setExpandedLogIdx(null)} style={styles.collapseBtn}>
                      <ChevronUp size={13} /> <span>cerrar</span>
                    </button>
                  </div>
                );
              }

              return (
                <button key={idx} style={styles.logRow} onClick={() => setExpandedLogIdx(idx)}>
                  <span style={styles.logRowDateGroup}>
                    <span style={styles.logRowDate}>{formatDate(l.date)}</span>
                    <TrendIcon trend={trend} />
                    {isMonthlyPR && <Star size={10} fill={C.gold} color={C.gold} />}
                    {isGlobalPR && <Star size={10} fill={C.cyan} color={C.cyan} />}
                  </span>
                  <div style={styles.logRowSets}>
                    {l.sets.map((s, si) => (
                      <span key={si} style={styles.setBadge}>
                        {s.weight}<span style={styles.chipUnit}>{unit}</span>×{s.reps}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {hasHidden && (
          <button onClick={() => setShowAllLogs(!showAllLogs)} style={styles.showMoreBtn}>
            {showAllLogs ? (
              <>
                <ChevronUp size={13} /> <span>Ver menos</span>
              </>
            ) : (
              <>
                <ChevronDown size={13} /> <span>Ver historial completo ({ex.logs.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {openLog && draft ? (
        <div style={styles.logAddBlock}>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => onDraftChange((d) => ({ ...d, date: e.target.value }))}
            style={styles.logEditDate}
          />
          <SetRows sets={draft.sets} unit={unit} onChange={(sets) => onDraftChange((d) => ({ ...d, sets }))} />
          <textarea
            value={draft.note}
            onChange={(e) => onDraftChange((d) => ({ ...d, note: e.target.value }))}
            placeholder="Nota (opcional)"
            rows={2}
            style={styles.noteInput}
          />
          <div style={styles.logEditActions}>
            <button onClick={onSaveNewLog} style={styles.btnPrimary}>
              <Check size={15} strokeWidth={2.5} />
              <span>Guardar</span>
            </button>
            <button onClick={onToggleLog} style={styles.btnGhost}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onToggleLog} style={styles.registerBtn}>
          <span>Registrar</span>
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.textPrimary,
    fontFamily: FONT_UI,
    paddingBottom: "40px",
  },
  loadingText: {
    padding: "40px 20px",
    fontFamily: FONT_NUM,
    color: C.textMuted,
    letterSpacing: "2px",
    fontSize: "13px",
  },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    paddingTop: "env(safe-area-inset-top)",
    borderBottom: `1px solid ${C.borderSubtle}`,
  },
  header: { padding: "12px 14px 10px" },
  headerRow: { display: "flex", alignItems: "center", gap: "10px" },
  logoBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: C.gold,
    color: C.goldText,
    fontFamily: FONT_NUM,
    fontWeight: 700,
    fontSize: "13px",
    letterSpacing: "1.5px",
    padding: "7px 11px",
    borderRadius: "6px",
    lineHeight: 1,
  },
  streakBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontFamily: FONT_NUM,
    fontWeight: 700,
    fontSize: "13px",
    color: C.textPrimary,
  },
  saveError: {
    display: "block",
    marginTop: "6px",
    fontFamily: FONT_NUM,
    fontSize: "9px",
    color: C.danger,
    letterSpacing: "0.3px",
  },

  dayNavWrap: { display: "flex", gap: "8px", padding: "0 10px 10px", alignItems: "center" },
  dayNavTrack: {
    flex: 1,
    display: "flex",
    gap: "2px",
    background: "rgba(120,120,128,0.16)",
    borderRadius: "9px",
    padding: "2px",
  },
  dayBtn: {
    flex: 1,
    minHeight: "40px",
    padding: "0 2px",
    borderRadius: "7px",
    border: "none",
    fontFamily: FONT_NUM,
    fontWeight: 600,
    fontSize: "12px",
    letterSpacing: "0.2px",
    cursor: "pointer",
  },
  editDaysBtn: {
    flexShrink: 0,
    width: "36px",
    minHeight: "40px",
    background: "rgba(120,120,128,0.16)",
    border: "none",
    borderRadius: "9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  editDaysHint: {
    margin: "0 10px 10px",
    fontFamily: FONT_UI,
    fontSize: "11.5px",
    color: C.textSecondary,
  },

  main: { padding: "14px 12px 0" },
  emptyState: { padding: "36px 8px", textAlign: "center" },
  emptyBar: { width: "36px", height: "3px", background: C.gold, margin: "0 auto 16px", borderRadius: "2px" },
  emptyText: { color: C.textSecondary, fontSize: "14px", fontFamily: FONT_UI, fontWeight: 400, margin: 0 },

  card: {
    background: C.card,
    border: `1px solid ${C.borderSubtle}`,
    borderRadius: "16px",
    padding: "14px 14px 12px",
    marginBottom: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" },
  exNameBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "none",
    border: "none",
    padding: "4px 0",
    cursor: "pointer",
    minWidth: 0,
  },
  exName: {
    fontSize: "16.5px",
    fontWeight: 600,
    letterSpacing: "0.2px",
    color: C.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionGroup: { display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 },
  actionBtn: {
    width: "34px",
    height: "34px",
    background: "none",
    border: "none",
    borderRadius: "8px",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: C.textSecondary,
    flexShrink: 0,
  },
  actionBtnDanger: {
    width: "34px",
    height: "34px",
    background: "none",
    border: "none",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: C.danger,
    flexShrink: 0,
  },

  targetRow: {
    width: "100%",
    background: C.inset,
    border: `1px solid ${C.borderSubtle}`,
    borderRadius: "10px",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "5px",
    cursor: "pointer",
    marginBottom: "12px",
  },
  targetLabel: { fontFamily: FONT_NUM, fontSize: "10px", color: C.gold, letterSpacing: "1.2px" },
  targetValue: { display: "flex", alignItems: "baseline", flexWrap: "wrap", fontFamily: FONT_NUM },
  targetNum: { fontSize: "20px", fontWeight: 700, color: C.textPrimary },
  targetSep: { color: C.textMuted, fontSize: "13px", margin: "0 7px" },
  unit: { fontSize: "11px", color: C.textSecondary, fontWeight: 400, marginLeft: "2px" },
  targetPlaceholder: { fontFamily: FONT_NUM, fontSize: "11px", color: C.textMuted },

  logSection: { marginBottom: "12px" },
  logHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "7px" },
  logLabel: { fontFamily: FONT_NUM, fontSize: "10px", color: C.textMuted, letterSpacing: "0.6px" },
  prBadges: { display: "flex", gap: "6px" },
  prBadgeGold: { display: "flex", alignItems: "center", gap: "3px", fontFamily: FONT_NUM, fontSize: "10px", fontWeight: 700, color: C.gold },
  prBadgeCyan: { display: "flex", alignItems: "center", gap: "3px", fontFamily: FONT_NUM, fontSize: "10px", fontWeight: 700, color: C.cyan },
  noLogs: { fontFamily: FONT_NUM, fontSize: "11.5px", color: C.textMuted },

  logList: { display: "flex", flexDirection: "column", gap: "6px" },
  logRow: {
    width: "100%",
    background: C.inset,
    border: `1px solid ${C.borderSubtle}`,
    borderRadius: "8px",
    padding: "9px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    cursor: "pointer",
    minHeight: "40px",
  },
  logRowDateGroup: { display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 },
  logRowDate: { fontFamily: FONT_NUM, fontSize: "11px", color: C.textSecondary },
  logRowSets: { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" },
  setBadge: {
    fontFamily: FONT_NUM,
    fontSize: "13px",
    color: C.textPrimary,
    fontWeight: 600,
    background: C.card,
    border: `1px solid ${C.borderSubtle}`,
    borderRadius: "6px",
    padding: "3px 7px",
  },
  chipUnit: { fontSize: "10px", color: C.textSecondary },

  logExpandedBlock: { background: C.inset, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px", display: "flex", flexDirection: "column", gap: "9px" },
  logExpandedHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  logExpandedHeaderLeft: { display: "flex", alignItems: "center", gap: "6px" },
  editIconBtn: { width: "34px", height: "34px", background: "none", border: "none", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  logExpandedSets: { display: "flex", flexDirection: "column", gap: "5px" },
  logExpandedSetRow: { display: "flex", alignItems: "center", gap: "8px" },
  logExpandedSetValue: { fontFamily: FONT_NUM, fontSize: "14px", color: C.textPrimary, fontWeight: 600 },
  noteText: { fontFamily: FONT_UI, fontSize: "12.5px", color: C.textSecondary, fontStyle: "italic", margin: 0, borderLeft: `2px solid ${C.border}`, paddingLeft: "9px" },
  collapseBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", background: "none", border: "none", color: C.textMuted, fontFamily: FONT_NUM, fontSize: "10.5px", cursor: "pointer", padding: "6px" },

  showMoreBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", width: "100%", marginTop: "8px",
    background: "none", border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "9px",
    color: C.textSecondary, fontFamily: FONT_NUM, fontSize: "10.5px", cursor: "pointer", minHeight: "38px",
  },

  logEditBlock: { background: C.inset, border: `1px solid ${C.gold}`, borderRadius: "10px", padding: "11px", display: "flex", flexDirection: "column", gap: "9px" },
  logAddBlock: { background: C.inset, border: `1px solid ${C.borderSubtle}`, borderRadius: "10px", padding: "11px", display: "flex", flexDirection: "column", gap: "9px" },
  logEditDateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  logEditDate: {
    flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px",
    padding: "10px 10px", color: C.textPrimary, fontFamily: FONT_NUM, fontSize: "13px", minWidth: 0, minHeight: "40px",
  },

  setRowsWrap: { display: "flex", flexDirection: "column", gap: "6px" },
  setRow: { display: "flex", alignItems: "center", gap: "6px" },
  setIndex: { fontFamily: FONT_NUM, fontSize: "10px", color: C.textMuted, width: "20px", flexShrink: 0 },
  setInput: {
    flex: 1, minWidth: 0, width: 0, minHeight: "44px",
    background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px",
    padding: "0 8px", color: C.textPrimary, fontFamily: FONT_NUM, fontSize: "15px", fontWeight: 600, textAlign: "center",
  },
  setRemoveBtn: {
    width: "34px", height: "34px", background: "none", border: `1px solid ${C.border}`, borderRadius: "8px",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textSecondary, flexShrink: 0,
  },
  addSetBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", minHeight: "40px",
    background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: "8px",
    color: C.textSecondary, fontFamily: FONT_NUM, fontSize: "11.5px", fontWeight: 600, cursor: "pointer", marginTop: "1px",
  },

  noteInput: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 10px",
    color: C.textPrimary, fontFamily: FONT_UI, fontSize: "13px", width: "100%",
  },
  logEditActions: { display: "flex", alignItems: "center", gap: "8px" },

  registerBtn: {
    width: "100%", minHeight: "46px", background: C.goldTint, border: "none", borderRadius: "12px",
    padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
    color: C.gold, fontFamily: FONT_UI, fontSize: "14px", fontWeight: 600, letterSpacing: "0.2px", cursor: "pointer",
  },

  // ---- unified exercise form (create + edit) ----
  exerciseFormBlock: {
    border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px",
    marginBottom: "14px", display: "flex", flexDirection: "column", gap: "9px", background: C.card,
  },
  exerciseFormBlockInline: {
    display: "flex", flexDirection: "column", gap: "9px",
  },
  formNameInput: {
    background: C.inset, border: `1px solid ${C.border}`, borderRadius: "9px",
    padding: "0 13px", minHeight: "46px", color: C.textPrimary, fontFamily: FONT_UI, fontSize: "15px", fontWeight: 500, minWidth: 0, width: "100%",
  },
  formTargetRow: { display: "flex", alignItems: "center", gap: "6px" },
  formNumInput: {
    flex: 1, minWidth: 0, width: 0, minHeight: "44px",
    background: C.inset, border: `1px solid ${C.border}`, borderRadius: "8px",
    padding: "0 6px", color: C.textPrimary, fontFamily: FONT_NUM, fontSize: "14px", fontWeight: 600, textAlign: "center",
  },
  formFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },

  unitToggle: { display: "flex", border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" },
  unitToggleBtn: {
    border: "none", padding: "0 16px", minHeight: "40px",
    fontFamily: FONT_NUM, fontSize: "12px", fontWeight: 700, cursor: "pointer",
  },

  addExerciseBtn: {
    width: "100%", minHeight: "48px", background: C.goldTint, border: "none", borderRadius: "14px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    color: C.gold, fontFamily: FONT_UI, fontSize: "15px", fontWeight: 600, letterSpacing: "0.2px", cursor: "pointer", marginBottom: "14px",
  },

  // ---- shared buttons ----
  btnPrimary: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
    background: C.gold, border: "none", borderRadius: "10px", minHeight: "44px", padding: "0 16px",
    color: C.goldText, fontFamily: FONT_UI, fontSize: "15px", fontWeight: 600, cursor: "pointer", flex: 1,
  },
  btnGhost: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(120,120,128,0.16)", border: "none", borderRadius: "10px", minHeight: "44px", width: "44px",
    color: C.textSecondary, cursor: "pointer", flexShrink: 0,
  },
};
