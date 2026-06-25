'use client';

import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles } from 'lucide-react';

interface MobileAssetUploaderProps {
  onAssetsChange: (base64Images: string[]) => void;
  maxFiles?: number;
}

export const MobileAssetUploader: React.FC<MobileAssetUploaderProps> = ({
  onAssetsChange,
  maxFiles = 5,
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList) => {
    const validFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const remainingSlots = maxFiles - images.length;
    const filesToProcess = validFiles.slice(0, remainingSlots);

    if (filesToProcess.length === 0) return;

    const promises = filesToProcess.map((file) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            resolve(e.target.result);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(new Error('File reading error'));
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises)
      .then((base64Strings) => {
        const updatedImages = [...images, ...base64Strings].slice(0, maxFiles);
        setImages(updatedImages);
        onAssetsChange(updatedImages);
      })
      .catch((err) => {
        console.error('Failed to convert images:', err);
      });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    setImages(updated);
    onAssetsChange(updated);
  };

  const triggerSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4 w-full">
      {/* Upload Zone */}
      {images.length < maxFiles && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={triggerSelect}
          className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[140px] ${
            isDragging
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
              : 'border-[var(--border)] bg-white/3 hover:bg-white/5 hover:border-[var(--border-glow)] hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileSelect}
            accept="image/*"
            multiple
            className="hidden"
          />

          <div className="p-3 bg-white/5 rounded-xl group-hover:scale-110 transition-transform duration-300 mb-3">
            <Upload className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--primary)]" />
          </div>

          <p className="text-sm font-semibold text-white">
            Drag & drop screenshots or <span className="text-[var(--primary)] underline">browse</span>
          </p>
          <p className="text-xs text-[var(--muted)] mt-1.5 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Up to {maxFiles} device screenshots (JPEG/PNG)
          </p>
        </div>
      )}

      {/* Thumbnail Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-3.5 mt-2">
          {images.map((base64, idx) => (
            <div
              key={idx}
              className="relative group aspect-[9/16] rounded-xl overflow-hidden border border-white/10 shadow-lg bg-black/40 hover:scale-[1.02] hover:border-[var(--primary)] transition-all duration-300"
            >
              <img
                src={base64}
                alt={`Screenshot preview ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Overlay with delete button */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(idx);
                  }}
                  className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] text-white/90 border border-white/5">
                Screen {idx + 1}
              </div>
            </div>
          ))}

          {/* Slots remaining box */}
          {images.length < maxFiles && (
            <button
              type="button"
              onClick={triggerSelect}
              className="aspect-[9/16] rounded-xl border border-dashed border-white/10 hover:border-white/20 transition-colors flex flex-col items-center justify-center bg-white/2 hover:bg-white/4 gap-1 text-[var(--muted)] hover:text-white"
            >
              <Sparkles className="w-4 h-4 text-[var(--primary)] animate-pulse" />
              <span className="text-[10px]">Add ({maxFiles - images.length})</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
