"use client";

import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

interface LDrawViewerProps {
  /** Hex color grid [row][col], e.g. "#B40000" */
  colorGrid: string[][];
  /** Mosaic width in studs */
  widthStuds: number;
  /** Mosaic height in studs */
  heightStuds: number;
  /** Height of the viewer container in pixels (default: 500) */
  height?: number;
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

export default function LDrawViewer({
  colorGrid,
  widthStuds,
  heightStuds,
  height = 500,
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
    // Group cells by hex color
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

    // Shared geometries
    const tileGeom = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
    const studGeom = new THREE.CylinderGeometry(
      STUD_RADIUS,
      STUD_RADIUS,
      STUD_HEIGHT,
      STUD_SEGMENTS
    );

    const dummy = new THREE.Matrix4();

    for (const [hex, positions] of colorGroups) {
      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.4,
        metalness: 0.05,
      });

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

    // Baseplate
    const bpGeom = new THREE.BoxGeometry(widthStuds, BP_HEIGHT, heightStuds);
    const bpMat = new THREE.MeshStandardMaterial({
      color: BP_COLOR,
      roughness: 0.6,
    });
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
      tileGeom.dispose();
      studGeom.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    cleanupRef.current = cleanup;

    return cleanup;
  }, [colorGrid, widthStuds, heightStuds, height]);

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
