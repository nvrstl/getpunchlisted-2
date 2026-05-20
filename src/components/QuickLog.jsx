import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, MapPin, Loader2, Zap, Camera } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { ShimmerButton } from './magicui/shimmer';

async function compressImage(file, maxWidth = 1200, quality = 0.78) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function QuickLog({ onSubmit }) {
  const [open, setOpen]         = useState(false);
  const [note, setNote]         = useState('');
  const [location, setLocation] = useState('');
  const [photo, setPhoto]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const textRef   = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => textRef.current?.focus(), 100); }, [open]);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('punchlister:quicklog-open', onOpen);
    return () => window.removeEventListener('punchlister:quicklog-open', onOpen);
  }, []);

  const close = () => { setOpen(false); setNote(''); setLocation(''); setPhoto(null); };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(await compressImage(file));
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setLoading(true);
    await onSubmit({ rawNote: note.trim(), location: location.trim(), photo });
    setLoading(false);
    close();
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!open && (
          <motion.button
            onClick={() => setOpen(true)}
            aria-label="Snelle notitie"
            className="md:hidden fixed bottom-[80px] right-4 z-50 w-14 h-14 bg-brand rounded-full flex items-center justify-center cursor-pointer shadow-brand-lg"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          >
            <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />

            {/* Sheet */}
            <motion.div
              className="relative w-full md:max-w-lg md:rounded-2xl rounded-t-3xl flex flex-col overflow-hidden max-h-[92vh] glass-modal"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            >
              {/* Handle */}
              <div className="md:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 md:pt-5 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <span className="font-semibold text-[var(--text-primary)] text-[14px]">Snelle notitie</span>
                </div>
                <motion.button
                  onClick={close}
                  aria-label="Sluiten"
                  className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-auto">
                <div className="p-5 space-y-3 flex-1">
                  <Textarea
                    ref={textRef}
                    className="w-full text-base"
                    style={{ minHeight: 130 }}
                    placeholder="Wat observeerde u? bijv. 'Betonvloer op grid C-12 gestort. Slumptest geslaagd.'"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    required
                  />

                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
                    <Input
                      className="pl-9"
                      placeholder="Locatie (optioneel) — bijv. Verdieping 2, Grid B-4"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                    />
                  </div>

                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

                  <AnimatePresence mode="wait">
                    {photo ? (
                      <motion.div
                        key="photo"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="relative rounded-xl overflow-hidden border border-[var(--border-color)]"
                      >
                        <img src={photo} alt="Bijgevoegde foto" className="w-full max-h-48 object-cover" />
                        <motion.button
                          type="button"
                          onClick={() => setPhoto(null)}
                          aria-label="Foto verwijderen"
                          className="absolute top-2 right-2 bg-white/90 text-[var(--text-secondary)] rounded-full p-1.5 shadow-card cursor-pointer"
                          whileTap={{ scale: 0.9 }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </motion.button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="upload"
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                        className="w-full flex items-center gap-3 border-2 border-dashed border-[var(--border-color)] rounded-xl px-4 py-3.5 text-[var(--text-tertiary)] text-[13px] hover:border-brand/30 hover:text-[var(--text-secondary)] transition-all duration-200 cursor-pointer"
                        whileTap={{ scale: 0.98 }}
                      >
                        <Camera className="w-4 h-4" /> Foto toevoegen
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                <div className="px-5 pb-5 pt-2">
                  <ShimmerButton
                    type="submit"
                    disabled={loading || !note.trim()}
                    className="w-full py-3.5 text-[15px]"
                  >
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Opslaan…</>
                      : <><Zap className="w-4 h-4" /> Opslaan + Analyseren</>
                    }
                  </ShimmerButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
