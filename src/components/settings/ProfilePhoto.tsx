import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPrefs } from '../../contexts/UserPrefsContext';
import { mediaPath, removeImages, uploadImage } from '../../lib/media';
import { Avatar, Button, Modal, useToast } from '../ui';

const VIEW = 260; // crop viewport (px)
const OUT = 512;  // saved photo size (px)

/** Profile photo row for Settings: pick → crop (drag + zoom) → upload. */
export function ProfilePhoto() {
  const { user } = useAuth();
  const { fullName, avatarPath, avatarUrl, refreshPrefs } = useUserPrefs();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (f: File) => setSrc(URL.createObjectURL(f));
  const closeCrop = () => { if (src) URL.revokeObjectURL(src); setSrc(null); };

  const save = async (blob: Blob) => {
    if (!user) return;
    setBusy(true);
    const path = mediaPath(user.id, 'avatar', 'photo');
    const { error } = await uploadImage(path, blob);
    if (error) { setBusy(false); toast.show(`Couldn't upload: ${error}`); return; }
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id);
    if (dbErr) { setBusy(false); removeImages([path]); toast.show(`Couldn't save: ${dbErr.message}`); return; }
    if (avatarPath) removeImages([avatarPath]);
    await refreshPrefs();
    setBusy(false);
    closeCrop();
    toast.show('Profile photo updated');
  };

  const remove = async () => {
    if (!user || !avatarPath) return;
    setBusy(true);
    await supabase.from('profiles').update({ avatar_path: null }).eq('id', user.id);
    removeImages([avatarPath]);
    await refreshPrefs();
    setBusy(false);
    toast.show('Profile photo removed');
  };

  return (
    <div className="flex items-center gap-4 pb-4 row-rule">
      <Avatar name={fullName || user?.email} src={avatarUrl} ink size={64} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <Camera size={14} /> {avatarUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {avatarPath && (
            <Button variant="danger" size="sm" onClick={remove} disabled={busy}><Trash2 size={14} /> Remove</Button>
          )}
        </div>
        <span className="text-xs text-slate-400">Shown in the sidebar and on More. Only you can see it.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
      />
      {src && <CropModal src={src} busy={busy} onCancel={closeCrop} onDone={save} />}
    </div>
  );
}

function CropModal({ src, busy, onCancel, onDone }: { src: string; busy: boolean; onCancel: () => void; onDone: (b: Blob) => void }) {
  const img = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      img.current = i;
      setNat({ w: i.naturalWidth, h: i.naturalHeight });
      const s = Math.max(VIEW / i.naturalWidth, VIEW / i.naturalHeight);
      setPos({ x: (VIEW - i.naturalWidth * s) / 2, y: (VIEW - i.naturalHeight * s) / 2 });
    };
    i.src = src;
  }, [src]);

  const scale = nat ? Math.max(VIEW / nat.w, VIEW / nat.h) * zoom : 1;
  const clamp = (p: { x: number; y: number }, s = scale) => nat ? {
    x: Math.min(0, Math.max(VIEW - nat.w * s, p.x)),
    y: Math.min(0, Math.max(VIEW - nat.h * s, p.y)),
  } : p;

  // Zoom around the centre of the viewport.
  const onZoom = (z: number) => {
    if (!nat) return;
    const s0 = scale;
    const s1 = Math.max(VIEW / nat.w, VIEW / nat.h) * z;
    const c = VIEW / 2;
    setZoom(z);
    setPos(clamp({ x: c - ((c - pos.x) / s0) * s1, y: c - ((c - pos.y) / s0) * s1 }, s1));
  };

  const done = () => {
    if (!img.current || !nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.current, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    canvas.toBlob((b) => b && onDone(b), 'image/jpeg', 0.86);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title="Crop photo"
      maxWidth="max-w-sm"
      footer={<>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={done} disabled={busy || !nat}>{busy ? 'Saving…' : 'Save photo'}</Button>
      </>}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing select-none"
          style={{ width: VIEW, height: VIEW, touchAction: 'none' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {nat && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={{ width: nat.w * scale, height: nat.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          <div className="absolute inset-0 border-2 border-app/70 pointer-events-none" />
        </div>
        <label className="w-full flex items-center gap-3 text-xs text-slate-400">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} className="flex-1 accent-blue-500" />
        </label>
        <p className="text-xs text-slate-400 self-start">Drag to reposition.</p>
      </div>
    </Modal>
  );
}
