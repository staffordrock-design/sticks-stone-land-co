import React, { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

export default function DealPipelineBoard({ stages, items, onMove }) {
  const [busy, setBusy] = useState(null);
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => { setLocalItems(items); }, [items]);

  const grouped = useMemo(
    () => Object.fromEntries(stages.map((s) => [s, localItems.filter((i) => i.stage === s)])),
    [stages, localItems]
  );

  const onDragEnd = async (result) => {
    setBusy(null);
    const { source, destination } = result;
    if (!destination) return;
    const fromStage = stages[Number(source.droppableId)];
    const toStage = stages[Number(destination.droppableId)];
    if (fromStage === toStage) return;
    const item = grouped[fromStage]?.[source.index];
    if (!item) return;
    const prevStage = item.stage;
    setLocalItems((curr) => curr.map((i) => (i.id === item.id ? { ...i, stage: toStage } : i)));
    setBusy(item.id);
    try {
      await onMove(item, toStage);
    } catch {
      setLocalItems((curr) => curr.map((i) => (i.id === item.id ? { ...i, stage: prevStage } : i)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DragDropContext onDragStart={() => setBusy("dragging")} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin]">
        {stages.map((stage, colIdx) => {
          const isTerminal = stage === "Closed" || stage === "Lost";
          return (
            <Droppable key={stage} droppableId={String(colIdx)}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex w-64 shrink-0 flex-col rounded-2xl border p-3 transition-colors ${
                    snapshot.isDraggingOver
                      ? "border-sky-400 bg-sky-50/70"
                      : isTerminal
                      ? "border-border bg-muted/30"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stage}</span>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-foreground">{grouped[stage].length}</span>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {grouped[stage].map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`group rounded-xl border border-border bg-card p-3 shadow-sm transition ${
                              snap.isDragging ? "rotate-1 shadow-lg ring-2 ring-sky-400" : "hover:shadow-md"
                            } ${busy === item.id ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 font-semibold text-foreground">{item.deal_name}</div>
                              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {item.seller_name || item.buyer_company || "S&S deal"}
                            </div>
                            {item.offer_amount != null && (
                              <div className="mt-1 text-sm font-bold text-foreground">${Number(item.offer_amount).toLocaleString()}</div>
                            )}
                            {item.next_action && (
                              <div className="mt-2 line-clamp-2 rounded-md bg-muted/50 px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                                {item.next_action}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {grouped[stage].length === 0 && (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-[11px] text-muted-foreground/70">
                        Drop here
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}