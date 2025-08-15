"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";

cytoscape.use(edgehandles);

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
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const [seq, setSeq] = useState(3);
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
      padding: "16px 24px",
      borderRadius: 16,
      cursor: "pointer",
      boxShadow: "0 6px 16px rgba(2,6,23,0.12)",
      fontSize: 20,
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
        {
          selector: ".eh-preview, .eh-ghost-edge",
          style: {
            lineColor: colors.edge,
            targetArrowColor: colors.edge,
            targetArrowShape: "triangle",
            arrowScale: 1,
            width: 2,
            lineStyle: "dashed",
            lineDashPattern: [10, 10],
          },
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

  const openInlineEditor = useCallback((n: cytoscape.NodeSingular) => {
    const cy = cyRef.current;
    if (!cy) return;
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
  }, []);

  const addNode = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
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
      pos = {
        x: sum.x / nodes.length + (Math.random() - 0.5) * 140,
        y: sum.y / nodes.length + (Math.random() - 0.5) * 140,
      };
    }

    const newNode = cy.add({ data: { id, label }, position: pos });
    cy.fit(undefined, 60);
    openInlineEditor(newNode);
  }, [seq, openInlineEditor]);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current; if (!cy) return;
    const level = Math.min(cy.maxZoom(), cy.zoom() * 1.2);
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current; if (!cy) return;
    const level = Math.max(cy.minZoom(), cy.zoom() / 1.2);
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  useEffect(() => {
    const keyHandler = (ev: KeyboardEvent) => {
      const cy = cyRef.current;
      if (!cy) return;
      if (ev.key === "Delete" || ev.key === "Backspace") {
        const sel = cy.$(":selected");
        if (sel.length > 0) {
          ev.preventDefault();
          sel.remove();
        }
      }
      if (ev.code === "Space" && !ev.repeat) {
        ev.preventDefault();
        addNode();
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [addNode]);

  const onCyReady = (cy: cytoscape.Core) => {
    cyRef.current = cy;

    let drawing = false;

    // Asegurar que se puedan ARRÁSTRAR los nodos
    cy.nodes().grabify();

    // Doble click para renombrar nodo inline
    cy.on("dblclick", "node", (e) => openInlineEditor(e.target as any));

    const eh = cy.edgehandles({
      handleSize: 0,
      preview: true,
      canConnect: (source, target) => !source.same(target),
      edgeParams: (source, target) => ({
        data: {
          id: `e${Date.now()}`,
          source: source.id(),
          target: target.id(),
        },
      }),
    });

    cy.on("cxttapstart", "node", (e) => {
      if (drawing) return;
      drawing = true;
      eh.start(e.target);
    });
    cy.on("cxttapend", () => {
      if (!drawing) return;
      drawing = false;
      eh.stop();
    });

    cy.on("ehcomplete", (e, sourceNode, targetNode, addedEdge) => {
      const nodes = cy.nodes().map((n) => n.id());
      const edgesNow = cy
        .edges()
        .map((ed) => ({ source: ed.source().id(), target: ed.target().id() }));
      if (hasCycle(nodes, edgesNow)) {
        alert("⚠️ Conexión rechazada: crearía un ciclo en el DAG.");
        addedEdge.remove();
      } else {
        addedEdge.addClass("animated");
      }
    });
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

  // Guardar cambio desde editor inline
  const commitNodeEdit = () => {
    if (!nodeEditor.visible || !nodeEditor.id) return;
    const cy = cyRef.current; if (!cy) return;
    const n = cy.getElementById(nodeEditor.id);
    n.data("label", nodeEditor.value);
    setNodeEditor((s) => ({ ...s, visible: false, id: null }));
  };

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", overflow: "auto", background: colors.bg, color: colors.text }}>
      <CytoscapeComponent
        cy={(cy: any) => onCyReady(cy)}
        elements={elements as any}
        layout={layout as any}
        style={{ width: 2000, height: 2000 }}
        stylesheet={stylesheet as any}
        boxSelectionEnabled={true}
        autoungrabify={false}
        minZoom={0.1}
        maxZoom={4}
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
          flexDirection: "column",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button onClick={addNode} style={{ ...buttonBase }}>+ Nodo</button>
        <button onClick={triggerImportImage} style={{ ...buttonBase }}>🖼️ Imagen</button>
        <button onClick={zoomIn} style={{ ...buttonBase }}>Zoom +</button>
        <button onClick={zoomOut} style={{ ...buttonBase }}>Zoom -</button>
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
