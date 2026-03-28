import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ClipboardList, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewOrderPicker({ open, onClose }: Props) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-4 w-[340px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium" style={{ color: "#1A1A1A" }}>What are you starting?</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100">
            <X size={16} style={{ color: "#717182" }} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Estimate card */}
          <button
            onClick={() => { onClose(); navigate("/orders/new?type=estimate"); }}
            className="text-left rounded-lg p-3 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#E1F5EE", border: "0.5px solid #5DCAA5" }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
              style={{ backgroundColor: "#5DCAA5" }}
            >
              <FileText size={20} className="text-white" />
            </div>
            <p className="text-[13px] font-medium" style={{ color: "#085041" }}>Customer Estimate</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#0F6E56" }}>Customer calling for a quote</p>
          </button>

          {/* Order card */}
          <button
            onClick={() => { onClose(); navigate("/orders/new?type=order"); }}
            className="text-left rounded-lg p-3 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#FAEEDA", border: "0.5px solid #EF9F27" }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
              style={{ backgroundColor: "#EF9F27" }}
            >
              <ClipboardList size={20} className="text-white" />
            </div>
            <p className="text-[13px] font-medium" style={{ color: "#633806" }}>Direct Order</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#854F0B" }}>Order from manufacturer for inventory</p>
          </button>
        </div>
      </div>
    </div>
  );
}
