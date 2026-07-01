import { useRef, useState } from "react";

interface FilePickerProps {
  accept?: string;
  fileName?: string;
  detail?: string;
  onFile: (file: File, text: string) => void;
}

export function FilePicker({ accept = ".fasta,.fa,.fas,.aln", fileName, detail, onFile }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readFile = async (file?: File) => {
    if (!file) return;
    onFile(file, await file.text());
  };

  return (
    <div
      className={`file-picker ${isDragging ? "dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void readFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => void readFile(event.target.files?.[0])}
      />
      <div>
        <strong>{fileName || "拖入 FASTA 文件"}</strong>
        <span>{detail || "支持 .fasta、.fa、.fas、.aln"}</span>
      </div>
      <button type="button" className="compact-action" onClick={() => inputRef.current?.click()}>
        选择文件
      </button>
    </div>
  );
}
