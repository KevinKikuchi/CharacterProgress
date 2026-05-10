import { useState, useRef } from 'react';
import { Upload, X, Image, Check, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ImageUploader = ({ sessionId, onUploadComplete }) => {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFileSelect = (selected) => {
    setError('');
    const f = selected;
    if (!f) return;

    if (f.type !== 'image/png') {
      setError('Only PNG files are allowed');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUploaded(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !sessionId) return;
    setUploading(true);
    setError('');

    try {
      const filePath = `${sessionId}/${Date.now()}.png`;

      const { error: uploadErr } = await supabase.storage
        .from('screenshots')
        .upload(filePath, file);

      if (uploadErr) {
        if (uploadErr.message?.includes('Bucket') || uploadErr.message?.includes('bucket')) {
          throw new Error('Storage bucket "screenshots" not found. Run: INSERT INTO storage.buckets (id, name, public) VALUES (\'screenshots\', \'screenshots\', true);');
        }
        throw uploadErr;
      }

      const { data: urlData } = supabase.storage
        .from('screenshots')
        .getPublicUrl(filePath);

      setUploaded(true);
      onUploadComplete?.(urlData.publicUrl);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setFile(null);
    setUploaded(false);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent-teal)' : 'var(--glass-border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          transition: 'all 0.3s',
          background: dragOver ? 'rgba(0, 242, 255, 0.03)' : 'transparent',
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          onChange={(e) => handleFileSelect(e.target.files[0])}
          style={{ display: 'none' }}
        />

        {preview ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={preview}
              alt="Preview"
              style={{
                maxHeight: 180,
                borderRadius: 'var(--radius-sm)',
                opacity: uploaded ? 0.6 : 1,
              }}
            />
            {uploaded && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Check size={32} color="var(--success)" />
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                background: 'rgba(0,0,0,0.6)',
                border: 'none',
                borderRadius: '50%',
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>
            <Upload size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              {dragOver ? 'Drop your screenshot here' : 'Drag & drop a screenshot, or click to browse'}
            </p>
            <p style={{ fontSize: '0.8rem', marginTop: 4 }}>PNG only (max 5MB)</p>
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>}

      {file && !uploaded && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="btn-primary"
          style={{
            width: '100%',
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: uploading ? 0.7 : 1,
          }}
        >
          {uploading ? (
            <><Loader size={16} className="spinner" /> Uploading...</>
          ) : (
            <><Upload size={16} /> Upload Screenshot</>
          )}
        </button>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinner {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default ImageUploader;
