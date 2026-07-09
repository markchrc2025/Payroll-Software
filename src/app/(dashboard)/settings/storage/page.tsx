"use client";

/**
 * /settings/storage — in-app object-storage browser.
 *
 * Lists the bucket one folder level at a time via /api/storage/browse
 * (server-side S3 calls — no bucket CORS involved), with per-file download
 * and delete. Exists because Sliplane Object Storage has no bucket browser
 * of its own. Tenant users only ever see their own tenant's subtree.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

type BrowseResponse = {
  basePrefix: string;
  prefix: string;
  folders: string[];
  files: { key: string; size: number; lastModified: string | null }[];
  truncated: boolean;
};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "svg"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Last path segment of a key or folder prefix. */
function segmentName(keyOrPrefix: string): string {
  const trimmed = keyOrPrefix.endsWith("/") ? keyOrPrefix.slice(0, -1) : keyOrPrefix;
  return trimmed.split("/").pop() ?? trimmed;
}

export default function StorageBrowserPage() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null); // null = root (API decides)
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (p: string | null) => {
    setIsLoading(true);
    setPendingDelete(null);
    try {
      const qs = p ? `?prefix=${encodeURIComponent(p)}` : "";
      const res = await fetch(`/api/storage/browse${qs}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Could not load storage");
      setData(json.data as BrowseResponse);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load storage");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(prefix); }, [prefix, load]);

  async function handleDelete(key: string) {
    setDeleting(key);
    try {
      const res = await fetch(`/api/storage/object?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Could not delete the file");
      toast.success("File deleted");
      load(prefix);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the file");
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  }

  // Breadcrumb segments relative to the tenant's base prefix.
  const base = data?.basePrefix ?? "";
  const rel = data ? data.prefix.slice(base.length) : "";
  const crumbs = rel.split("/").filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-[-0.6px] text-[#0E1B2E] leading-none">
            File Storage
          </h1>
          <p className="text-[14px] text-[#4A586B] mt-2">
            Browse the files this workspace has uploaded — photos, logos, documents, and payslips.
          </p>
        </div>
        <button
          onClick={() => load(prefix)}
          className="h-10 px-4 rounded-[10px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#F8F9FC] transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8E9AAC] flex-wrap">
        <button
          onClick={() => setPrefix(null)}
          className="flex items-center gap-1.5 text-[#E8693A] font-semibold hover:underline"
        >
          <HardDrive className="h-3.5 w-3.5" />
          Storage
        </button>
        {crumbs.map((seg, i) => {
          const target = base + crumbs.slice(0, i + 1).join("/") + "/";
          const isLast = i === crumbs.length - 1;
          return (
            <span key={target} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              {isLast ? (
                <span className="text-[#4A586B] font-medium">{seg}</span>
              ) : (
                <button
                  onClick={() => setPrefix(target)}
                  className="text-[#E8693A] font-semibold hover:underline"
                >
                  {seg}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Listing */}
      <div className="bg-white rounded-[14px] border border-[#E8EBF1] shadow-[0_1px_3px_rgba(14,27,46,0.06),0_4px_12px_rgba(14,27,46,0.04)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E8EBF1] text-left text-[12px] uppercase tracking-[0.4px] text-[#8E9AAC]">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold w-[110px]">Size</th>
              <th className="px-5 py-3 font-semibold w-[190px]">Last Modified</th>
              <th className="px-5 py-3 font-semibold w-[170px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[#8E9AAC]">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </td>
              </tr>
            ) : !data || (data.folders.length === 0 && data.files.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[#8E9AAC]">
                  This folder is empty.
                </td>
              </tr>
            ) : (
              <>
                {data.folders.map((f) => (
                  <tr
                    key={f}
                    className="border-b border-[#F1F3F7] last:border-0 hover:bg-[#F8F9FC] cursor-pointer transition-colors"
                    onClick={() => setPrefix(f)}
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-[#0E1B2E]">
                        <Folder className="h-4 w-4 text-[#E8693A]" />
                        {segmentName(f)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#8E9AAC]">—</td>
                    <td className="px-5 py-3 text-[#8E9AAC]">—</td>
                    <td className="px-5 py-3" />
                  </tr>
                ))}
                {data.files.map((file) => {
                  const name = segmentName(file.key);
                  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
                  const isImage = IMAGE_EXTS.includes(ext);
                  const confirming = pendingDelete === file.key;
                  return (
                    <tr key={file.key} className="border-b border-[#F1F3F7] last:border-0 hover:bg-[#F8F9FC] transition-colors">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5 text-[#0E1B2E]">
                          {isImage
                            ? <ImageIcon className="h-4 w-4 text-[#8E9AAC]" />
                            : <FileIcon className="h-4 w-4 text-[#8E9AAC]" />}
                          <span className="break-all">{name}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#4A586B] whitespace-nowrap">{formatBytes(file.size)}</td>
                      <td className="px-5 py-3 text-[#4A586B] whitespace-nowrap">{formatDate(file.lastModified)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/api/storage/object?key=${encodeURIComponent(file.key)}`}
                            className="h-8 px-3 rounded-[8px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[12px] font-semibold flex items-center gap-1.5 hover:bg-[#F8F9FC] transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                          {confirming ? (
                            <button
                              onClick={() => handleDelete(file.key)}
                              disabled={deleting === file.key}
                              className="h-8 px-3 rounded-[8px] border border-[#FACECA] bg-[#E0463B] text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-[#C93A30] disabled:opacity-60 transition-colors"
                            >
                              {deleting === file.key
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />}
                              Confirm
                            </button>
                          ) : (
                            <button
                              onClick={() => setPendingDelete(file.key)}
                              className="h-8 px-3 rounded-[8px] border border-[#FACECA] bg-[#FEF3F2] text-[#E0463B] text-[12px] font-semibold flex items-center gap-1.5 hover:bg-[#FCE9E7] transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
        {data?.truncated && (
          <div className="px-5 py-3 border-t border-[#E8EBF1] text-[12px] text-[#8E9AAC]">
            Showing the first 500 items — this folder has more.
          </div>
        )}
      </div>
    </div>
  );
}
