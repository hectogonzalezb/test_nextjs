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
        bg: "#0f172a", // Fondo oscuro
        text: "#e5e7eb",
        nodeBg: "#1e293b",
        nodeBorder: "#475569",
        nodeHalo: "rgba(30, 41, 59, 0.35)",
        edge: "#60a5fa",
        border: "rgba(148,163,184,0.25)",
        btnText: "#e5e7eb",    
        btnBorder: "#1f2937",
      } as const;
    }
    return {
      bg: "#ffffff", // Fondo blanco
      text: "#0f172a",
      nodeBg: "#ffffff",
      nodeBorder: "#334155",
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
        },
      },
      // Selector específico para nodos con imagen
      {
        selector: "node[img]",
        style: {
          'background-fit': 'cover',
          'background-image': 'data(img)'
        }
      },
      { selector: "node:selected", 
        style: { 
          borderWidth: 3, 
          borderColor: colors.edge 
        } 
      },
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
      { selector: "edge:selected", 
        style: { 
          width: 3 
        } 
      },
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
    const id = `n${Date.now()}`;

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

    const nodeCount = cy.nodes().length;
    const newLabel = `Nodo ${nodeCount + 1}`;
    const newNode = cy.add({ data: { id, label: newLabel }, position: pos });
    cy.fit(undefined, 60);
  }, []);

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

  const onCyReady = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;
    cy.container().addEventListener("contextmenu", (e) => e.preventDefault());

    let drawing = false;

    cy.nodes().grabify();

    const eh = cy.edgehandles({
      handleSize: 0,
      preview: true,
      loopAllowed: () => false,
      canConnect: (source, target) => {
        if (source.same(target)) return false;
        
        // Verificar ciclo antes de permitir la conexión
        const nodes = cy.nodes().map(n => n.id());
        const existingEdges = cy.edges().map(e => ({
          source: e.source().id(),
          target: e.target().id()
        }));
        
        const newEdge = {
          source: source.id(),
          target: target.id()
        };

        return !hasCycle(nodes, [...existingEdges, newEdge]);
      },
      edgeParams: (source, target) => ({
        data: {
          id: `e${source.id()}-${target.id()}-${Date.now()}`,
          source: source.id(),
          target: target.id(),
        },
        classes: 'animated'
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
      // Solo agregar la clase animated, ya validamos el ciclo en canConnect
      addedEdge.addClass("animated");
    });

    // Ajustar zoom inicial
    setTimeout(() => {
      cy.fit(undefined, 80);
    }, 100);
  }, [openInlineEditor]);

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
    if (imgInputRef.current) {
      imgInputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 16px",
          background: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
          zIndex: 10,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, color: colors.text }}>
          Editor de flujo (DAG)
        </h1>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            onClick={addNode}
            style={buttonBase}
            title="Agregar nodo (Bloque)"
          >
            + Bloque
          </button>
          <button
            onClick={triggerImportImage}
            style={{ ...buttonBase, marginLeft: 8 }}
            title="Importar imagen como nodo"
          >
            🖼️ Imagen
          </button>
          <button
            onClick={zoomIn}
            style={{ ...buttonBase, marginLeft: 8 }}
            title="Acercar (Ctrl + ↑)"
          >
            🔍 +
          </button>
          <button
            onClick={zoomOut}
            style={{ ...buttonBase, marginLeft: 8 }}
            title="Alejar (Ctrl + ↓)"
          >
            🔍 −
          </button>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark")}
            style={{
              ...buttonBase,
              marginLeft: 8,
              padding: "8px 16px",
              borderRadius: 16,
              border: `1px solid ${colors.btnBorder}`,
              background: colors.bg,
              color: colors.text,
              fontSize: 16,
              appearance: "none",
              backgroundImage:
                theme === "dark"
                  ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23e5e7eb\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20z\'/%3E%3C/svg%3E")'
                  : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%230f172a\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20z\'/%3E%3C/svg%3E")',
              backgroundSize: "16px 16px",
              backgroundPosition: "right 8px center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <option value="light">🌞 Claro</option>
            <option value="dark">🌜 Oscuro</option>
          </select>
        </div>
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        <CytoscapeComponent
          cy={onCyReady}
          elements={elements as any}
          layout={layout as any}
          style={{ width: "100%", height: "100%" }}
          stylesheet={stylesheet as any}
          boxSelectionEnabled={true}
          autoungrabify={false}
          minZoom={0.1}
          maxZoom={4}
        />
        {nodeEditor.visible && (
          <div
            style={{
              position: "absolute",
              left: nodeEditor.x,
              top: nodeEditor.y,
              width: nodeEditor.w,
              height: nodeEditor.h,
              pointerEvents: "none",
            }}
          >
            <input
              type="text"
              value={nodeEditor.value}
              onChange={(e) =>
                setNodeEditor((n) => ({ ...n, value: e.target.value }))
              }
              onBlur={() => {
                const cy = cyRef.current;
                if (!cy) return;
                const node = cy.getElementById(nodeEditor.id!);
                if (node && nodeEditor.value.trim() !== "") {
                  node.data("label", nodeEditor.value.trim());
                }
                setNodeEditor((n) => ({ ...n, visible: false }));
              }}
              style={{
                width: "100%",
                height: "100%",
                padding: 8,
                borderRadius: 8,
                border: `1px solid ${colors.btnBorder}`,
                background: colors.nodeBg,
                color: colors.text,
                fontSize: 16,
                fontWeight: 500,
                outline: "none",
                pointerEvents: "auto",
              }}
            />
          </div>
        )}
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          onChange={onImportImage}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
