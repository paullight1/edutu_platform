import React, { useMemo, useState } from 'react';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import Select from '../../ui/Select';
import Label from '../../ui/Label';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import type { AdminOpportunity } from '../../../types/adminOpportunity';

const CATEGORY_OPTIONS = [
  'Scholarship',
  'Internship',
  'Fellowship',
  'Grant',
  'Competition',
  'Program',
  'Bootcamp',
  'Workshop',
  'Other'
];

const STATUS_OPTIONS: Array<{ label: string; value: AdminOpportunity['status'] }> = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Expired', value: 'expired' }
];

type OpportunityFormValues = Omit<AdminOpportunity, 'id' | 'createdAt' | 'updatedAt'>;

interface OpportunityFormProps {
  mode: 'create' | 'edit';
  initialData?: AdminOpportunity | null;
  onSubmit: (values: OpportunityFormValues) => Promise<void>;
  onClose: () => void;
}

const generateMockTags = () => ['STEM', 'Undergraduate', '2025'];

const toInputDate = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const OpportunityForm: React.FC<OpportunityFormProps> = ({ initialData, mode, onSubmit, onClose }) => {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [category, setCategory] = useState(initialData?.category ?? CATEGORY_OPTIONS[0]);
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [eligibility, setEligibility] = useState(initialData?.eligibility ?? '');
  const [link, setLink] = useState(initialData?.link ?? '');
  const [deadline, setDeadline] = useState(toInputDate(initialData?.deadline));
  const [tags, setTags] = useState((initialData?.tags ?? []).join(', '));
  const [status, setStatus] = useState<AdminOpportunity['status']>(initialData?.status ?? 'draft');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagsPreview = useMemo(
    () =>
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tags]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: OpportunityFormValues = {
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      eligibility: eligibility.trim(),
      link: link.trim(),
      deadline: deadline ? new Date(deadline).toISOString() : null,
      tags: tagsPreview,
      status
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save opportunity.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoTag = () => {
    const generated = generateMockTags();
    setTags(generated.join(', '));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="opportunity-title">Title</Label>
        <Input
          id="opportunity-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="AI Research Scholarship 2025"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="opportunity-category">Category</Label>
          <Select
            id="opportunity-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="opportunity-status">Status</Label>
          <Select
            id="opportunity-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminOpportunity['status'])}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="opportunity-link">Application link</Label>
          <Input
            id="opportunity-link"
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            required
          />
        </div>
        <div>
          <Label htmlFor="opportunity-deadline">Deadline</Label>
          <Input
            id="opportunity-deadline"
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="opportunity-description">Description</Label>
        <Textarea
          id="opportunity-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Provide the overview, benefits, and expectations for applicants."
          rows={5}
          required
        />
      </div>

      <div>
        <Label htmlFor="opportunity-eligibility">Eligibility</Label>
        <Textarea
          id="opportunity-eligibility"
          value={eligibility}
          onChange={(event) => setEligibility(event.target.value)}
          placeholder="Outline the criteria applicants must meet."
          rows={4}
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="opportunity-tags">Tags</Label>
          <Button type="button" variant="secondary" size="sm" onClick={handleAutoTag}>
            Auto Tag
          </Button>
        </div>
        <Input
          id="opportunity-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="STEM, Undergraduate, Remote"
        />
        {tagsPreview.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagsPreview.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : mode === 'create' ? 'Create opportunity' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};

export type { OpportunityFormValues };
export default OpportunityForm;
