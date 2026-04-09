import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Settings, Play, Square, RefreshCw, MousePointer2, Image as ImageIcon, Cpu, Zap, Activity, Globe, Download, Camera, Trash2, History } from 'lucide-react';
import GIF from 'gif.js';
import { getSavedImages, saveImage, deleteImage, SavedImage } from '../lib/storage';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  originX: number;
  originY: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
  friction: number;
  ease: number;
}

export default function SkyPixelEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  
  // High-performance Typed Arrays for particle data
  const particlesData = useRef<{
    x: Float32Array;
    y: Float32Array;
    targetX: Float32Array;
    targetY: Float32Array;
    originX: Float32Array;
    originY: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    colorGroups: { color: string; start: number; count: number }[];
  } | null>(null);

  const [particleCount, setParticleCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [particleSize, setParticleSize] = useState(2);
  const [resolution, setResolution] = useState(2);
  const [mouseRadius, setMouseRadius] = useState(120);
  const [force, setForce] = useState(8);
  const [speed, setSpeed] = useState(5);
  const [friction, setFriction] = useState(0.92);
  const [ease, setEase] = useState(0.06);
  const [glow, setGlow] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const requestRef = useRef<number>(null);

  useEffect(() => {
    const loadSaved = async () => {
      setIsGalleryLoading(true);
      setGalleryError(null);
      try {
        const saved = await getSavedImages();
        setSavedImages(saved);
      } catch (error: any) {
        console.error("Gallery load error:", error);
        setGalleryError(error.message || "Failed to connect to database");
      } finally {
        setIsGalleryLoading(false);
      }
    };
    loadSaved();
  }, []);

  useEffect(() => {
    // Map speed (1-10) to friction and ease
    const newEase = 0.02 + (speed / 10) * 0.15;
    const newFriction = 0.85 + (speed / 10) * 0.12;
    setEase(newEase);
    setFriction(newFriction);
  }, [speed]);

  const initParticles = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;
    let drawWidth, drawHeight;

    if (imgRatio > canvasRatio) {
      drawWidth = Math.floor(width * 0.75);
      drawHeight = Math.floor(drawWidth / imgRatio);
    } else {
      drawHeight = Math.floor(height * 0.75);
      drawWidth = Math.floor(drawHeight * imgRatio);
    }

    if (drawWidth <= 0 || drawHeight <= 0) return;

    offscreen.width = drawWidth;
    offscreen.height = drawHeight;
    offCtx.drawImage(img, 0, 0, drawWidth, drawHeight);

    const imageData = offCtx.getImageData(0, 0, drawWidth, drawHeight).data;
    
    const MAX_PARTICLES = 40000;
    let safeResolution = Math.max(resolution, 1);
    
    let estimatedCount = (drawWidth / safeResolution) * (drawHeight / safeResolution);
    while (estimatedCount > MAX_PARTICLES) {
      safeResolution += 0.5;
      estimatedCount = (drawWidth / safeResolution) * (drawHeight / safeResolution);
    }

    const tempParticles: { x: number; y: number; tx: number; ty: number; color: string }[] = [];
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    for (let y = 0; y < drawHeight; y += safeResolution) {
      for (let x = 0; x < drawWidth; x += safeResolution) {
        const index = (Math.floor(y) * drawWidth + Math.floor(x)) * 4;
        const r = imageData[index];
        const g = imageData[index + 1];
        const b = imageData[index + 2];
        const a = imageData[index + 3];

        if (a > 128) {
          tempParticles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            tx: x + offsetX,
            ty: y + offsetY,
            color: `rgb(${r},${g},${b})`
          });
        }
      }
    }

    // Sort by color for batching
    tempParticles.sort((a, b) => a.color.localeCompare(b.color));

    const count = tempParticles.length;
    const data = {
      x: new Float32Array(count),
      y: new Float32Array(count),
      targetX: new Float32Array(count),
      targetY: new Float32Array(count),
      originX: new Float32Array(count),
      originY: new Float32Array(count),
      vx: new Float32Array(count),
      vy: new Float32Array(count),
      colorGroups: [] as { color: string; start: number; count: number }[]
    };

    let currentGroup: { color: string; start: number; count: number } | null = null;

    for (let i = 0; i < count; i++) {
      const p = tempParticles[i];
      data.x[i] = p.x;
      data.y[i] = p.y;
      data.targetX[i] = p.tx;
      data.targetY[i] = p.ty;
      data.originX[i] = p.tx;
      data.originY[i] = p.ty;
      
      if (!currentGroup || currentGroup.color !== p.color) {
        currentGroup = { color: p.color, start: i, count: 0 };
        data.colorGroups.push(currentGroup);
      }
      currentGroup.count++;
    }

    particlesData.current = data;
    setParticleCount(count);
    setIsAnimating(true);
  }, [resolution, particleSize]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        setImage(img);
        setTimeout(() => initParticles(img), 50);
        
        // Save to IndexedDB
        const saved = await saveImage(file.name, dataUrl);
        setSavedImages(prev => [saved, ...prev]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const loadFromGallery = (saved: SavedImage) => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setTimeout(() => initParticles(img), 50);
    };
    img.src = saved.data;
  };

  const handleDeleteImage = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteImage(id);
    setSavedImages(prev => prev.filter(img => img.id !== id));
  };

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !particlesData.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    if (glow) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
    } else {
      ctx.shadowBlur = 0;
    }

    const data = particlesData.current;
    const count = particleCount;
    let anyParticleMoving = false;

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const mActive = mouseRef.current.active;
    const rSq = mouseRadius * mouseRadius;

    for (let i = 0; i < count; i++) {
      let px = data.x[i];
      let py = data.y[i];
      let pvx = data.vx[i];
      let pvy = data.vy[i];

      if (mActive) {
        const dx = mx - px;
        const dy = my - py;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < rSq) {
          const dist = Math.sqrt(distSq);
          const angle = Math.atan2(dy, dx);
          const push = (mouseRadius - dist) / mouseRadius;
          pvx -= Math.cos(angle) * push * force;
          pvy -= Math.sin(angle) * push * force;
          anyParticleMoving = true;
        }
      }

      const tdx = data.targetX[i] - px;
      const tdy = data.targetY[i] - py;
      
      pvx += tdx * ease;
      pvy += tdy * ease;
      pvx *= friction;
      pvy *= friction;
      
      px += pvx;
      py += pvy;

      if (Math.abs(pvx) > 0.01 || Math.abs(pvy) > 0.01) {
        anyParticleMoving = true;
      }

      const snapThreshold = 0.5;
      if (Math.abs(tdx) < snapThreshold && Math.abs(tdy) < snapThreshold && Math.abs(pvx) < 0.1 && Math.abs(pvy) < 0.1) {
        px = data.targetX[i];
        py = data.targetY[i];
        pvx = 0;
        pvy = 0;
      }

      data.x[i] = px;
      data.y[i] = py;
      data.vx[i] = pvx;
      data.vy[i] = pvy;
    }

    // Batch rendering by color groups
    for (const group of data.colorGroups) {
      ctx.fillStyle = group.color;
      for (let i = group.start; i < group.start + group.count; i++) {
        ctx.fillRect(data.x[i], data.y[i], particleSize, particleSize);
      }
    }

    if (isAnimating) {
      if (!anyParticleMoving && !mActive) {
        setIsAnimating(false);
      } else {
        requestRef.current = requestAnimationFrame(animate);
      }
    }
  }, [isAnimating, mouseRadius, force, glow, friction, ease, particleSize, particleCount]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = window.innerWidth * dpr;
        canvasRef.current.height = window.innerHeight * dpr;
        canvasRef.current.style.width = `${window.innerWidth}px`;
        canvasRef.current.style.height = `${window.innerHeight}px`;
        
        if (image) initParticles(image);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [image, initParticles]);

  useEffect(() => {
    if (isAnimating) {
      requestRef.current = requestAnimationFrame(animate);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isAnimating, animate]);

  const handleMouseMove = (e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    if (!isAnimating) setIsAnimating(true);
  };

  const handleMouseLeave = () => {
    mouseRef.current.active = false;
  };

  const recordGIF = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    setIsRecording(true);
    setRecordProgress(0);

    try {
      // Fetch worker script to create a local blob URL (bypasses some iframe/CSP issues)
      const workerResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
      const workerBlob = await workerResponse.blob();
      const workerUrl = URL.createObjectURL(workerBlob);

      const gif = new GIF({
        workers: 4,
        quality: 10,
        width: Math.floor(canvas.width / 2),
        height: Math.floor(canvas.height / 2),
        workerScript: workerUrl
      });

      const frames = 40; 
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width / 2;
      tempCanvas.height = canvas.height / 2;
      const tempCtx = tempCanvas.getContext('2d');

      for (let i = 0; i < frames; i++) {
        if (tempCtx) {
          tempCtx.fillStyle = '#050505';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
          gif.addFrame(tempCtx, { copy: true, delay: 40 });
        }
        setRecordProgress(Math.round(((i + 1) / frames) * 50));
        await new Promise(r => setTimeout(r, 40));
      }

      gif.on('progress', (p: number) => {
        setRecordProgress(50 + Math.round(p * 50));
      });

      gif.on('finished', (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `skypixel-${Date.now()}.gif`;
        link.click();
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(workerUrl);
        setIsRecording(false);
        setRecordProgress(0);
      });

      gif.render();
    } catch (error) {
      console.error('GIF Recording failed:', error);
      setIsRecording(false);
      setRecordProgress(0);
    }
  };

  const downloadFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'skypixel-frame.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const scatter = () => {
    const canvas = canvasRef.current;
    const data = particlesData.current;
    if (!canvas || !data) return;
    
    for (let i = 0; i < particleCount; i++) {
      data.targetX[i] = Math.random() * canvas.width;
      data.targetY[i] = Math.random() * canvas.height;
    }
    setIsAnimating(true);
  };

  const restore = () => {
    const data = particlesData.current;
    if (!data) return;
    
    for (let i = 0; i < particleCount; i++) {
      data.targetX[i] = data.originX[i];
      data.targetY[i] = data.originY[i];
    }
    setIsAnimating(true);
  };

  return (
    <div ref={containerRef} className="flex h-screen bg-[#050505] overflow-hidden font-sans selection:bg-primary/30">
      {/* Main Viewport */}
      <div className="flex-1 relative overflow-hidden cursor-none">
        {/* Background Grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        
        {/* Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03]"
             style={{ background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }} />

        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="absolute inset-0"
        />

        {/* Floating Info Overlays */}
        <div className="absolute top-4 md:top-8 left-4 md:left-8 pointer-events-none z-10">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-primary/20 border border-primary/50 flex items-center justify-center rounded-sm">
                <Cpu className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-5xl font-black tracking-tighter text-white uppercase italic leading-none">
                  SkyPixel<span className="text-primary ml-1">Tech</span>
                </h1>
                <p className="text-[8px] md:text-[10px] font-mono text-white/40 tracking-[0.2em] md:tracking-[0.4em] uppercase mt-1">
                  Interactive Drone Swarm Engine // v1.0.4
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Mobile Toggle Button */}
        <div className="absolute top-4 right-4 z-[60] md:hidden pointer-events-auto">
          <Button 
            variant="outline" 
            size="icon" 
            className="bg-black/60 border-white/10 text-white"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Settings className={`w-5 h-5 transition-transform ${isSidebarOpen ? 'rotate-90' : ''}`} />
          </Button>
        </div>

        {/* Sidebar Tech Info - Hidden on mobile */}
        <div className="absolute top-1/2 -translate-y-1/2 left-8 hidden md:flex flex-col gap-12 pointer-events-none opacity-20">
          <div className="flex flex-col gap-2">
            <div className="w-1 h-12 bg-white/20" />
            <span className="text-[10px] font-mono text-white uppercase tracking-[0.5em] [writing-mode:vertical-lr]">System.Core</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="w-1 h-12 bg-white/20" />
            <span className="text-[10px] font-mono text-white uppercase tracking-[0.5em] [writing-mode:vertical-lr]">Swarm.Net</span>
          </div>
        </div>

        {/* Footer Info - Hidden on mobile */}
        <div className="absolute bottom-8 left-8 hidden md:flex gap-12 pointer-events-none">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.3em]">Coordinates</span>
            <div className="flex gap-4">
              <span className="text-xs font-mono text-white/60 tabular-nums">X: {mouseRef.current.x.toFixed(0).padStart(4, '0')}</span>
              <span className="text-xs font-mono text-white/60 tabular-nums">Y: {mouseRef.current.y.toFixed(0).padStart(4, '0')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.3em]">Swarm Density</span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-primary"
                  animate={{ width: `${Math.min(100, particleCount / 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-white/60">
                {Math.round(particleCount / 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Controls */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed md:relative top-0 right-0 h-full w-full md:w-80 border-l border-white/10 bg-black/80 md:bg-black/40 backdrop-blur-3xl p-6 flex flex-col gap-6 overflow-y-auto cursor-auto z-50"
          >
            <div className="flex justify-between items-center md:hidden mb-4">
              <h2 className="text-lg font-bold text-white uppercase tracking-widest">Control Center</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                <Square className="w-5 h-5 text-white/40" />
              </Button>
            </div>
            
            <div className="flex flex-col gap-6">
              <Card className="bg-white/[0.02] border-white/5 p-5 shadow-2xl border-t-white/10">
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/5 mb-6 h-11 p-1">
                    <TabsTrigger value="upload" className="data-[state=active]:bg-white/10 text-[10px] uppercase tracking-widest">Source</TabsTrigger>
                    <TabsTrigger value="settings" className="data-[state=active]:bg-white/10 text-[10px] uppercase tracking-widest">Engine</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="space-y-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-3 h-3 text-primary" />
                        <Label className="text-[10px] uppercase tracking-[0.2em] text-white/40">Input Matrix</Label>
                      </div>
                      <div className="relative group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                        <div className="border border-white/10 rounded-sm p-10 flex flex-col items-center justify-center gap-4 group-hover:border-primary/40 transition-all bg-white/[0.02] group-hover:bg-white/[0.05]">
                          <div className="relative">
                            <Upload className="w-10 h-10 text-white/10 group-hover:text-primary transition-colors" />
                            <motion.div 
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="absolute inset-0 w-full h-full bg-primary/20 blur-xl" 
                            />
                          </div>
                          <span className="text-[10px] text-white/30 font-mono tracking-widest">INITIATE UPLOAD</span>
                        </div>
                      </div>
                    </div>

                    {/* Saved Images Gallery */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <History className="w-3 h-3 text-primary" />
                          <Label className="text-[10px] uppercase tracking-[0.2em] text-white/40">Memory Bank</Label>
                        </div>
                        {isGalleryLoading && <RefreshCw className="w-3 h-3 text-primary animate-spin" />}
                      </div>

                      {galleryError ? (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
                          <p className="text-[9px] text-red-400 font-mono leading-tight uppercase">
                            Error: {galleryError}
                          </p>
                          <Button 
                            variant="link" 
                            className="h-auto p-0 text-[8px] text-red-400/60 uppercase mt-1"
                            onClick={() => window.location.reload()}
                          >
                            Retry Connection
                          </Button>
                        </div>
                      ) : savedImages.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                          {savedImages.map((img) => (
                            <div 
                              key={img.id}
                              className="relative aspect-square border border-white/10 rounded-sm overflow-hidden group cursor-pointer hover:border-primary/50 transition-colors bg-white/5"
                              onClick={() => loadFromGallery(img)}
                            >
                              <img 
                                src={img.data} 
                                alt={img.name} 
                                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                referrerPolicy="no-referrer"
                              />
                              <button
                                onClick={(e) => handleDeleteImage(img.id, e)}
                                className="absolute top-1 right-1 p-1 bg-black/60 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : !isGalleryLoading && (
                        <div className="py-4 text-center border border-dashed border-white/5 rounded-sm">
                          <span className="text-[9px] text-white/20 uppercase tracking-widest">No data in bank</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        variant="outline" 
                        className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white text-[10px] uppercase tracking-widest h-10"
                        onClick={scatter}
                      >
                        <RefreshCw className="w-3 h-3 mr-2" /> Scatter
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white text-[10px] uppercase tracking-widest h-10"
                        onClick={restore}
                      >
                        <Play className="w-3 h-3 mr-2" /> Form
                      </Button>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button 
                        variant="outline" 
                        className="flex-1 bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary text-[10px] uppercase tracking-widest h-10"
                        onClick={recordGIF}
                        disabled={isRecording || particleCount === 0}
                      >
                        {isRecording ? (
                          <span className="flex items-center">
                            <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                            {recordProgress}%
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <Camera className="w-3 h-3 mr-2" />
                            GIF
                          </span>
                        )}
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white text-[10px] uppercase tracking-widest h-10"
                        onClick={downloadFrame}
                        disabled={particleCount === 0}
                      >
                        <Download className="w-3 h-3 mr-2" />
                        PNG
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-6 py-2">
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] uppercase tracking-widest text-white/40">Resolution</Label>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm">{resolution}px</span>
                        </div>
                        <Slider 
                          value={[resolution]} 
                          min={1} 
                          max={12} 
                          step={1} 
                          onValueChange={(v) => setResolution(Array.isArray(v) ? v[0] : v)}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] uppercase tracking-widest text-white/40">Drone Size</Label>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm">{particleSize}px</span>
                        </div>
                        <Slider 
                          value={[particleSize]} 
                          min={1} 
                          max={6} 
                          step={0.5} 
                          onValueChange={(v) => setParticleSize(Array.isArray(v) ? v[0] : v)}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] uppercase tracking-widest text-white/40">Animation Speed</Label>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm">{speed}</span>
                        </div>
                        <Slider 
                          value={[speed]} 
                          min={1} 
                          max={10} 
                          step={1} 
                          onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] uppercase tracking-widest text-white/40">Interaction Radius</Label>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm">{mouseRadius}px</span>
                        </div>
                        <Slider 
                          value={[mouseRadius]} 
                          min={50} 
                          max={400} 
                          step={10} 
                          onValueChange={(v) => setMouseRadius(Array.isArray(v) ? v[0] : v)}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] uppercase tracking-widest text-white/40">Interaction Force</Label>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-sm">{force}</span>
                        </div>
                        <Slider 
                          value={[force]} 
                          min={0} 
                          max={20} 
                          step={1} 
                          onValueChange={(v) => setForce(Array.isArray(v) ? v[0] : v)}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Label className="text-[10px] uppercase tracking-widest text-white/40">Engine Glow</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className={`h-6 text-[10px] uppercase tracking-widest ${glow ? 'text-primary' : 'text-white/20'}`}
                          onClick={() => setGlow(!glow)}
                        >
                          {glow ? 'ENABLED' : 'DISABLED'}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>

              <div className="flex flex-col gap-4">
                <div className="flex gap-2 justify-end">
                  {[Zap, Globe, Activity].map((Icon, i) => (
                    <div key={i} className="w-8 h-8 bg-white/5 border border-white/10 flex items-center justify-center rounded-sm">
                      <Icon className="w-4 h-4 text-white/20" />
                    </div>
                  ))}
                </div>
                <Card className="bg-white/[0.02] border-white/5 p-4 flex items-center gap-4 shadow-2xl border-t-white/10">
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-primary relative" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em] leading-none">
                      Swarm Status: {particleCount > 0 ? 'ACTIVE' : 'STANDBY'}
                    </span>
                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest mt-1">
                      {particleCount.toLocaleString()} UNITS DEPLOYED
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Cursor */}
      <motion.div
        animate={{
          x: mouseRef.current.x - mouseRadius,
          y: mouseRef.current.y - mouseRadius,
          scale: mouseRef.current.active ? 1 : 0.8,
          opacity: mouseRef.current.active ? 0.3 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.5 }}
        className="fixed top-0 left-0 pointer-events-none rounded-full border border-primary/50 bg-primary/5"
        style={{ width: mouseRadius * 2, height: mouseRadius * 2 }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1 h-1 bg-primary rounded-full" />
          <div className="absolute w-full h-[1px] bg-primary/20" />
          <div className="absolute h-full w-[1px] bg-primary/20" />
        </div>
      </motion.div>
    </div>
  );
}
