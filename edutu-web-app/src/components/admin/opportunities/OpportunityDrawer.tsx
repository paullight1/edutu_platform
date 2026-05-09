import React from 'react';
import { Calendar, ExternalLink, Pencil, Tag, Trash2 } from 'lucide-react';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '../../ui/Drawer';
import type { AdminOpportunity } from '../../../types/adminOpportunity';

interface OpportunityDrawerProps {
  open: boolean;
  opportunity: AdminOpportunity | null;
  onClose: () => void;
  onEdit: (opportunity: AdminOpportunity) => void;
  onDelete: (opportunity: AdminOpportunity) => void;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return 'No deadline';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const OpportunityDrawer: React.FC<OpportunityDrawerProps> = ({ open, opportunity, onClose, onEdit, onDelete }) => {
  if (!opportunity) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DrawerContent>
        <DrawerHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DrawerTitle>{opportunity.title}</DrawerTitle>
              <DrawerDescription>
                {opportunity.category}
                <span className="mx-2 text-gray-300">•</span>
                Status: {opportunity.status}
              </DrawerDescription>
            </div>
            <Badge variant={opportunity.status === 'published' ? 'success' : opportunity.status === 'expired' ? 'danger' : 'outline'}>
              {opportunity.status}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className="inline-flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              {formatDate(opportunity.deadline)}
            </span>
            {opportunity.tags.length > 0 && (
              <span className="inline-flex items-center gap-2">
                <Tag size={16} className="text-gray-400" />
                <span className="flex flex-wrap gap-1">
                  {opportunity.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      #{tag}
                    </Badge>
                  ))}
                </span>
              </span>
            )}
          </div>
        </DrawerHeader>

        <div className="space-y-6 text-sm text-gray-700">
          <section>
            <h3 className="text-sm font-semibold text-gray-900">Description</h3>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{opportunity.description}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Eligibility</h3>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{opportunity.eligibility}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Application link</h3>
            <a
              href={opportunity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink size={16} />
              Visit opportunity page
            </a>
          </section>
        </div>

        <DrawerFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onEdit(opportunity)}>
              <Pencil size={16} />
              Edit
            </Button>
            <Button
              variant="secondary"
              className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => onDelete(opportunity)}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default OpportunityDrawer;
