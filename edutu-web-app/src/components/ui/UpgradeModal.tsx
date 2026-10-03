import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import PlanPicker from "../../features/feature-access/PlanPicker";
export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: string | null;
}
export default function UpgradeModal({
  open,
  onClose,
  reason,
}: UpgradeModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent ariaLabel="Edutu paid plans" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={20} className="text-brand" /> Prepare with Edutu
          </DialogTitle>
          <DialogDescription>
            {reason ||
              "Choose a plan for AI guidance and application preparation."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5">
          <PlanPicker active={open} compact />
          <Link
            to="/upgrade"
            onClick={onClose}
            className="mt-5 inline-block text-sm font-semibold text-brand"
          >
            Compare plans and learn more
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
