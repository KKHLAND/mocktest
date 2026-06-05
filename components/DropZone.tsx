import React, { useState, useRef, useMemo, useEffect } from 'react';

interface DropZoneProps {
  onFileDrop: (file: File) => void;
  file: File | null;
  title: string;
  disabled?: boolean;
  accept?: string;
}

const DropZone: React.FC<DropZoneProps> = ({ onFileDrop, file, title, disabled = false, accept }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFileDrop(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileDrop(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const fileURL = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (fileURL) {
        URL.revokeObjectURL(fileURL);
      }
    };
  }, [fileURL]);

  return (
    <div className="upload-section">
      <h3>{title}</h3>
      <div
        className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleFileChange} 
          accept={accept || ".pdf,image/*"} 
          style={{ display: 'none' }} 
          disabled={disabled} 
        />
        <p>
          {file ? (
            <span className="file-name-display">{file.name} <br/><small>(클릭하여 변경)</small></span>
          ) : (
            <>
              <span className="browse-link">파일을 선택</span>하거나 여기에 드래그하세요.
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default DropZone;