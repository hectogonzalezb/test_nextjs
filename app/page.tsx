"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";

// Registrar plugin una sola vez (HMR-safe)
if (typeof window !== "undefined" && !(globalThis as any).__EDGEHANDLES_REGISTERED) {
  cytoscape.use(edgehandles as any);
  (globalThis as any).__EDGEHANDLES_REGISTERED = true;
}

// React wrapper para Cytoscape (sin SSR)
const CytoscapeComponent: any = dynamic(() => import("react-cytoscapejs"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Cargando editor…</div>,
});

// ---------- Utilidades ----------
function hasCycle(
  nodes: string[],
  edges: { source: string; target: string }[],
  candidate?: { source: string; target: string }
) {
  const adj: Record<string, string[]> = {};
  nodes.forEach((id) => (adj[id] = []));
  edges.forEach((e) => adj[e.source]?.push(e.target));
  if (candidate) adj[candidate.source]?.push(candidate.target);

  const state: Record<string, number> = {}; // 0=unvisited,1=visiting,2=done
  const dfs = (u: string): boolean => {
    state[u] = 1;
    for (const v of adj[u] || []) {
      if (state[v] === 1) return true; // back-edge
      if (state[v] !== 2 && dfs(v)) return true;
    }
    state[u] = 2;
    return false;
  };
  for (const id of nodes) if (!state[id] && dfs(id)) return true;
  return false;
}

// ---------- Página (app/page.tsx) ----------
export default function Page() {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const ehRef = useRef<any>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const [seq, setSeq] = useState(3);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [edgeMode, setEdgeMode] = useState(false);

  // Paletas de color (light/dark)
  const colors = useMemo(() => {
    if (theme === "dark") {
      return {
        bg: "#0b1220",
        text: "#e5e7eb",
        nodeBg: "#0f172a",
        nodeBorder: "#475569",
        nodeHalo: "rgba(30, 41, 59, 0.35)",
        edge: "#60a5fa",
        border: "rgba(148,163,184,0.25)",
        btnText: "#0f172a",
        btnBorder: "#1f2937",
      } as const;
    }
    return {
      bg: "#f7f8fb",
      text: "#0f172a",
      nodeBg: "#ffffff",
      nodeBorder: "#334155", // gris azulado oscuro
      nodeHalo: "rgba(30, 41, 59, 0.15)",
      edge: "#2563eb",
      border: "rgba(15,23,42,0.12)",
      btnText: "#0f172a",
      btnBorder: "#cbd5e1",
    } as const;
  }, [theme]);

  const buttonBase = useMemo<React.CSSProperties>(
    () => ({
      background: "#ffffff",
      border: `1px solid ${colors.btnBorder}`,
      color: colors.btnText,
      fontWeight: 700,
      padding: "8px 12px",
      borderRadius: 10,
      cursor: "pointer",
      boxShadow: "0 6px 16px rgba(2,6,23,0.12)",
    }),
    [colors]
  );

  // Estilos (aristas animadas gratis con dashed)
  const stylesheet = useMemo<any[]>(
    () => [
      {
        selector: "node",
        style: {
          width: 220,
          height: 78,
          shape: "round-rectangle",
          backgroundColor: colors.nodeBg,
          borderColor: colors.nodeBorder,
          borderWidth: 2,
          color: colors.text,
          label: "data(label)",
          fontSize: 13,
          textWrap: "wrap",
          textValign: "center",
          textHalign: "center",
          textMarginY: 4,
          shadowBlur: 18,
          shadowOpacity: 1,
          shadowColor: colors.nodeHalo,
          'background-fit': 'cover',
          'background-image': 'data(img)'
        },
      },
      { selector: "node:selected", style: { borderWidth: 3, borderColor: colors.edge } },
      {
        selector: "edge",
        style: {
          curveStyle: "bezier",
          controlPointStepSize: 32,
          width: 2,
          lineColor: colors.edge,
          targetArrowColor: colors.edge,
          targetArrowShape: "triangle",
          arrowScale: 1,
          lineStyle: "dashed",
          lineDashPattern: [10, 10],
        },
      },
      { selector: "edge:selected", style: { width: 3 } },
      // Handle del plugin
      {
        selector: '.eh-handle',
        style: {
          'background-color': colors.edge,
          'width': 14,
          'height': 14,
          'shape': 'ellipse',
          'overlay-opacity': 0,
          'border-width': 2,
          'border-color': '#ffffff',
        }
      },
    ],
    [colors]
  );

  // Animación continua: desplazar guiones en edges con clase .animated (gratis)
  useEffect(() => {
    let raf = 0;
    let offset = 0;
    const animate = () => {
      const cy = cyRef.current;
      if (cy) cy.edges(".animated").style("line-dash-offset", offset);
      offset = (offset + 1) % 20;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Elementos iniciales
  const elements = useMemo(
    () => [
      { data: { id: "n1", label: "Ingesta" }, position: { x: 160, y: 120 } },
      { data: { id: "n2", label: "Transformar" }, position: { x: 500, y: 320 } },
      { data: { id: "e1", source: "n1", target: "n2" }, classes: "animated" },
    ],
    []
  );

  const layout = { name: "preset" } as cytoscape.LayoutOptions;

  // EdgeHandles: agrega "círculos" (handles) al acercarse a un nodo para iniciar una arista
  const setupEdgeHandles = (cy: cytoscape.Core) => {
    const eh = (cy as any).edgehandles({
      toggleOffOnLeave: true,
      handleNodes: "node",
      edgeType: () => "flat",
      loopAllowed: () => false,
      handlePosition: "bottom",
      handleColor: colors.nodeBorder,
      handleLineWidth: 2,
      handleOutlineColor: "#ffffff",
      handleOutlineWidth: 3,
      handleSize: 18,
      hoverDelay: 20,
      edgeParams: () => ({ classes: "animated" }),
      preview: true,
      ghost: true,
      ghostEdgeColor: colors.edge,
      ghostEdgeWidth: 2,
    });
    eh.enable();
    ehRef.current = eh;
    eh.disable();

    let completed = false;

    // Validación al completar conexión entre nodos existentes
    cy.on("ehcomplete", (_evt: any, data: any) => {
      completed = true;
      const { source, target, edge } = data as any;
      if (!source || !target || !edge) return;

      if (source.id() === target.id()) {
        edge.remove();
        alert("❌ No puedes conectar un nodo consigo mismo.");
        return;
      }

      const nodes = cy.nodes().map((n) => n.id());
      const edgesNow = cy
        .edges()
        .map((e) => ({ source: e.source().id(), target: e.target().id() }));
      const candidate = { source: source.id(), target: target.id() };
      if (hasCycle(nodes, edgesNow, candidate)) {
        edge.remove();
        alert("⚠️ Conexión rechazada: crearía un ciclo en el DAG.");
        return;
      }

      edge.addClass("animated");
    });

    // Si se suelta en el fondo, crear nuevo nodo y arista
    cy.on("ehstop", (evt: any, source: any) => {
      if (completed) {
        completed = false;
        return;
      }

      const pos = evt.position;
      setSeq((s) => {
        const id = `n${s}`;
        const label = `Bloque ${s}`;
        const newNode = cy.add({ data: { id, label }, position: pos });
        cy.add({ data: { id: `e${Date.now()}`, source: source.id(), target: id }, classes: "animated" });
        cy.fit(undefined, 60);
        openInlineEditor(newNode);
        return s + 1;
      });
    });
  };

  // Editor inline para título de nodo
  const [nodeEditor, setNodeEditor] = useState<{
    visible: boolean;
    id: string | null;
    value: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>({ visible: false, id: null, value: "", x: 0, y: 0, w: 200, h: 32 });

  const openInlineEditor = (n: cytoscape.NodeSingular) => {
    const cy = cyRef.current; if (!cy) return;
    const bb = n.renderedBoundingBox();
    const rect = cy.container()!.getBoundingClientRect();
    const padding = 8;
    setNodeEditor({
      visible: true,
      id: n.id(),
      value: (n.data("label") as string) || "",
      x: rect.left + bb.x1 + padding,
      y: rect.top + bb.y1 + padding,
      w: bb.w - padding * 2,
      h: 32,
    });
  };

  const onCyReady = (cy: cytoscape.Core) => {
    cyRef.current = cy;
    setupEdgeHandles(cy);

    // Asegurar que se puedan ARRÁSTRAR los nodos
    cy.nodes().grabify();

    // Doble click para renombrar nodo inline
    cy.on("dblclick", "node", (e) => openInlineEditor(e.target as any));
    cy.on("cxttap", "node", (e) => openInlineEditor(e.target as any));

    // Delete/Backspace elimina selección
    const keyHandler = (ev: KeyboardEvent) => {
      if (ev.key === "Delete" || ev.key === "Backspace") {
        const sel = cy.$(":selected");
        if (sel.length > 0) {
          ev.preventDefault();
          sel.remove();
        }
      }
    };
    window.addEventListener("keydown", keyHandler);
    cy.one("destroy", () => window.removeEventListener("keydown", keyHandler));
  };

  // Crear nodo de texto
  const addNode = () => {
    const cy = cyRef.current; if (!cy) return;
    const id = `n${seq}`;
    const label = `Bloque ${seq}`;
    setSeq((s) => s + 1);

    // Posicionar cerca del centroide actual
    const nodes = cy.nodes();
    let pos = { x: cy.width() / 2, y: cy.height() / 2 };
    if (nodes.length > 0) {
      const sum = nodes.reduce(
        (acc, n) => ({ x: acc.x + n.position("x"), y: acc.y + n.position("y") }),
        { x: 0, y: 0 }
      );
      pos = { x: sum.x / nodes.length + (Math.random() - 0.5) * 140, y: sum.y / nodes.length + (Math.random() - 0.5) * 140 };
    }

    const newNode = cy.add({ data: { id, label }, position: pos });
    cy.fit(undefined, 60);
    openInlineEditor(newNode);
  };

  // Importar imagen como nodo (imagen contenida)
  const triggerImportImage = () => imgInputRef.current?.click();

  const onImportImage: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cy = cyRef.current; if (!cy) return;
    const id = `img-${Date.now()}`;
    const url = URL.createObjectURL(file);

    // Posicionar al centro
    const pos = { x: cy.width() / 2, y: cy.height() / 2 };
    cy.add({ data: { id, label: "", img: url }, position: pos });
    cy.fit(undefined, 60);

    // Limpia input
    if (imgInputRef.current) imgInputRef.current.value = "";
  };

  // Toggle de modo de aristas
  const toggleEdgeMode = () => {
    const eh = ehRef.current;
    if (!eh) return;
    if (edgeMode) {
      eh.disable();
    } else {
      eh.enable();
    }
    setEdgeMode((s) => !s);
  };

  // Guardar cambio desde editor inline
  const commitNodeEdit = () => {
    if (!nodeEditor.visible || !nodeEditor.id) return;
    const cy = cyRef.current; if (!cy) return;
    const n = cy.getElementById(nodeEditor.id);
    n.data("label", nodeEditor.value);
    setNodeEditor((s) => ({ ...s, visible: false, id: null }));
  };

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", background: colors.bg, color: colors.text }}>
      <CytoscapeComponent
        cy={(cy: any) => onCyReady(cy)}
        elements={elements as any}
        layout={layout as any}
        style={{ width: "100%", height: "100%" }}
        stylesheet={stylesheet as any}
        boxSelectionEnabled={true}
        autoungrabify={false}
        minZoom={0.3}
        maxZoom={2.5}
      />

      {/* Editor inline */}
      {nodeEditor.visible && (
        <input
          autoFocus
          value={nodeEditor.value}
          onChange={(e) => setNodeEditor((s) => ({ ...s, value: e.target.value }))}
          onBlur={commitNodeEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitNodeEdit();
            if (e.key === "Escape") setNodeEditor((s) => ({ ...s, visible: false, id: null }));
          }}
          style={{
            position: "fixed",
            left: nodeEditor.x,
            top: nodeEditor.y,
            width: Math.max(120, nodeEditor.w),
            height: nodeEditor.h,
            padding: "6px 10px",
            borderRadius: 10,
            border: `2px solid ${colors.edge}`,
            outline: "none",
            background: "#ffffff",
            color: colors.text,
            boxShadow: "0 10px 30px rgba(2,6,23,0.15)",
            fontSize: 13,
            fontWeight: 600,
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button onClick={addNode} style={{ ...buttonBase }}>+ Nodo</button>
        <button onClick={triggerImportImage} style={{ ...buttonBase }}>🖼️ Imagen</button>
        <button
          onClick={toggleEdgeMode}
          style={{
            ...buttonBase,
            background: edgeMode ? colors.edge : "#ffffff",
            color: edgeMode ? "#ffffff" : colors.btnText,
          }}
        >
          {edgeMode ? "✏️ Conexión" : "🔗 Conexión"}
        </button>
        <button
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          title="Cambiar tema"
          style={{ ...buttonBase }}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        onChange={onImportImage}
        style={{ display: "none" }}
      />
    </div>
  );
}
