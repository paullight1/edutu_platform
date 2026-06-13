
import React, {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Download,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Zap
} from "lucide-react";
import { useAuth } from '@clerk/clerk-react';
import Button from "./ui/Button";
import Card from "./ui/Card";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  analyzeCvDocument,
  deleteCvDocument,
  generateCvDocument,
  getCvDownloadUrl,
  getCvDocument,
  listCvDocuments,
  optimizeCvDocument,
  uploadCvDocument,
  CvDocument
} from "../services/cvService.supabase";

type Section = "overview" | "library" | "upload" | "analysis" | "optimize" | "generate";

interface CVManagementProps {
  onBack: () => void;
}

interface UploadFormState {
  file: File | null;
  jobTarget: string;
  description: string;
  keywords: string;
}

interface AnalysisFormState {
  jobTarget: string;
  description: string;
  keywords: string;
}

interface OptimizeFormState {
  focusSummary: boolean;
  focusExperience: boolean;
  focusProjects: boolean;
  keywords: string;
}

interface GenerationFormState {
  fullName: string;
  targetRole: string;
  summary: string;
  skills: string;
  experience: string;
  education: string;
}

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

const SECTION_LABELS: Record<Section, string> = {
  overview: "Overview",
  library: "Library",
  upload: "Upload",
  analysis: "ATS",
  optimize: "Optimize",
  generate: "AI Builder"
};

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  file: null,
  jobTarget: "",
  description: "",
  keywords: ""
};

const DEFAULT_ANALYSIS_FORM: AnalysisFormState = {
  jobTarget: "",
  description: "",
  keywords: ""
};

const DEFAULT_OPTIMIZE_FORM: OptimizeFormState = {
  focusSummary: true,
  focusExperience: true,
  focusProjects: false,
  keywords: ""
};

const DEFAULT_GENERATE_FORM: GenerationFormState = {
  fullName: "",
  targetRole: "",
  summary: "",
  skills: "",
  experience: "",
  education: ""
};

const formatDate = (value?: string) => {
  if (!value) {
    return "Unknown";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const formatSize = (value: number) => {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
};

const getScoreColor = (score: number) => {
  if (score >= 90) {
    return "text-green-600 dark:text-green-400";
  }
  if (score >= 75) {
    return "text-yellow-600 dark:text-yellow-400";
  }
  return "text-red-500 dark:text-red-400";
};

const getScoreLabel = (score: number) => {
  if (score >= 90) {
    return "Excellent";
  }
  if (score >= 75) {
    return "Strong";
  }
  if (score >= 60) {
    return "Needs work";
  }
  return "Rebuild";
};

const CVManagement: React.FC<CVManagementProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const { userId } = useAuth();
  const [section, setSection] = useState<Section>("overview");
  const [records, setRecords] = useState<CvDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const [uploadForm, setUploadForm] = useState<UploadFormState>(DEFAULT_UPLOAD_FORM);
  const [analysisForm, setAnalysisForm] = useState<AnalysisFormState>(DEFAULT_ANALYSIS_FORM);
  const [optimizeForm, setOptimizeForm] = useState<OptimizeFormState>(DEFAULT_OPTIMIZE_FORM);
  const [generateForm, setGenerateForm] = useState<GenerationFormState>(DEFAULT_GENERATE_FORM);
  const [latestDraft, setLatestDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === selectedId) ?? null,
    [records, selectedId]
  );

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      if (!userId) return;
      const docs = await listCvDocuments(userId);
      setRecords(docs);
      if (docs.length > 0) {
        setSelectedId((prev) => prev ?? docs[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: "Unable to load stored CVs." });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!selectedRecord) {
      setAnalysisForm(DEFAULT_ANALYSIS_FORM);
      return;
    }
    setAnalysisForm({
      jobTarget: selectedRecord.jobTarget ?? "",
      description: selectedRecord.jobDescription ?? "",
      keywords: ""
    });
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const setMessage = (message: FeedbackState) => {
    setFeedback(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadForm((prev) => ({ ...prev, file }));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    setUploadForm((prev) => ({ ...prev, file }));
  };

  const handleUpload = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!uploadForm.file) {
      setMessage({ type: "error", message: "Select or drop a CV file first." });
      return;
    }
    setBusyAction("upload");
    try {
      if (!userId) throw new Error("Not authenticated");
      const record = await uploadCvDocument(userId, {
        file: uploadForm.file,
        jobTarget: uploadForm.jobTarget || undefined,
        jobDescription: uploadForm.description || undefined,
        customKeywords: uploadForm.keywords
          ? uploadForm.keywords.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined
      });
      setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
      setSelectedId(record.id);
      setSection("analysis");
      setUploadForm(DEFAULT_UPLOAD_FORM);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMessage({ type: "success", message: "CV uploaded." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", message: "Upload failed. Try again." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAnalysis = async () => {
    if (!selectedRecord) {
      return;
    }
    setBusyAction("analysis");
    try {
      if (!userId) throw new Error("Not authenticated");
      await analyzeCvDocument(userId, {
        cvId: selectedRecord.id,
        jobTarget: analysisForm.jobTarget || undefined,
        jobDescription: analysisForm.description || undefined,
        customKeywords: analysisForm.keywords
          ? analysisForm.keywords.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined
      });
      const updated = await getCvDocument(userId, selectedRecord.id);
      if (updated) {
        setRecords((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
        setSelectedId(updated.id);
      }
      setMessage({ type: "success", message: "ATS analysis ready." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", message: "Could not complete analysis." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleOptimize = async () => {
    if (!selectedRecord) {
      return;
    }
    setBusyAction("optimize");
    try {
      if (!userId) throw new Error("Not authenticated");
      const emphasizeSections = [
        optimizeForm.focusSummary ? "Summary" : null,
        optimizeForm.focusExperience ? "Experience" : null,
        optimizeForm.focusProjects ? "Projects" : null
      ].filter(Boolean) as string[];

      await optimizeCvDocument(userId, {
        cvId: selectedRecord.id,
        emphasizeSections,
        customKeywords: optimizeForm.keywords
          ? optimizeForm.keywords.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined
      });
      const updated = await getCvDocument(userId, selectedRecord.id);
      if (updated) {
        setRecords((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
        setSelectedId(updated.id);
      }
      setMessage({ type: "success", message: "Optimization brief generated." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", message: "Optimization failed. Try again." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this CV from the workspace?")) {
      return;
    }
    setBusyAction(`delete-${id}`);
    try {
      if (!userId) throw new Error("Not authenticated");
      await deleteCvDocument(userId, id);
      setRecords((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) {
        const next = records.find((item) => item.id !== id) ?? null;
        setSelectedId(next?.id ?? null);
      }
      setMessage({ type: "success", message: "CV removed." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", message: "Unable to delete right now." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = async (record: CvDocument) => {
    try {
      if (!userId) throw new Error("Not authenticated");
      const href = await getCvDownloadUrl(userId, record.id);
      if (!href) {
        throw new Error("Missing download URL");
      }

      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.rel = "noopener";
      anchor.download = record.fileName || `${record.title}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      if (href.startsWith("blob:")) {
        setTimeout(() => URL.revokeObjectURL(href), 3000);
      }

      setMessage({ type: "success", message: "Download started." });
    } catch (error) {
      console.error("Unable to generate CV download URL.", error);
      setMessage({ type: "error", message: "Unable to start download. Please try again in a moment." });
    }
  };

  const handleGenerate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!generateForm.fullName || !generateForm.targetRole || !generateForm.summary) {
      setMessage({ type: "error", message: "Full name, target role, and summary are required." });
      return;
    }
    setBusyAction("generate");
    try {
      if (!userId) throw new Error("Not authenticated");
      const { record, draft } = await generateCvDocument(userId, {
        fullName: generateForm.fullName.trim(),
        targetRole: generateForm.targetRole.trim(),
        summary: generateForm.summary.trim(),
        skills: generateForm.skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        experience: generateForm.experience
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({
            role: line,
            company: "",
            duration: "",
            achievements: []
          })),
        education: generateForm.education
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({
            credential: line,
            school: "",
            year: ""
          }))
      });
      setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
      setSelectedId(record.id);
      setSection("analysis");
      setLatestDraft(draft);
      setMessage({ type: "success", message: "AI draft added to your library." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", message: "Generation failed. Adjust inputs and retry." });
    } finally {
      setBusyAction(null);
    }
  };
  const renderFeedback = () => {
    if (!feedback) {
      return null;
    }
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${
          feedback.type === "success"
            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/10 dark:text-green-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300"
        }`}
      >
        {feedback.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
        <span className="font-medium">{feedback.message}</span>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <Card className="dark:bg-gray-800 dark:border-gray-700 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70">
          <FileText size={32} className="text-white" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">CV Management Hub</h2>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Upload files, inspect ATS readiness, generate AI drafts, and store everything in one workspace.
        </p>
      </Card>

      {/* Stats Cards - Horizontal on mobile */}
      <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory">
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center min-w-[140px] snap-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Documents</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{records.length}</div>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center min-w-[140px] snap-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Analyzed</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {records.filter((item) => item.analysis).length}
          </div>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center min-w-[140px] snap-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">Optimized</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {records.filter((item) => item.optimization).length}
          </div>
        </Card>
      </div>

      {/* Feature Widgets */}
      <div className="grid grid-cols-2 gap-4">
        <Card 
          className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setSection('analysis')}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <BarChart3 size={20} />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">ATS</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Analyze CVs for ATS readiness</p>
        </Card>

        <Card 
          className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setSection('library')}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Folder size={20} />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">Library</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Manage your CV collection</p>
        </Card>

        <Card 
          className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setSection('upload')}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <Upload size={20} />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">Upload</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add new CV documents</p>
        </Card>

        <Card 
          className="dark:bg-gray-800 dark:border-gray-700 p-5 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setSection('optimize')}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Zap size={20} />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">Optimize</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Improve your CV content</p>
        </Card>
      </div>
    </div>
  );
  const renderLibrary = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">CV Library</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSection("upload")}>
            <Upload size={16} className="mr-2" />
            Upload
          </Button>
          <Button variant="secondary" onClick={() => setSection("generate")}>
            <Sparkles size={16} className="mr-2" />
            AI Builder
          </Button>
          <Button variant="secondary" onClick={loadLibrary} disabled={loadingLibrary}>
            {loadingLibrary ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {loadingLibrary ? (
        <Card className="dark:bg-gray-800 dark:border-gray-700 flex items-center justify-center gap-3 p-6 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          Loading library...
        </Card>
      ) : records.length === 0 ? (
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-8 text-center text-sm text-gray-600 dark:text-gray-400">
          No CVs yet. Upload a file or generate one with AI.
        </Card>
      ) : (
        records.map((record) => (
          <Card
            key={record.id}
            className={`dark:bg-gray-800 dark:border-gray-700 transition-colors ${selectedId === record.id ? "border-primary" : ""}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setSelectedId(record.id)}
                >
                  <h4 className="text-md font-semibold text-gray-900 dark:text-white">{record.title}</h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Uploaded {formatDate(record.uploadedAt)} - {formatSize(record.fileSize)}
                  </p>
                </button>
                <p className="mt-3 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
                  {record.textContent || "No extracted text available."}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 md:w-48">
                <Button variant="secondary" onClick={() => { setSelectedId(record.id); setSection("analysis"); }}>
                  <BarChart3 size={16} className="mr-2" />
                  ATS
                </Button>
                <Button variant="secondary" onClick={() => handleDownload(record)}>
                  <Download size={16} className="mr-2" />
                  Download
                </Button>
                <Button variant="secondary" onClick={() => { setSelectedId(record.id); setSection("optimize"); }}>
                  <Zap size={16} className="mr-2" />
                  Optimize
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDelete(record.id)}
                  disabled={busyAction === `delete-${record.id}`}
                  className="text-red-500 hover:text-red-400"
                >
                  {busyAction === `delete-${record.id}` ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Trash2 size={16} className="mr-2" />}
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
  const renderUpload = () => (
    <form className="space-y-6" onSubmit={handleUpload}>
      <Card className="dark:bg-gray-800 dark:border-gray-700 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload CV</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drop a PDF, DOC, DOCX, or TXT file. We will extract the text and prep it for ATS checks.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setSection("library")} type="button">
            <Folder size={16} className="mr-2" />
            Library
          </Button>
        </div>
      </Card>

      <Card className="dark:bg-gray-800 dark:border-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
        <label
          htmlFor="cv-file-input"
          className="flex cursor-pointer flex-col items-center gap-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
            <Upload size={28} className="text-gray-600 dark:text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Click to browse or drop a file</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">5 MB max</p>
        </label>
        <input
          id="cv-file-input"
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileChange}
        />
        {uploadForm.file && (
          <div className="mt-4 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            Selected: {uploadForm.file.name} ({formatSize(uploadForm.file.size)})
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="dark:bg-gray-800 dark:border-gray-700 space-y-3 p-5">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Target role</label>
            <input
              type="text"
              value={uploadForm.jobTarget}
              onChange={(event) => setUploadForm((prev) => ({ ...prev, jobTarget: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Job description snippet</label>
            <textarea
              value={uploadForm.description}
              onChange={(event) => setUploadForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Custom keywords</label>
            <input
              type="text"
              value={uploadForm.keywords}
              onChange={(event) => setUploadForm((prev) => ({ ...prev, keywords: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              placeholder="Comma separated"
            />
          </div>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-5 flex flex-col justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>We parse the document, compute stats, and prepare ATS analysis automatically.</p>
            <p className="mt-2">All files stay local to this device.</p>
          </div>
          <Button type="submit" className="mt-6" disabled={busyAction === "upload"}>
            {busyAction === "upload" ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
            Upload and analyze
          </Button>
        </Card>
      </div>
    </form>
  );
  const renderAnalysis = () => {
    if (!selectedRecord) {
      return (
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-8 text-center text-sm text-gray-600 dark:text-gray-400">
          Pick a CV from the library to view its ATS analysis.
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedRecord.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Update role context and rerun the ATS scoring engine.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => handleDownload(selectedRecord)}>
                <Download size={16} className="mr-2" />
                Download
              </Button>
              <Button variant="secondary" onClick={() => setSection("optimize")}>
                <Zap size={16} className="mr-2" />
                Optimize
              </Button>
            </div>
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700 p-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleAnalysis();
            }}
          >
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Target role</label>
              <input
                type="text"
                value={analysisForm.jobTarget}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, jobTarget: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Job description snippet</label>
              <textarea
                value={analysisForm.description}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Custom keywords</label>
              <input
                type="text"
                value={analysisForm.keywords}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, keywords: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Comma separated"
              />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={busyAction === "analysis"}>
                {busyAction === "analysis" ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <BarChart3 size={16} className="mr-2" />
                )}
                Run ATS analysis
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setAnalysisForm({
                    jobTarget: selectedRecord.jobTarget ?? "",
                    description: selectedRecord.jobDescription ?? "",
                    keywords: ""
                  })
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </Card>

        <Card className="dark:bg-gray-800 dark;border-gray-700 p-6">
          {selectedRecord.analysis ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="text-center">
                <div className={`text-4xl font-semibold ${getScoreColor(selectedRecord.analysis.score)}`}>
                  {selectedRecord.analysis.score}
                </div>
                <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  {getScoreLabel(selectedRecord.analysis.score)}
                </div>
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Last run {formatDate(selectedRecord.analysis.evaluatedAt)}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Highlights</h4>
                <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li>
                    <span className="font-medium">Missing keywords:</span>{" "}
                    {selectedRecord.analysis.missingKeywords.slice(0, 8).join(", ") || "None"}
                  </li>
                  <li>
                    <span className="font-medium">Readability:</span> {selectedRecord.analysis.readability}
                  </li>
                  <li>
                    <span className="font-medium">Actions:</span>
                    <ul className="mt-1 space-y-1">
                      {selectedRecord.analysis.recommendedActions.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Run the analysis to produce a score and tailored recommendations.
            </p>
          )}
        </Card>

        <Card className="dark:bg-gray-800 dark;border-gray-700 p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Preview</h4>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-900/5 p-4 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
            {selectedRecord.textContent || "No text extracted from this document."}
          </pre>
        </Card>
      </div>
    );
  };
  const renderOptimize = () => {
    if (!selectedRecord) {
      return (
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-8 text-center text-sm text-gray-600 dark:text-gray-400">
          Select a CV from the library to generate optimization guidance.
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Optimization assistant</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose the sections to emphasize and we will draft improvements that can increase the ATS score.
          </p>
        </Card>

        <Card className="dark:bg-gray-800 dark;border-gray-700 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={optimizeForm.focusSummary}
                  onChange={(event) => setOptimizeForm((prev) => ({ ...prev, focusSummary: event.target.checked }))}
                />
                Summary
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={optimizeForm.focusExperience}
                  onChange={(event) => setOptimizeForm((prev) => ({ ...prev, focusExperience: event.target.checked }))}
                />
                Experience
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={optimizeForm.focusProjects}
                  onChange={(event) => setOptimizeForm((prev) => ({ ...prev, focusProjects: event.target.checked }))}
                />
                Projects
              </label>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Extra keywords</label>
              <input
                type="text"
                value={optimizeForm.keywords}
                onChange={(event) => setOptimizeForm((prev) => ({ ...prev, keywords: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleOptimize} disabled={busyAction === "optimize"}>
              {busyAction === "optimize" ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Sparkles size={16} className="mr-2" />
              )}
              Generate brief
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOptimizeForm(DEFAULT_OPTIMIZE_FORM)}
            >
              Reset
            </Button>
          </div>
        </Card>

        {selectedRecord.optimization ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="dark:bg-gray-800 dark;border-gray-700 p-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Summary suggestions</h4>
              <ul className="space-y-1">
                {selectedRecord.optimization.summarySuggestions.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="dark:bg-gray-800 dark;border-gray-700 p-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Bullet coaching</h4>
              <ul className="space-y-1">
                {selectedRecord.optimization.bulletSuggestions.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div>
                <div className="mt-2 font-semibold text-gray-900 dark:text-white">Keyword opportunities</div>
                <ul className="mt-1 space-y-1">
                  {selectedRecord.optimization.keywordRecommendations.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {selectedRecord.optimization.raisedScore && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-300">
                  <TrendingUp size={14} />
                  Target score {selectedRecord.optimization.raisedScore}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <Card className="dark:bg-gray-800 dark;border-gray-700 p-8 text-center text-sm text-gray-600 dark:text-gray-400">
            Run the assistant to see AI tips here.
          </Card>
        )}
      </div>
    );
  };
  const renderGenerate = () => (
    <form className="space-y-6" onSubmit={handleGenerate}>
      <Card className="dark:bg-gray-800 dark:border-gray-700 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI CV builder</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Provide key details and we will create a first draft saved in your library.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setSection("library")} type="button">
            <Folder size={16} className="mr-2" />
            Library
          </Button>
        </div>
      </Card>

      <Card className="dark:bg-gray-800 dark;border-gray-700 space-y-3 p-6">
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Full name</label>
          <input
            type="text"
            value={generateForm.fullName}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, fullName: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Target role</label>
          <input
            type="text"
            value={generateForm.targetRole}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, targetRole: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Summary</label>
          <textarea
            value={generateForm.summary}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, summary: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Skills (comma separated)</label>
          <input
            type="text"
            value={generateForm.skills}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, skills: event.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Experience (one line per role)</label>
          <textarea
            value={generateForm.experience}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, experience: event.target.value }))}
            rows={4}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            placeholder="Use short role descriptions. Detailed editing happens after generation."
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Education (one line per entry)</label>
          <textarea
            value={generateForm.education}
            onChange={(event) => setGenerateForm((prev) => ({ ...prev, education: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busyAction === "generate"}>
            {busyAction === "generate" ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Sparkles size={16} className="mr-2" />
            )}
            Create draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setGenerateForm(DEFAULT_GENERATE_FORM);
              setLatestDraft(null);
            }}
          >
            Reset form
          </Button>
        </div>
      </Card>

      {latestDraft && (
        <Card className="dark:bg-gray-800 dark;border-gray-700 p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Latest AI draft</h4>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-900/5 p-4 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
            {latestDraft}
          </pre>
        </Card>
      )}
    </form>
  );
  const renderContent = () => {
    switch (section) {
      case "overview":
        return renderOverview();
      case "library":
        return renderLibrary();
      case "upload":
        return renderUpload();
      case "analysis":
        return renderAnalysis();
      case "optimize":
        return renderOptimize();
      case "generate":
        return renderGenerate();
      default:
        return renderOverview();
    }
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? "dark" : ""}`}>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={onBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">CV Management</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Make every CV actionable with upload, ATS, optimization, and AI generation tools.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SECTION_LABELS) as Section[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSection(value)}
                className={`rounded-xl px-3 py-2 text-xs font-medium ${
                  section === value
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {SECTION_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {renderFeedback()}
        {renderContent()}
      </main>
    </div>
  );
};

export default CVManagement;
