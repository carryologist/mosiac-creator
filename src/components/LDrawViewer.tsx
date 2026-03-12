"use client";

import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PlacedPiece } from "../lib/pieceOptimizer";

interface LDrawViewerProps {
  /** Hex color grid [row][col], e.g. "#B40000" */
  colorGrid: string[][];
  /** Mosaic width in studs */
  widthStuds: number;
  /** Mosaic height in studs */
  heightStuds: number;
  /** Height of the viewer container in pixels (default: 500) */
  height?: number;
  /** Optimized pieces — when present, renders multi-stud pieces instead of 1×1 */
  pieces?: PlacedPiece[];
}

// ─── Geometry constants ─────────────────────────────────────────────────────

/** Size of each 1×1 tile (slightly smaller than 1.0 for visible gaps) */
const TILE_SIZE = 0.94;
/** Height of the tile */
const TILE_HEIGHT = 0.3;
/** Stud radius */
const STUD_RADIUS = 0.24;
/** Stud height */
const STUD_HEIGHT = 0.1;
/** Stud cylinder segments */
const STUD_SEGMENTS = 16;
/** Baseplate thickness */
const BP_HEIGHT = 0.2;
/** Baseplate color */
const BP_COLOR = "#A3A2A5";
/** Gap between adjacent pieces (1.0 − TILE_SIZE) */
const GAP = 1.0 - TILE_SIZE;

export default function LDrawViewer({
  colorGrid,
  widthStuds,
  heightStuds,
  height = 500,
  pieces,
}: LDrawViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || widthStuds === 0 || heightStuds === 0) return;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e293b);

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(widthStuds, widthStuds * 1.5, heightStuds);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-widthStuds, widthStuds, -heightStuds);
    scene.add(dirLight2);

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / height,
      0.1,
      widthStuds * 10
    );
    const maxDim = Math.max(widthStuds, heightStuds);
    const dist = maxDim * 1.2;
    camera.position.set(dist * 0.7, dist * 0.6, dist * 0.7);

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(widthStuds / 2 - 0.5, 0, heightStuds / 2 - 0.5);
    controls.update();

    // ── Build mosaic geometry ─────────────────────────────────────────────
    const dummy = new THREE.Matrix4();
    const disposables: { dispose(): void }[] = [];

    if (pieces && pieces.length > 0) {
      // ── Optimized mode: multi-stud pieces ─────────────────────────────
      // Material cache shared between tile bodies and studs
      const matCache = new Map<string, THREE.MeshStandardMaterial>();
      const getMat = (hex: string) => {
        let m = matCache.get(hex);
        if (!m) {
          m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, metalness: 0.05 });
          matCache.set(hex, m);
          disposables.push(m);
        }
        return m;
      };

      // Group pieces by (hex, width, height) for body instancing
      const bodyGroups = new Map<string, { hex: string; w: number; h: number; positions: { row: number; col: number }[] }>();
      // Collect every stud position per color
      const studGroups = new Map<string, { row: number; col: number }[]>();

      for (const piece of pieces) {
        const hex = colorGrid[piece.row]?.[piece.col] ?? "#888888";
        const bodyKey = `${hex}_${piece.width}_${piece.height}`;

        let bg = bodyGroups.get(bodyKey);
        if (!bg) {
          bg = { hex, w: piece.width, h: piece.height, positions: [] };
          bodyGroups.set(bodyKey, bg);
        }
        bg.positions.push({ row: piece.row, col: piece.col });

        // Each stud position within this piece
        let studs = studGroups.get(hex);
        if (!studs) {
          studs = [];
          studGroups.set(hex, studs);
        }
        for (let r = 0; r < piece.height; r++) {
          for (let c = 0; c < piece.width; c++) {
            studs.push({ row: piece.row + r, col: piece.col + c });
          }
        }
      }

      // Geometry cache for distinct piece sizes
      const geomCache = new Map<string, THREE.BoxGeometry>();

      for (const [, { hex, w, h, positions }] of bodyGroups) {
        const gk = `${w}_${h}`;
        let geom = geomCache.get(gk);
        if (!geom) {
          geom = new THREE.BoxGeometry(w - GAP, TILE_HEIGHT, h - GAP);
          geomCache.set(gk, geom);
          disposables.push(geom);
        }

        const mesh = new THREE.InstancedMesh(geom, getMat(hex), positions.length);
        for (let i = 0; i < positions.length; i++) {
          const { row, col } = positions[i];
          dummy.setPosition(col + (w - 1) / 2, TILE_HEIGHT / 2, row + (h - 1) / 2);
          mesh.setMatrixAt(i, dummy);
        }
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
      }

      // Stud instances (one per grid cell covered)
      const studGeom = new THREE.CylinderGeometry(
        STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS
      );
      disposables.push(studGeom);

      for (const [hex, positions] of studGroups) {
        const mesh = new THREE.InstancedMesh(studGeom, getMat(hex), positions.length);
        for (let i = 0; i < positions.length; i++) {
          const { row, col } = positions[i];
          dummy.setPosition(col, TILE_HEIGHT + STUD_HEIGHT / 2, row);
          mesh.setMatrixAt(i, dummy);
        }
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
      }
    } else {
      // ── Non-optimized mode: all 1×1 tiles ─────────────────────────────
      const colorGroups = new Map<string, { row: number; col: number }[]>();
      for (let r = 0; r < heightStuds; r++) {
        for (let c = 0; c < widthStuds; c++) {
          const hex = colorGrid[r]?.[c];
          if (!hex) continue;
          let group = colorGroups.get(hex);
          if (!group) {
            group = [];
            colorGroups.set(hex, group);
          }
          group.push({ row: r, col: c });
        }
      }

      const tileGeom = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
      const studGeom = new THREE.CylinderGeometry(
        STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS
      );
      disposables.push(tileGeom, studGeom);

      for (const [hex, positions] of colorGroups) {
        const mat = new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.4,
          metalness: 0.05,
        });
        disposables.push(mat);

        // Tile instances
        const tileMesh = new THREE.InstancedMesh(tileGeom, mat, positions.length);
        for (let i = 0; i < positions.length; i++) {
          const { row, col } = positions[i];
          dummy.setPosition(col, TILE_HEIGHT / 2, row);
          tileMesh.setMatrixAt(i, dummy);
        }
        tileMesh.instanceMatrix.needsUpdate = true;
        scene.add(tileMesh);

        // Stud instances (on top of tiles)
        const studMesh = new THREE.InstancedMesh(studGeom, mat, positions.length);
        for (let i = 0; i < positions.length; i++) {
          const { row, col } = positions[i];
          dummy.setPosition(col, TILE_HEIGHT + STUD_HEIGHT / 2, row);
          studMesh.setMatrixAt(i, dummy);
        }
        studMesh.instanceMatrix.needsUpdate = true;
        scene.add(studMesh);
      }
    }

    // Baseplate
    const bpGeom = new THREE.BoxGeometry(widthStuds, BP_HEIGHT, heightStuds);
    const bpMat = new THREE.MeshStandardMaterial({
      color: BP_COLOR,
      roughness: 0.6,
    });
    disposables.push(bpGeom, bpMat);
    const bpMesh = new THREE.Mesh(bpGeom, bpMat);
    bpMesh.position.set(
      widthStuds / 2 - 0.5,
      -BP_HEIGHT / 2,
      heightStuds / 2 - 0.5
    );
    scene.add(bpMesh);

    // ── Animation loop ────────────────────────────────────────────────────
    let animFrame = 0;
    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setReady(true);

    // ── Resize handler ────────────────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    const cleanup = () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrame);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    cleanupRef.current = cleanup;

    return cleanup;
  }, [colorGrid, widthStuds, heightStuds, height, pieces]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700/50">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-800/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading 3D preview...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
