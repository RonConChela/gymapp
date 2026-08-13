import React, { useState, useEffect, useRef } from "react";
import {
  Plus, X, Dumbbell, ChevronRight, ChevronDown, ChevronUp,
  Check, Trash2, Pencil, Star, TrendingUp, TrendingDown, Minus,
} from "lucide-react";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAY_SHORT = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const STORAGE_KEY = "gym-log-data-v6";
const VISIBLE_COUNT = 4;

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

export default function GymLog() {
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [addingExercise, setAddingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseUnit, setNewExerciseUnit] = useState("kg");
  const [logDrafts, setLogDrafts] = useState({});
  const [openLogFor, setOpenLogFor] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetDraft, setTargetDraft] = useState({ weight: "", reps: "", sets: "", unit: "kg" });
  const nameInputRef = useRef(null);

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

  useEffect(() => {
    if (addingExercise && nameInputRef.current) nameInputRef.current.focus();
  }, [addingExercise]);

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

  function addExercise() {
    const name = newExerciseName.trim();
    if (!name) {
      setAddingExercise(false);
      return;
    }
    const next = {
      ...routine,
      [activeDay]: [
        ...routine[activeDay],
        { id: uid(), name, unit: newExerciseUnit, targetWeight: "", targetReps: "", targetSets: "", logs: [] },
      ],
    };
    persist(next);
    setNewExerciseName("");
    setNewExerciseUnit("kg");
    setAddingExercise(false);
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

  function saveTarget(id) {
    const next = {
      ...routine,
      [activeDay]: routine[activeDay].map((e) =>
        e.id === id
          ? {
              ...e,
              targetWeight: targetDraft.weight,
              targetReps: targetDraft.reps,
              targetSets: targetDraft.sets,
              unit: targetDraft.unit,
            }
          : e
      ),
    };
    persist(next);
    setEditingTarget(null);
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

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingText}>CARGANDO…</div>
      </div>
    );
  }

  const exercises = routine[activeDay] || [];

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: #E8C547; color: #16171A; }
        input, textarea, select { font-size: 16px !important; }
        input:focus, textarea:focus { outline: 2px solid #E8C547; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #E8C547; outline-offset: 2px; }
        input[type="date"] { color-scheme: dark; }
        textarea { resize: none; }
      `}</style>

      <div style={styles.topBar}>
        <header style={styles.header}>
          <div style={styles.headerRow}>
            <span style={styles.logoBadge}>
              <span>RUTINA</span>
              <Dumbbell size={17} color="#16171A" strokeWidth={2.5} />
            </span>
          </div>
          {saveError && <span style={styles.saveError}>sin conexión — no se guardó</span>}
        </header>

        <nav style={styles.dayNav}>
          {DAYS.map((d, i) => {
            const active = d === activeDay;
            return (
              <button
                key={d}
                onClick={() => setActiveDay(d)}
                style={{
                  ...styles.dayBtn,
                  background: active ? "#E8C547" : "transparent",
                  color: active ? "#16171A" : "#8A8D93",
                  borderColor: active ? "#E8C547" : "#2B2D31",
                }}
              >
                {DAY_SHORT[i]}
              </button>
            );
          })}
        </nav>
      </div>

      <main style={styles.main}>
        {exercises.length === 0 && !addingExercise && (
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
            isEditingTarget={editingTarget === ex.id}
            targetDraft={targetDraft}
            setTargetDraft={setTargetDraft}
            onEditTarget={() => {
              setEditingTarget(ex.id);
              setTargetDraft({
                weight: ex.targetWeight,
                reps: ex.targetReps,
                sets: ex.targetSets || "",
                unit: ex.unit || "kg",
              });
            }}
            onCancelTarget={() => setEditingTarget(null)}
            onSaveTarget={() => saveTarget(ex.id)}
            onDelete={() => deleteExercise(ex.id)}
            openLog={openLogFor === ex.id}
            onToggleLog={() => openLog(ex)}
            draft={logDrafts[ex.id]}
            onDraftChange={(updater) => updateDraft(ex.id, updater)}
            onSaveNewLog={() => saveNewLog(ex.id)}
            onDeleteLog={(idx) => deleteLog(ex.id, idx)}
            onUpdateLog={(idx, updated) => updateLog(ex.id, idx, updated)}
          />
        ))}

        {addingExercise ? (
          <div style={styles.addBlock}>
            <div style={styles.addRow}>
              <input
                ref={nameInputRef}
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExercise();
                  if (e.key === "Escape") {
                    setAddingExercise(false);
                    setNewExerciseName("");
                  }
                }}
                placeholder="Nombre del ejercicio…"
                style={styles.addInput}
              />
              <button onClick={addExercise} style={styles.iconBtnYellow}>
                <Check size={18} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => {
                  setAddingExercise(false);
                  setNewExerciseName("");
                }}
                style={styles.iconBtnGhost}
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div style={styles.unitPicker}>
              <span style={styles.unitPickerLabel}>UNIDAD</span>
              <div style={styles.unitToggle}>
                {["kg", "lb"].map((u) => (
                  <button
                    key={u}
                    onClick={() => setNewExerciseUnit(u)}
                    style={{
                      ...styles.unitToggleBtn,
                      background: newExerciseUnit === u ? "#E8C547" : "transparent",
                      color: newExerciseUnit === u ? "#16171A" : "#8A8D93",
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingExercise(true)} style={styles.addExerciseBtn}>
            <Plus size={18} strokeWidth={2.5} />
            <span>Anotar ejercicio</span>
          </button>
        )}
      </main>
    </div>
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
          <span style={styles.targetX}>×</span>
          <input
            value={s.reps}
            onChange={(e) => updateSet(i, "reps", e.target.value)}
            placeholder="reps"
            inputMode="numeric"
            style={styles.setInput}
          />
          {sets.length > 1 && (
            <button onClick={() => removeSet(i)} style={styles.setRemoveBtn} aria-label="Quitar serie">
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addSet} style={styles.addSetBtn}>
        <Plus size={13} strokeWidth={2.5} />
        <span>Serie</span>
      </button>
    </div>
  );
}

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp size={12} color="#7CC576" strokeWidth={2.5} />;
  if (trend === "down") return <TrendingDown size={12} color="#C4664B" strokeWidth={2.5} />;
  if (trend === "same") return <Minus size={12} color="#5A5D63" strokeWidth={2.5} />;
  return null;
}

function ExerciseCard({
  ex,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  isEditingTarget,
  targetDraft,
  setTargetDraft,
  onEditTarget,
  onCancelTarget,
  onSaveTarget,
  onDelete,
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
    const prevEntry = ex.logs[idx - 1];
    const curEntry = ex.logs[idx];
    const prevMax = entryMaxWeight(prevEntry);
    const curMax = entryMaxWeight(curEntry);
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

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.exName}>{ex.name}</span>
        <div style={{ display: "flex", gap: "3px" }}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ ...styles.reorderBtn, opacity: isFirst ? 0.3 : 1 }} aria-label="Subir">
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} style={{ ...styles.reorderBtn, opacity: isLast ? 0.3 : 1 }} aria-label="Bajar">
            <ChevronDown size={14} />
          </button>
          <button onClick={onDelete} style={styles.deleteBtn} aria-label="Eliminar ejercicio">
            <Trash2 size={15} color="#5A5D63" />
          </button>
        </div>
      </div>

      {isEditingTarget ? (
        <div style={styles.targetEditBlock}>
          <div style={styles.targetEditRow}>
            <input
              value={targetDraft.weight}
              onChange={(e) => setTargetDraft({ ...targetDraft, weight: e.target.value })}
              placeholder={targetDraft.unit}
              inputMode="decimal"
              style={styles.targetInput}
            />
            <span style={styles.targetX}>×</span>
            <input
              value={targetDraft.reps}
              onChange={(e) => setTargetDraft({ ...targetDraft, reps: e.target.value })}
              placeholder="reps"
              inputMode="numeric"
              style={styles.targetInput}
            />
            <span style={styles.targetX}>×</span>
            <input
              value={targetDraft.sets}
              onChange={(e) => setTargetDraft({ ...targetDraft, sets: e.target.value })}
              placeholder="series"
              inputMode="numeric"
              style={styles.targetInput}
            />
          </div>
          <div style={styles.targetEditFooter}>
            <div style={styles.unitToggleSmall}>
              {["kg", "lb"].map((u) => (
                <button
                  key={u}
                  onPointerDown={(e) => e.preventDefault()}
 		   onClick={() => setTargetDraft({ ...targetDraft, unit: u })}
                  style={{
                    ...styles.unitToggleBtnSmall,
                    background: targetDraft.unit === u ? "#E8C547" : "transparent",
                    color: targetDraft.unit === u ? "#16171A" : "#8A8D93",
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={onSaveTarget} style={styles.iconBtnYellowSmall}>
                <Check size={14} strokeWidth={2.5} />
              </button>
              <button onClick={onCancelTarget} style={styles.iconBtnGhostSmall}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={onEditTarget} style={styles.targetRow}>
          <span style={styles.targetLabel}>OBJETIVO</span>
          {hasTarget ? (
            <span style={styles.targetValue}>
              {ex.targetWeight || "–"}
              <span style={styles.unit}>{unit}</span> × {ex.targetReps || "–"}
              <span style={styles.unit}>reps</span> × {ex.targetSets || "–"}
              <span style={styles.unit}>series</span>
            </span>
          ) : (
            <span style={styles.targetPlaceholder}>tocar para fijar objetivo</span>
          )}
        </button>
      )}

      <div style={styles.logSection}>
        <div style={styles.logHeaderRow}>
          <span style={styles.logLabel}>REGISTROS</span>
          {(globalPR !== null || monthlyPR !== null) && (
            <div style={styles.prBadges}>
              {monthlyPR !== null && (
                <span style={styles.prBadgeGold}>
                  <Star size={9} fill="#E8C547" color="#E8C547" /> {monthlyPR}{unit}
                </span>
              )}
              {globalPR !== null && (
                <span style={styles.prBadgeCyan}>
                  <Star size={9} fill="#7DD3E8" color="#7DD3E8" /> {globalPR}{unit}
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
                        style={styles.iconBtnDeleteSmall}
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                    <SetRows
                      sets={editDraft.sets}
                      unit={unit}
                      onChange={(sets) => setEditDraft({ ...editDraft, sets })}
                    />
                    <textarea
                      value={editDraft.note}
                      onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                      placeholder="Nota (opcional)"
                      rows={2}
                      style={styles.noteInput}
                    />
                    <div style={styles.logEditActions}>
                      <button onClick={() => saveLogEdit(idx)} style={styles.iconBtnYellowSmall}>
                        <Check size={14} strokeWidth={2.5} />
                        <span style={{ marginLeft: "5px", fontSize: "11px" }}>Guardar</span>
                      </button>
                      <button onClick={() => setEditingLogIdx(null)} style={styles.iconBtnGhostSmall}>
                        <X size={14} strokeWidth={2.5} />
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
                        {isMonthlyPR && <Star size={11} fill="#E8C547" color="#E8C547" />}
                        {isGlobalPR && <Star size={11} fill="#7DD3E8" color="#7DD3E8" />}
                      </div>
                      <button onClick={() => startEditLog(idx, l)} style={styles.editIconBtn} aria-label="Editar">
                        <Pencil size={14} color="#E8C547" />
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
                    {isMonthlyPR && <Star size={10} fill="#E8C547" color="#E8C547" />}
                    {isGlobalPR && <Star size={10} fill="#7DD3E8" color="#7DD3E8" />}
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
          <SetRows
            sets={draft.sets}
            unit={unit}
            onChange={(sets) => onDraftChange((d) => ({ ...d, sets }))}
          />
          <textarea
            value={draft.note}
            onChange={(e) => onDraftChange((d) => ({ ...d, note: e.target.value }))}
            placeholder="Nota (opcional)"
            rows={2}
            style={styles.noteInput}
          />
          <div style={styles.logEditActions}>
            <button onClick={onSaveNewLog} style={styles.iconBtnYellowSmall}>
              <Check size={14} strokeWidth={2.5} />
              <span style={{ marginLeft: "5px", fontSize: "11px" }}>Guardar</span>
            </button>
            <button onClick={onToggleLog} style={styles.iconBtnGhostSmall}>
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onToggleLog} style={styles.registerBtn}>
          <span>Registrar</span>
          <ChevronRight size={15} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#16171A",
    color: "#EDEAE3",
    fontFamily: "'Oswald', sans-serif",
    paddingBottom: "40px",
  },
  loadingText: {
    padding: "40px 20px",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#5A5D63",
    letterSpacing: "2px",
    fontSize: "13px",
  },
  header: { padding: "14px 12px 10px" },
  headerRow: { display: "flex", alignItems: "center", gap: "9px" },
  logoBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: "#E8C547",
    color: "#16171A",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: "14.5px",
    letterSpacing: "1.5px",
    padding: "7px 11px",
    borderRadius: "6px",
    lineHeight: 1,
    border: "1px solid #E8C547",
  },
  saveError: {
    display: "block",
    marginTop: "5px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9px",
    color: "#C4664B",
    letterSpacing: "0.3px",
  },
  topBar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    background: "#16171A",
    paddingTop: "env(safe-area-inset-top)",
    borderBottom: "1px solid #232529",
  },
  dayNav: { display: "flex", gap: "4px", padding: "0 8px 10px" },
  dayBtn: {
    flex: 1,
    padding: "8px 2px",
    borderRadius: "6px",
    border: "1px solid",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: "10.5px",
    letterSpacing: "0.2px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  main: {
    padding: "14px 12px 0",
    paddingTop: "155px",
},
  emptyState: { padding: "36px 8px", textAlign: "center" },
  emptyBar: { width: "36px", height: "3px", background: "#E8C547", margin: "0 auto 16px", borderRadius: "2px" },
  emptyText: { color: "#6B6E74", fontSize: "14px", fontFamily: "'Oswald', sans-serif", fontWeight: 400, margin: 0 },
  card: {
    background: "#1D1F23",
    border: "1px solid #2B2D31",
    borderRadius: "10px",
    padding: "13px 13px 11px",
    marginBottom: "10px",
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" },
  exName: { fontSize: "15.5px", fontWeight: 600, letterSpacing: "0.2px" },
  deleteBtn: { background: "none", border: "none", padding: "4px", cursor: "pointer", display: "flex" },
  reorderBtn: {
    background: "none",
    border: "1px solid #2B2D31",
    borderRadius: "5px",
    padding: "3px",
    display: "flex",
    cursor: "pointer",
    color: "#8A8D93",
  },
  targetRow: {
    width: "100%",
    background: "#16171A",
    border: "1px solid #2B2D31",
    borderRadius: "6px",
    padding: "9px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    marginBottom: "11px",
    flexWrap: "wrap",
    gap: "4px",
  },
  targetLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: "9.5px", color: "#E8C547", letterSpacing: "1px" },
  targetValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", fontWeight: 700, color: "#EDEAE3" },
  unit: { fontSize: "9.5px", color: "#8A8D93", fontWeight: 400, marginRight: "3px" },
  targetPlaceholder: { fontFamily: "'JetBrains Mono', monospace", fontSize: "10.5px", color: "#5A5D63" },
  targetEditBlock: {
    background: "#16171A",
    border: "1px solid #2B2D31",
    borderRadius: "6px",
    padding: "9px",
    marginBottom: "11px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  targetEditRow: { display: "flex", alignItems: "center", gap: "5px" },
  targetEditFooter: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  targetInput: {
    flex: 1,
    background: "#1D1F23",
    border: "1px solid #3A3D42",
    borderRadius: "6px",
    padding: "8px 6px",
    color: "#EDEAE3",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    minWidth: 0,
    width: 0,
  },
  targetX: { color: "#5A5D63", fontSize: "12px" },
  unitToggleSmall: { display: "flex", border: "1px solid #3A3D42", borderRadius: "6px", overflow: "hidden" },
  unitToggleBtnSmall: {
    border: "none",
    padding: "6px 12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10.5px",
    fontWeight: 700,
    cursor: "pointer",
  },
  logSection: { marginBottom: "11px" },
  logHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" },
  logLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9.5px",
    color: "#5A5D63",
    letterSpacing: "0.5px",
  },
  prBadges: { display: "flex", gap: "5px" },
  prBadgeGold: {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9.5px",
    fontWeight: 700,
    color: "#E8C547",
  },
  prBadgeCyan: {
    display: "flex",
    alignItems: "center",
    gap: "3px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9.5px",
    fontWeight: 700,
    color: "#7DD3E8",
  },
  noLogs: { fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#44464B" },
  logList: { display: "flex", flexDirection: "column", gap: "6px" },
  logRow: {
    width: "100%",
    background: "#16171A",
    border: "1px solid #2B2D31",
    borderRadius: "6px",
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    cursor: "pointer",
  },
  logRowDateGroup: { display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 },
  logRowDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: "10.5px", color: "#5A5D63" },
  logRowSets: { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" },
  setBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11.5px",
    color: "#C9CACC",
    fontWeight: 500,
    background: "#1D1F23",
    border: "1px solid #2B2D31",
    borderRadius: "4px",
    padding: "2px 6px",
  },
  chipUnit: { fontSize: "9px", color: "#6B6E74" },
  logExpandedBlock: {
    background: "#16171A",
    border: "1px solid #3A3D42",
    borderRadius: "6px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logExpandedHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  logExpandedHeaderLeft: { display: "flex", alignItems: "center", gap: "6px" },
  editIconBtn: { background: "none", border: "1px solid #3A3D42", borderRadius: "6px", padding: "5px", display: "flex", cursor: "pointer" },
  logExpandedSets: { display: "flex", flexDirection: "column", gap: "4px" },
  logExpandedSetRow: { display: "flex", alignItems: "center", gap: "7px" },
  logExpandedSetValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", color: "#EDEAE3", fontWeight: 500 },
  noteText: {
    fontFamily: "'Oswald', sans-serif",
    fontSize: "12.5px",
    color: "#9A9DA3",
    fontStyle: "italic",
    margin: 0,
    borderLeft: "2px solid #2B2D31",
    paddingLeft: "8px",
  },
  collapseBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    background: "none",
    border: "none",
    color: "#5A5D63",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10px",
    cursor: "pointer",
    padding: "2px",
  },
  showMoreBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    width: "100%",
    marginTop: "7px",
    background: "none",
    border: "1px dashed #2B2D31",
    borderRadius: "6px",
    padding: "6px",
    color: "#6B6E74",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10px",
    cursor: "pointer",
  },
  logEditBlock: {
    background: "#16171A",
    border: "1px solid #E8C547",
    borderRadius: "6px",
    padding: "9px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logAddBlock: {
    background: "#16171A",
    border: "1px solid #2B2D31",
    borderRadius: "6px",
    padding: "9px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logEditDateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  logEditDate: {
    flex: 1,
    background: "#1D1F23",
    border: "1px solid #3A3D42",
    borderRadius: "5px",
    padding: "6px 7px",
    color: "#EDEAE3",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11.5px",
    minWidth: 0,
  },
  setRowsWrap: { display: "flex", flexDirection: "column", gap: "5px" },
  setRow: { display: "flex", alignItems: "center", gap: "5px" },
  setIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9.5px",
    color: "#5A5D63",
    width: "18px",
    flexShrink: 0,
  },
  setInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    background: "#1D1F23",
    border: "1px solid #3A3D42",
    borderRadius: "5px",
    padding: "7px 6px",
    color: "#EDEAE3",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    textAlign: "center",
  },
  setRemoveBtn: {
    background: "none",
    border: "1px solid #3A3D42",
    borderRadius: "5px",
    padding: "6px",
    display: "flex",
    cursor: "pointer",
    color: "#6B6E74",
    flexShrink: 0,
  },
  addSetBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    background: "none",
    border: "1px dashed #3A3D42",
    borderRadius: "5px",
    padding: "6px",
    color: "#8A8D93",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10.5px",
    cursor: "pointer",
    marginTop: "1px",
  },
  noteInput: {
    background: "#1D1F23",
    border: "1px solid #3A3D42",
    borderRadius: "5px",
    padding: "7px 8px",
    color: "#EDEAE3",
    fontFamily: "'Oswald', sans-serif",
    fontSize: "12px",
    width: "100%",
  },
  logEditActions: { display: "flex", alignItems: "center", gap: "6px" },
  registerBtn: {
    width: "100%",
    background: "none",
    border: "1px dashed #3A3D42",
    borderRadius: "6px",
    padding: "8px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#8A8D93",
    fontFamily: "'Oswald', sans-serif",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "0.3px",
    cursor: "pointer",
  },
  addBlock: {
    border: "1px solid #2B2D31",
    borderRadius: "8px",
    padding: "10px",
    marginBottom: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "9px",
  },
  addRow: { display: "flex", alignItems: "center", gap: "6px" },
  addInput: {
    flex: 1,
    background: "#1D1F23",
    border: "1px solid #2B2D31",
    borderRadius: "8px",
    padding: "12px 13px",
    color: "#EDEAE3",
    fontFamily: "'Oswald', sans-serif",
    fontSize: "14px",
    minWidth: 0,
  },
  unitPicker: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  unitPickerLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9.5px",
    color: "#5A5D63",
    letterSpacing: "1px",
  },
  unitToggle: { display: "flex", border: "1px solid #2B2D31", borderRadius: "6px", overflow: "hidden" },
  unitToggleBtn: {
    border: "none",
    padding: "6px 16px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  addExerciseBtn: {
    width: "100%",
    background: "none",
    border: "1px solid #2B2D31",
    borderRadius: "8px",
    padding: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#E8C547",
    fontFamily: "'Oswald', sans-serif",
    fontSize: "14px",
    fontWeight: 600,
    letterSpacing: "0.5px",
    cursor: "pointer",
    marginBottom: "14px",
  },
  iconBtnYellow: { background: "#E8C547", border: "none", borderRadius: "8px", padding: "12px", display: "flex", cursor: "pointer", color: "#16171A" },
  iconBtnGhost: { background: "none", border: "1px solid #2B2D31", borderRadius: "8px", padding: "12px", display: "flex", cursor: "pointer", color: "#8A8D93" },
  iconBtnYellowSmall: { background: "#E8C547", border: "none", borderRadius: "6px", padding: "7px 9px", display: "flex", alignItems: "center", cursor: "pointer", color: "#16171A", flexShrink: 0 },
  iconBtnGhostSmall: { background: "none", border: "1px solid #3A3D42", borderRadius: "6px", padding: "7px", display: "flex", cursor: "pointer", color: "#8A8D93", flexShrink: 0 },
  iconBtnDeleteSmall: { background: "none", border: "1px solid #C4664B", borderRadius: "6px", padding: "6px", display: "flex", cursor: "pointer", color: "#C4664B", flexShrink: 0 },
};
