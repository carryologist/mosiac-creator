"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawUtils } from "three/addons/utils/LDrawUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const LDRAW_LIBRARY_URL = "/ldraw/";

interface LDrawViewerProps {
  ldrContent: string;
  /** Height of the viewer container in pixels (default: 500) */
  height?: number;
}

export default function LDrawViewer({ ldrContent, height = 500 }: LDrawViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize the Three.js scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e293b); // slate-800 to match app theme
    sceneRef.current = scene;

    // Lighting - use ambient + directional for good LEGO rendering
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(100, 200, 150);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-100, 100, -150);
    scene.add(dirLight2);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / height,
      1,
      20000
    );
    camera.position.set(200, 400, 600);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [height]);

  // Load/reload the LDR model when ldrContent changes
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || !ldrContent) return;

    setLoading(true);
    setError(null);

    // Remove previous model
    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current = null;
    }

    let cancelled = false;

    const loader = new LDrawLoader();
    loader.setPartsLibraryPath(LDRAW_LIBRARY_URL);

    // Preload LDraw color definitions, then parse the model.
    // parse() doesn't call addDefaultMaterials() internally (load() does),
    // so without this step all materials resolve to null -> "uuid" crash.
    loader.preloadMaterials(LDRAW_LIBRARY_URL + "LDConfig.ldr")
      .then(() => {
        if (cancelled) return;
        loader.parse(
          ldrContent,
          (group: THREE.Group) => {
            if (cancelled) return;

            // Merge geometries for performance
            const mergedGroup = LDrawUtils.mergeObject(group);
            // LDraw Y-axis is inverted relative to Three.js convention
            mergedGroup.rotateX(-Math.PI);

            // Center the model and fit camera
            const box = new THREE.Box3().setFromObject(mergedGroup);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            mergedGroup.position.sub(center);
            scene.add(mergedGroup);
            modelRef.current = mergedGroup;

            // Position camera to frame the model
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
            camera.position.set(dist * 0.8, dist * 0.6, dist * 0.8);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0);
            controls.update();

            setLoading(false);
          },
          (err: unknown) => {
            if (cancelled) return;
            console.error("LDraw parse error:", err);
            setError(err instanceof Error ? err.message : "Failed to parse LDR model");
            setLoading(false);
          }
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("LDraw material preload error:", err);
        setError("Failed to load LDraw color definitions");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ldrContent]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700/50">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-800/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading 3D preview...</p>
            <p className="text-xs text-slate-500 mt-1">Parsing LDraw model</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-800/90">
          <div className="text-center px-4">
            <p className="text-sm text-red-400 font-medium">3D Preview Error</p>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
