"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  generateMosaic,
  generateWantedListXML,
  MOSAIC_SIZES,
  MosaicResult,
  MosaicSize,
} from "@/lib/mosaicEngine";

type PieceType = "tile" | "plate";

interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Upload Image" },
    { num: 2, label: "Configure & Export" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {steps.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className="flex items-center gap-2.5">
            <div
              className={`
                w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
                transition-all duration-300
                ${
                  currentStep === step.num
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-110"
                    : currentStep > step.num
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-400"
                }
              `}
            >
              {currentStep > step.num ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.num
              )}
            </div>
            <span
              className={`text-sm font-medium transition-colors duration-300 ${
                currentStep >= step.num ? "text-white" : "text-slate-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-1 rounded transition-colors duration-300 ${
                currentStep > step.num ? "bg-emerald-600" : "bg-slate-700"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Slider Control ──────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <span className="text-xs font-mono tabular-nums text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                     accent-blue-500
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-blue-500
                     [&::-webkit-slider-thumb]:shadow-lg
                     [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:transition-transform
                     [&::-webkit-slider-thumb]:hover:scale-110
                     [&::-moz-range-thumb]:w-4
                     [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-full
                     [&::-moz-range-thumb]:bg-blue-500
                     [&::-moz-range-thumb]:border-0
                     [&::-moz-range-thumb]:shadow-lg
                     [&::-moz-range-thumb]:cursor-pointer"
        />
        <button
          onClick={() => onChange(0)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          title="Reset"
        >
          ↺
        </button>
      </div>
    </div>
  );
}

// ─── Settings Panel (shared between configure and result views) ──────────────

function SettingsPanel({
  selectedSize,
  onSizeChange,
  pieceType,
  onPieceTypeChange,
  adjustments,
  onAdjustmentsChange,
  optimize,
  onOptimizeChange,
  minimizeColors,
  onMinimizeColorsChange,
  imagePreview,
  compact,
}: {
  selectedSize: MosaicSize;
  onSizeChange: (s: MosaicSize) => void;
  pieceType: PieceType;
  onPieceTypeChange: (p: PieceType) => void;
  adjustments: ImageAdjustments;
  onAdjustmentsChange: (a: ImageAdjustments) => void;
  optimize: boolean;
  onOptimizeChange: (o: boolean) => void;
  minimizeColors: boolean;
  onMinimizeColorsChange: (v: boolean) => void;
  imagePreview: string | null;
  compact?: boolean;
}) {
  const cardClass = compact
    ? "bg-slate-800/60 rounded-xl p-4 border border-slate-700/50"
    : "bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50";
  const headingClass = compact
    ? "text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3"
    : "text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4";

  return (
    <div className="space-y-4">
      {/* Source preview with CSS filter adjustments */}
      {imagePreview && !compact && (
        <div className={cardClass}>
          <h3 className={headingClass}>Source Image</h3>
          <div className="aspect-square rounded-xl overflow-hidden bg-slate-900 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Source"
              className="w-full h-full object-contain"
              style={{
                filter: `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Mosaic Size */}
      <div className={cardClass}>
        <h3 className={headingClass}>Mosaic Size</h3>
        <select
          value={MOSAIC_SIZES.indexOf(selectedSize)}
          onChange={(e) => onSizeChange(MOSAIC_SIZES[Number(e.target.value)])}
          className="w-full bg-slate-700 text-white rounded-xl px-4 py-2.5 border border-slate-600
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     cursor-pointer appearance-none text-sm
                     bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22/%3E%3C/svg%3E')]
                     bg-[length:20px] bg-[right_12px_center] bg-no-repeat"
        >
          {MOSAIC_SIZES.map((size, i) => (
            <option key={i} value={i}>
              {size.label}
            </option>
          ))}
        </select>
      </div>

      {/* Piece Type */}
      <div className={cardClass}>
        <h3 className={headingClass}>Piece Type</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "tile" as PieceType, label: "Tile", desc: "Smooth top", icon: "◻" },
            { id: "plate" as PieceType, label: "Plate", desc: "Studded top", icon: "⊡" },
          ]).map((type) => (
            <button
              key={type.id}
              onClick={() => onPieceTypeChange(type.id)}
              className={`
                flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-200
                ${
                  pieceType === type.id
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-slate-600 bg-slate-700/30 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                }
              `}
            >
              <span className="text-xl">{type.icon}</span>
              <span className="font-semibold text-xs">{type.label}</span>
              <span className="text-[10px] opacity-70">{type.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Optimize Toggle */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={headingClass + " !mb-1"}>Minimize Pieces</h3>
            <p className="text-xs text-slate-500">
              Merge same-color areas into larger bricks
            </p>
          </div>
          <button
            onClick={() => onOptimizeChange(!optimize)}
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0
              ${optimize ? "bg-blue-600" : "bg-slate-600"}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                ${optimize ? "translate-x-5" : "translate-x-0"}
              `}
            />
          </button>
        </div>
      </div>

      {/* Minimize Colors Toggle */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={headingClass + " !mb-1"}>Minimize Colors</h3>
            <p className="text-xs text-slate-500">
              Merge rare colors into nearest common color
            </p>
          </div>
          <button
            onClick={() => onMinimizeColorsChange(!minimizeColors)}
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0
              ${minimizeColors ? "bg-blue-600" : "bg-slate-600"}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                ${minimizeColors ? "translate-x-5" : "translate-x-0"}
              `}
            />
          </button>
        </div>
      </div>

      {/* Image Adjustments */}
      <div className={cardClass}>
        <h3 className={headingClass}>Image Adjustments</h3>
        <div className="space-y-4">
          <Slider
            label="Brightness"
            value={adjustments.brightness}
            onChange={(v) => onAdjustmentsChange({ ...adjustments, brightness: v })}
          />
          <Slider
            label="Contrast"
            value={adjustments.contrast}
            onChange={(v) => onAdjustmentsChange({ ...adjustments, contrast: v })}
          />
          <Slider
            label="Saturation"
            value={adjustments.saturation}
            onChange={(v) => onAdjustmentsChange({ ...adjustments, saturation: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MosaicCreator() {
  // --- State ---
  const [step, setStep] = useState(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<MosaicSize>(MOSAIC_SIZES[1]); // 32x32 default
  const [pieceType, setPieceType] = useState<PieceType>("tile");
  const [optimize, setOptimize] = useState(false);
  const [minimizeColors, setMinimizeColors] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<MosaicResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  const handleFile = useCallback((file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    const MAX_FILE_SIZE_MB = 20;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // Validate image dimensions before accepting
      const img = new Image();
      img.onload = () => {
        const MAX_DIMENSION = 16384; // Canvas hard limit in most browsers
        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          alert(
            `Image dimensions (${img.width}×${img.height}) exceed the maximum of ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`
          );
          setImageFile(null);
          return;
        }
        setImagePreview(dataUrl);
      };
      img.onerror = () => {
        alert("Failed to load image. The file may be corrupted.");
        setImageFile(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  // Listen for Ctrl+V / Cmd+V paste with image data
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleFile]);

  const handleGenerate = useCallback(async () => {
    if (!imageFile) return;
    setIsGenerating(true);
    try {
      const mosaicResult = await generateMosaic(imageFile, selectedSize, {
        pieceType: pieceType === "tile" ? "3070b" : "3024",
        brightness: adjustments.brightness,
        contrast: adjustments.contrast,
        saturation: adjustments.saturation,
        optimize,
        minimizeColors,
      });
      setResult(mosaicResult);
      setStep(2);
    } catch (err) {
      console.error("Mosaic generation failed:", err);
      alert("Failed to generate mosaic. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [imageFile, selectedSize, pieceType, adjustments, optimize, minimizeColors]);

  const handleDownloadLdr = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.ldrContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mosaic_${selectedSize.widthStuds}x${selectedSize.heightStuds}.ldr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, selectedSize]);

  const handleDownloadWantedList = useCallback(() => {
    if (!result) return;
    const xml = generateWantedListXML(result);
    const blob = new Blob([xml], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mosaic_${selectedSize.widthStuds}x${selectedSize.heightStuds}_wanted_list.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, selectedSize]);

  const handleStartOver = useCallback(() => {
    setStep(1);
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setIsGenerating(false);
  }, []);

  const totalPieces = useMemo(
    () => result?.totalPieces ?? 0,
    [result]
  );

  // ─── Step 1: Upload ──────────────────────────────────────────────────────

  const renderUploadStep = () => (
    <div className="max-w-xl mx-auto">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200 group
          ${
            dragActive
              ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
              : imagePreview
                ? "border-emerald-500/50 bg-slate-800/50"
                : "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
        />

        {imagePreview ? (
          <div className="space-y-4">
            <div className="relative w-full max-w-sm mx-auto aspect-square rounded-lg overflow-hidden shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Uploaded preview"
                className="w-full h-full object-contain bg-slate-900"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-emerald-400 font-medium">
                ✓ {imageFile?.name}
              </p>
              <p className="text-xs text-slate-500">Click, drop, or paste to replace</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-700/50 flex items-center justify-center group-hover:bg-slate-700 transition-colors">
              <svg
                className="w-8 h-8 text-slate-400 group-hover:text-blue-400 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16v-8m0 0l-3 3m3-3l3 3M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2c4.714 0 7.071 0 8.535 1.464C22 4.93 22 7.286 22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12z"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-medium text-white mb-1">
                Drop your image here
              </p>
              <p className="text-sm text-slate-400">
                or click to browse or paste · JPG, PNG, WebP
              </p>
            </div>
          </div>
        )}
      </div>

      {imagePreview && (
        <div className="mt-8 space-y-6">
          {/* Settings inline on upload step */}
          <SettingsPanel
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            pieceType={pieceType}
            onPieceTypeChange={setPieceType}
            adjustments={adjustments}
            onAdjustmentsChange={setAdjustments}
            optimize={optimize}
            onOptimizeChange={setOptimize}
            minimizeColors={minimizeColors}
            onMinimizeColorsChange={setMinimizeColors}
            imagePreview={imagePreview}
          />

          <div className="flex justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleGenerate();
              }}
              disabled={isGenerating}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500
                         text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25
                         hover:shadow-blue-500/30 disabled:shadow-none
                         transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
                         disabled:translate-y-0 disabled:cursor-not-allowed
                         flex items-center gap-2.5"
            >
              {isGenerating ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating Mosaic…
                </>
              ) : (
                <>Generate Mosaic →</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Step 2: Configure + Preview + Export ──────────────────────────────────

  const renderResultStep = () => (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* Left sidebar: Settings */}
        <div className="order-2 xl:order-1">
          <div className="xl:sticky xl:top-20">
            <SettingsPanel
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              pieceType={pieceType}
              onPieceTypeChange={setPieceType}
              adjustments={adjustments}
              onAdjustmentsChange={setAdjustments}
            optimize={optimize}
            onOptimizeChange={setOptimize}
            minimizeColors={minimizeColors}
            onMinimizeColorsChange={setMinimizeColors}
            imagePreview={imagePreview}
            compact            />

            {/* Re-generate button */}
            <div className="mt-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500
                           text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25
                           hover:shadow-blue-500/30 disabled:shadow-none
                           transition-all duration-200
                           disabled:cursor-not-allowed
                           flex items-center justify-center gap-2.5"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Regenerating…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate Mosaic
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview + Results */}
        <div className="order-1 xl:order-2 space-y-6">
          {result ? (
            <>
              {/* Mosaic Preview */}
              <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                    Mosaic Preview
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {selectedSize.widthStuds}×{selectedSize.heightStuds} studs
                  </span>
                </div>
                <div className="flex justify-center bg-slate-900 rounded-xl p-4 shadow-inner overflow-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.previewDataURL}
                    alt="Mosaic preview"
                    className="rounded-lg max-w-full max-h-[600px] object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 text-center">
                  <p className="text-2xl font-bold text-white">{totalPieces.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">Total Pieces</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 text-center">
                  <p className="text-2xl font-bold text-white">{result.partsList.length}</p>
                  <p className="text-xs text-slate-400 mt-1">Unique Parts</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 text-center">
                  <p className="text-2xl font-bold text-white capitalize">{pieceType}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {pieceType === "tile" ? "Smooth Top" : "Studded Top"}
                  </p>
                </div>
                {result.optimized ? (
                  <div className="bg-emerald-900/30 rounded-xl p-4 border border-emerald-700/30 text-center">
                    <p className="text-2xl font-bold text-emerald-400">
                      -{result.optimized.reductionPercent}%
                    </p>
                    <p className="text-xs text-emerald-500/80 mt-1">
                      Pieces Saved
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 text-center">
                    <p className="text-2xl font-bold text-white">{selectedSize.baseplates}</p>
                    <p className="text-xs text-slate-400 mt-1">Baseplates</p>
                  </div>
                )}
              </div>

              {/* Parts List Table */}
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                    Parts List
                  </h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="text-left py-3 px-5">Color</th>
                        <th className="text-left py-3 px-5">Name</th>
                        <th className="text-left py-3 px-5">Part</th>
                        <th className="text-right py-3 px-5">Count</th>
                        <th className="text-right py-3 px-5">BL Color ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {result.partsList.map((part, i) => (
                        <tr
                          key={i}
                          className="hover:bg-slate-700/20 transition-colors"
                        >
                          <td className="py-2.5 px-5">
                            <div
                              className="w-5 h-5 rounded shadow-sm border border-white/10"
                              style={{ backgroundColor: part.color.hex }}
                            />
                          </td>
                          <td className="py-2.5 px-5 text-sm text-gray-300">
                            {part.color.name}
                          </td>
                          <td className="py-2.5 px-5 text-sm text-slate-400 font-mono">
                            {part.partNumber}
                          </td>
                          <td className="py-2.5 px-5 text-sm text-white font-semibold text-right tabular-nums">
                            {part.count.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-5 text-sm text-slate-400 text-right font-mono">
                            {part.bricklinkColorId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Export Options */}
              <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Export Options
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-emerald-400">▸</span>
                    <p className="text-slate-300">
                      <span className="font-semibold text-white">.ldr file:</span>{" "}
                      Open in BrickLink Studio to view, edit, and render your mosaic
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-amber-400">▸</span>
                    <p className="text-slate-300">
                      <span className="font-semibold text-white">Wanted List XML:</span>{" "}
                      Upload directly to BrickLink.com to order all parts
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleDownloadLdr}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl
                               shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/30
                               transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
                               flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download .ldr File
                  </button>
                  <button
                    onClick={handleDownloadWantedList}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl
                               shadow-lg shadow-amber-600/25 hover:shadow-amber-500/30
                               transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
                               flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export BrickLink Wanted List
                  </button>
                </div>
              </div>

              {/* Start Over */}
              <div className="flex justify-start">
                <button
                  onClick={handleStartOver}
                  className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white
                             bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700
                             transition-all duration-200"
                >
                  ← Upload New Image
                </button>
              </div>
            </>
          ) : (
            /* Placeholder when no result yet */
            <div className="bg-slate-800/60 rounded-2xl p-12 border border-slate-700/50 text-center">
              <p className="text-slate-500">
                Configure your settings and click &quot;Generate Mosaic&quot; to see the preview.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="py-6 px-4">
      <StepIndicator currentStep={step} />

      <div className="transition-all duration-300">
        {step === 1 && renderUploadStep()}
        {step === 2 && renderResultStep()}
      </div>
    </div>
  );
}
