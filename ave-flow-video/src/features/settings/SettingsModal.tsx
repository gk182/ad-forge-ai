'use client';

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Settings, CheckCircle2, AlertCircle } from 'lucide-react';
import { KEY_FIELDS, PROMPT_TEMPLATE_PLACEHOLDER } from './settings.constants';
import { getStoredSetting, savePromptTemplate, saveStoredSetting } from './settings.storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');

  const [promptTemplate, setPromptTemplate] = useState('');
  const [saved, setSaved] = useState(false);
  const [serverConfig, setServerConfig] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;

    const loaded: Record<string, string> = {};
    KEY_FIELDS.forEach((field) => {
      loaded[field.storageKey] = getStoredSetting(field.storageKey);
    });

    setKeys(loaded);
    setGeminiModel(getStoredSetting('gemini_model', 'gemini-2.5-flash'));

    setPromptTemplate(getStoredSetting('prompt_template'));
    setSaved(false);

    // Fetch server configuration environment keys presence
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setServerConfig({
          gemini_api_key: data.hasGeminiApiKey,
          elevenlabs_api_key: data.hasElevenLabsApiKey,
          firecrawl_api_key: data.hasFirecrawlApiKey,
          did_api_key: data.hasDidApiKey,
        });
      })
      .catch((err) => console.error('Failed to load server configuration:', err));
  }, [isOpen]);

  const handleSave = () => {
    KEY_FIELDS.forEach((field) => {
      saveStoredSetting(field.storageKey, keys[field.storageKey] || '');
    });

    saveStoredSetting('gemini_model', geminiModel);
    savePromptTemplate(promptTemplate);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleShowKey = (storageKey: string) => {
    setShowKeys((previous) => ({ ...previous, [storageKey]: !previous[storageKey] }));
  };



  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="glass-card relative z-10 w-full max-w-lg animate-fade-in p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--primary)]/10">
              <Settings className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Cấu hình API</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Thiết lập API key và tuỳ chọn avatar
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-5 h-5 text-[var(--muted)]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {KEY_FIELDS.map((field) => {
            const value = keys[field.storageKey] || '';
            const isLocalConfigured = value.length > 0;
            const isServerConfigured = serverConfig[field.storageKey] || false;

            return (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--foreground)]">
                    {field.label}
                  </label>
                  {isLocalConfigured ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--success)]" title="Ghi đè cấu hình hệ thống (Lưu ở trình duyệt)">
                      <CheckCircle2 className="w-3 h-3" /> Đã cấu hình (Trình duyệt)
                    </span>
                  ) : isServerConfigured ? (
                    <span className="flex items-center gap-1 text-xs text-sky-400" title="Đang dùng cấu hình từ tệp .env ở server">
                      <CheckCircle2 className="w-3 h-3" /> Đã cấu hình (Hệ thống)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <AlertCircle className="w-3 h-3" /> Chưa cấu hình
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showKeys[field.storageKey] ? 'text' : 'password'}
                    value={value}
                    onChange={(event) =>
                      setKeys((previous) => ({
                        ...previous,
                        [field.storageKey]: event.target.value,
                      }))
                    }
                    placeholder={
                      isServerConfigured
                        ? '•••••••• (Đang dùng cấu hình hệ thống)'
                        : field.placeholder
                    }
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white placeholder-[var(--muted)] input-focus-ring transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(field.storageKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/5 transition-colors"
                  >
                    {showKeys[field.storageKey] ? (
                      <EyeOff className="w-4 h-4 text-[var(--muted)]" />
                    ) : (
                      <Eye className="w-4 h-4 text-[var(--muted)]" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Chọn model Gemini
            </label>
            <select
              value={geminiModel}
              onChange={(event) => setGeminiModel(event.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white input-focus-ring transition-all"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash - nhanh, cân bằng, hợp test</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro - hiểu ngữ cảnh tốt hơn, hợp bản final</option>
            </select>
            <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
              Flash phù hợp khi cần tốc độ. Pro phù hợp khi bạn muốn phân tích markdown kỹ hơn và
              tạo script giàu cấu trúc hơn.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--foreground)]">
                Ghi chú phong cách cho prompt
              </label>
              <button
                type="button"
                onClick={() => setPromptTemplate('')}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                Xóa ghi chú
              </button>
            </div>
            <textarea
              value={promptTemplate}
              onChange={(event) => setPromptTemplate(event.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-sm text-white placeholder-[var(--muted)] input-focus-ring transition-all resize-y leading-relaxed"
              placeholder={PROMPT_TEMPLATE_PLACEHOLDER}
            />
            <p className="text-[10px] text-[var(--muted)] mt-1.5 leading-relaxed">
              Mục này không còn là template cứng. Hệ thống đã có prompt gốc rất chi tiết, bạn chỉ
              cần ghi thêm yêu cầu riêng về phong cách, góc nhìn, nhịp điệu, hoặc điều cần tránh.
            </p>
          </div>



          <div className="rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/10 p-3">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Các khóa được lưu cục bộ trong trình duyệt và không gửi về server của chúng tôi.
              Chúng chỉ được dùng trong các route proxy để gọi nhà cung cấp bên ngoài.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
          >
            Hủy
          </button>
          <button onClick={handleSave} className="gradient-btn px-6 py-2.5 rounded-xl text-sm">
            {saved ? 'Đã lưu' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
}
