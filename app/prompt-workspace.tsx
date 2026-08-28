'use client';

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  characterCount: number;
};

type Project = Omit<ProjectSummary, 'characterCount'> & { content: string };

type PromptComment = {
  id: string;
  projectId: string;
  kind: 'selection' | 'general';
  quote: string | null;
  comment: string;
  startOffset: number | null;
  endOffset: number | null;
  createdAt: string;
};

type PromptVersion = {
  id: string;
  projectId: string;
  tag: string;
  content: string;
  createdAt: string;
};

type SelectionRange = { start: number; end: number; quote: string };

type Suggestion = {
  id: string;
  title: string;
  original: string;
  replacement: string;
  reason: string;
  commentIds: string[];
  status: 'pending' | 'accepted';
};

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const iconChoices = ['✦', 'Aa', '⌘', '◌', '↗'];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试');
  return data as T;
}

function dateLabel(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function summaryFromProject(project: Project): ProjectSummary {
  return { ...project, characterCount: project.content.length };
}

export function PromptWorkspace() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [view, setView] = useState<'library' | 'editor'>('library');
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [content, setContent] = useState('');
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [mode, setMode] = useState<'edit' | 'annotate'>('edit');
  const [sideTab, setSideTab] = useState<'comments' | 'suggestions'>('comments');
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [selectionComment, setSelectionComment] = useState('');
  const [generalComment, setGeneralComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reviewSummary, setReviewSummary] = useState('');
  const [reviewModel, setReviewModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [activeVersion, setActiveVersion] = useState<PromptVersion | null>(null);
  const [createName, setCreateName] = useState('prompt-1');
  const [createDescription, setCreateDescription] = useState('');
  const [createIcon, setCreateIcon] = useState(iconChoices[0]);
  const [tagName, setTagName] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [toast, setToast] = useState('');

  const annotationRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef('');
  const projectIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef('');
  const saveInFlightRef = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 2800);
  }, []);

  useEffect(() => {
    let alive = true;
    requestJson<{ projects: ProjectSummary[] }>('/api/projects')
      .then((data) => {
        if (alive) setProjects(data.projects);
      })
      .catch((error: Error) => {
        if (alive) notify(error.message);
      })
      .finally(() => {
        if (alive) setLibraryLoading(false);
      });
    return () => { alive = false; };
  }, [notify]);

  const persist = useCallback(async (force = false) => {
    const id = projectIdRef.current;
    const snapshot = contentRef.current;
    if (!id || saveInFlightRef.current || (!force && snapshot === lastSavedRef.current)) return true;
    if (snapshot === lastSavedRef.current) {
      setSaveState('saved');
      return true;
    }
    saveInFlightRef.current = true;
    setSaveState('saving');
    try {
      const data = await requestJson<{ project: Project }>(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: snapshot }),
      });
      lastSavedRef.current = snapshot;
      const time = new Date();
      setSavedAt(time);
      setProject((current) => current ? { ...current, updatedAt: data.project.updatedAt } : current);
      setProjects((current) => current.map((item) => item.id === id
        ? { ...item, characterCount: snapshot.length, updatedAt: data.project.updatedAt }
        : item));
      setSaveState(contentRef.current === snapshot ? 'saved' : 'dirty');
      return true;
    } catch (error) {
      setSaveState('error');
      notify(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      saveInFlightRef.current = false;
    }
  }, [notify]);

  useEffect(() => {
    if (view !== 'editor') return;
    const interval = window.setInterval(() => { void persist(); }, 5_000);
    return () => window.clearInterval(interval);
  }, [persist, view]);

  useEffect(() => {
    if (view !== 'editor') return;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist(true).then((saved) => saved && notify('已立即保存'));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notify, persist, view]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (contentRef.current !== lastSavedRef.current) event.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  function openCreateModal() {
    setCreateName(`prompt-${projects.length + 1}`);
    setCreateDescription('');
    setCreateIcon(iconChoices[0]);
    setShowCreate(true);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalSaving(true);
    try {
      const data = await requestJson<{ project: Project }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim(),
          icon: createIcon,
        }),
      });
      setProjects((current) => [summaryFromProject(data.project), ...current]);
      setShowCreate(false);
      enterProject({ project: data.project, comments: [], versions: [] });
    } catch (error) {
      notify(error instanceof Error ? error.message : '项目创建失败');
    } finally {
      setModalSaving(false);
    }
  }

  function enterProject(bundle: { project: Project; comments: PromptComment[]; versions: PromptVersion[] }) {
    setProject(bundle.project);
    setContent(bundle.project.content);
    contentRef.current = bundle.project.content;
    lastSavedRef.current = bundle.project.content;
    projectIdRef.current = bundle.project.id;
    setComments(bundle.comments);
    setVersions(bundle.versions);
    setMode('edit');
    setSideTab('comments');
    setSelection(null);
    setSuggestions([]);
    setReviewSummary('');
    setSaveState('saved');
    setSavedAt(null);
    setView('editor');
  }

  async function openProject(id: string) {
    setProjectLoading(true);
    try {
      const bundle = await requestJson<{
        project: Project;
        comments: PromptComment[];
        versions: PromptVersion[];
      }>(`/api/projects/${id}`);
      enterProject(bundle);
    } catch (error) {
      notify(error instanceof Error ? error.message : '项目读取失败');
    } finally {
      setProjectLoading(false);
    }
  }

  async function backToLibrary() {
    await persist(true);
    setView('library');
    setProject(null);
    projectIdRef.current = null;
  }

  function updateContent(next: string) {
    setContent(next);
    contentRef.current = next;
    setSaveState(next === lastSavedRef.current ? 'saved' : 'dirty');
    setSelection(null);
  }

  function captureSelection() {
    const container = annotationRef.current;
    const selected = window.getSelection();
    if (!container || !selected || selected.rangeCount === 0 || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const rawQuote = range.toString();
    const quote = rawQuote.trim();
    if (!quote) return;
    const before = range.cloneRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const leadingSpace = rawQuote.length - rawQuote.trimStart().length;
    const start = before.toString().length + leadingSpace;
    setSelection({ start, end: start + quote.length, quote });
    setSelectionComment('');
    setSideTab('comments');
  }

  async function addComment(kind: 'selection' | 'general') {
    if (!project) return;
    const text = kind === 'selection' ? selectionComment.trim() : generalComment.trim();
    if (!text || (kind === 'selection' && !selection)) return;
    setCommentSaving(true);
    await persist(true);
    try {
      const data = await requestJson<{ comment: PromptComment }>(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          comment: text,
          quote: kind === 'selection' ? selection?.quote : null,
          startOffset: kind === 'selection' ? selection?.start : null,
          endOffset: kind === 'selection' ? selection?.end : null,
        }),
      });
      setComments((current) => [data.comment, ...current]);
      if (kind === 'selection') {
        setSelection(null);
        setSelectionComment('');
        window.getSelection()?.removeAllRanges();
      } else {
        setGeneralComment('');
      }
      notify('批注已添加');
    } catch (error) {
      notify(error instanceof Error ? error.message : '批注保存失败');
    } finally {
      setCommentSaving(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!project) return;
    try {
      await fetch(`/api/projects/${project.id}/comments/${commentId}`, { method: 'DELETE' }).then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || '删除失败');
        }
      });
      setComments((current) => current.filter((item) => item.id !== commentId));
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function analyzePrompt() {
    if (!project || !content.trim()) {
      notify('请先写下 Prompt');
      return;
    }
    setAnalyzing(true);
    await persist(true);
    try {
      const data = await requestJson<{
        summary: string;
        suggestions: Omit<Suggestion, 'status'>[];
        model: string;
      }>('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: contentRef.current, comments }),
      });
      setReviewSummary(data.summary);
      setReviewModel(data.model);
      setSuggestions(data.suggestions.map((item) => ({ ...item, status: 'pending' })));
      setSideTab('suggestions');
      notify(data.suggestions.length ? `AI 给出了 ${data.suggestions.length} 条建议` : 'AI 认为当前无需局部修改');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  }

  function acceptSuggestion(suggestion: Suggestion) {
    const current = contentRef.current;
    const index = current.indexOf(suggestion.original);
    if (index < 0) {
      notify('原文已发生变化，这条建议无法自动定位');
      return;
    }
    updateContent(current.slice(0, index) + suggestion.replacement + current.slice(index + suggestion.original.length));
    setSuggestions((items) => items.map((item) => item.id === suggestion.id ? { ...item, status: 'accepted' } : item));
    notify('已采纳，5 秒内自动保存');
  }

  function acceptAllSuggestions() {
    const pending = suggestions
      .filter((item) => item.status === 'pending')
      .map((item) => ({ item, index: contentRef.current.indexOf(item.original) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => b.index - a.index);
    let next = contentRef.current;
    let rightBoundary = Number.POSITIVE_INFINITY;
    const accepted = new Set<string>();
    for (const entry of pending) {
      if (entry.index + entry.item.original.length > rightBoundary) continue;
      next = next.slice(0, entry.index) + entry.item.replacement + next.slice(entry.index + entry.item.original.length);
      rightBoundary = entry.index;
      accepted.add(entry.item.id);
    }
    if (!accepted.size) {
      notify('没有可自动定位的待采纳建议');
      return;
    }
    updateContent(next);
    setSuggestions((items) => items.map((item) => accepted.has(item.id) ? { ...item, status: 'accepted' } : item));
    notify(`已采纳 ${accepted.size} 条建议`);
  }

  function openTagModal() {
    setTagName(`v${versions.length + 1}`);
    setShowTag(true);
  }

  async function recordVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !tagName.trim()) return;
    setModalSaving(true);
    await persist(true);
    try {
      const data = await requestJson<{ version: PromptVersion }>(`/api/projects/${project.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tagName.trim(), content: contentRef.current }),
      });
      setVersions((current) => [data.version, ...current]);
      setShowTag(false);
      notify(`已记录版本 ${data.version.tag}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '版本记录失败');
    } finally {
      setModalSaving(false);
    }
  }

  function openVersionHistory() {
    setActiveVersion(versions[0] || null);
    setShowVersions(true);
  }

  async function duplicateVersion(version: PromptVersion) {
    if (!project) return;
    setModalSaving(true);
    try {
      const data = await requestJson<{ project: Project }>(`/api/projects/${project.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });
      setProjects((current) => [summaryFromProject(data.project), ...current]);
      setShowVersions(false);
      enterProject({ project: data.project, comments: [], versions: [] });
      notify('已从历史版本创建副本');
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建副本失败');
    } finally {
      setModalSaving(false);
    }
  }

  const annotatedContent = useMemo<ReactNode[]>(() => {
    if (!content) return [];
    const valid = comments.filter((item) =>
      item.kind === 'selection' &&
      item.quote &&
      item.startOffset !== null &&
      item.endOffset !== null &&
      content.slice(item.startOffset, item.endOffset) === item.quote,
    );
    const boundaries = new Set<number>([0, content.length]);
    valid.forEach((item) => {
      boundaries.add(item.startOffset as number);
      boundaries.add(item.endOffset as number);
    });
    const points = [...boundaries].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      const active = valid.filter((item) => (item.startOffset as number) <= start && (item.endOffset as number) >= end);
      const text = content.slice(start, end);
      return active.length
        ? <mark className="annotation-mark" key={`${start}-${end}`} title={active.map((item) => item.comment).join('\n')}>{text}</mark>
        : <span key={`${start}-${end}`}>{text}</span>;
    });
  }, [comments, content]);

  const pendingSuggestionCount = suggestions.filter((item) => item.status === 'pending').length;

  if (view === 'editor' && project) {
    return (
      <main className="editor-shell">
        <header className="editor-topbar">
          <button className="back-button" type="button" onClick={() => void backToLibrary()} aria-label="返回项目列表">
            ←
          </button>
          <div className="editor-identity">
            <span className="mini-project-icon">{project.icon}</span>
            <span>
              <strong>{project.name}</strong>
              <small>{project.description || 'Prompt 项目'}</small>
            </span>
          </div>
          <div className="editor-actions">
            <button className="todo-button" type="button" disabled title="TODO：直接试运行 Prompt 效果">
              ▷ 试运行 <em>TODO</em>
            </button>
            <button className="toolbar-button" type="button" onClick={openVersionHistory}>
              历史版本 <span>{versions.length}</span>
            </button>
            <button className="primary-button compact" type="button" onClick={openTagModal}>
              ＋ 记录版本
            </button>
          </div>
        </header>

        <section className="editor-stage">
          <article className="document-panel">
            <div className="document-toolbar">
              <div className="mode-switch" aria-label="编辑模式">
                <button className={mode === 'edit' ? 'active' : ''} type="button" onClick={() => setMode('edit')}>
                  <span aria-hidden="true">I</span> 编辑
                </button>
                <button className={mode === 'annotate' ? 'active' : ''} type="button" onClick={() => setMode('annotate')}>
                  <span aria-hidden="true">／</span> 划线批注
                </button>
              </div>
              <div className={`save-indicator ${saveState}`}>
                <i />
                {saveState === 'saving' && '正在保存…'}
                {saveState === 'dirty' && '内存中 · 等待差异保存'}
                {saveState === 'error' && '保存失败'}
                {saveState === 'saved' && (savedAt ? `${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 已保存` : '已保存')}
              </div>
            </div>

            <div className={`document-surface ${mode}`}>
              <div className="document-meta">
                <span>工作副本</span>
                <span>{content.length.toLocaleString('zh-CN')} 字符</span>
              </div>
              {mode === 'edit' ? (
                <textarea
                  className="prompt-editor"
                  value={content}
                  onChange={(event) => updateContent(event.target.value)}
                  placeholder={'在这里写下或粘贴 Prompt…\n\n内容会先实时更新在内存中，每 5 秒检测差异并保存。'}
                  aria-label="Prompt 编辑区"
                  spellCheck={false}
                />
              ) : (
                <div className="annotation-wrap">
                  {!content && <div className="annotation-empty">当前没有可批注的内容，请先切换到编辑模式。</div>}
                  <div
                    className="annotation-document"
                    ref={annotationRef}
                    onMouseUp={captureSelection}
                    onKeyUp={captureSelection}
                    tabIndex={0}
                    aria-label="Prompt 划线批注区"
                  >
                    {annotatedContent}
                  </div>
                  {selection && (
                    <div className="selection-hint" role="status">
                      已选择 {selection.quote.length} 字 · 在右侧写下批注
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="document-footer">
              <span>5 秒差异保存</span>
              <span>⌘ / Ctrl + S 立即保存</span>
            </footer>
          </article>

          <aside className="review-panel">
            <div className="review-tabs">
              <button className={sideTab === 'comments' ? 'active' : ''} type="button" onClick={() => setSideTab('comments')}>
                批注 <span>{comments.length}</span>
              </button>
              <button className={sideTab === 'suggestions' ? 'active' : ''} type="button" onClick={() => setSideTab('suggestions')}>
                AI 建议 <span>{suggestions.length}</span>
              </button>
            </div>

            <div className="review-scroll">
              {sideTab === 'comments' ? (
                <>
                  {selection && (
                    <section className="selection-composer">
                      <div className="composer-heading">
                        <span className="selection-badge">划线</span>
                        <button type="button" onClick={() => setSelection(null)}>取消</button>
                      </div>
                      <blockquote>“{selection.quote}”</blockquote>
                      <textarea
                        value={selectionComment}
                        onChange={(event) => setSelectionComment(event.target.value)}
                        placeholder="这段话有什么问题？希望如何调整？"
                        rows={3}
                        autoFocus
                      />
                      <button
                        className="dark-button"
                        type="button"
                        onClick={() => void addComment('selection')}
                        disabled={!selectionComment.trim() || commentSaving}
                      >
                        添加这条批注
                      </button>
                    </section>
                  )}

                  <section className="general-composer">
                    <div className="section-label">
                      <strong>整体意见</strong>
                      <span>不针对划线内容</span>
                    </div>
                    <textarea
                      value={generalComment}
                      onChange={(event) => setGeneralComment(event.target.value)}
                      placeholder="例如：整体语气太生硬，希望更像有经验的同事…"
                      rows={3}
                    />
                    <button
                      className="inline-add"
                      type="button"
                      onClick={() => void addComment('general')}
                      disabled={!generalComment.trim() || commentSaving}
                    >
                      ＋ 添加意见
                    </button>
                  </section>

                  <section className="comment-list">
                    <div className="section-label list-heading">
                      <strong>本轮批注</strong>
                      <span>{comments.length ? '将作为 AI 审阅依据' : '暂时没有批注'}</span>
                    </div>
                    {comments.length === 0 ? (
                      <div className="panel-empty">
                        <span>／</span>
                        <p>切换到划线模式选择原文，或者写下一条整体意见。</p>
                      </div>
                    ) : comments.map((item, index) => (
                      <article className="comment-card" key={item.id}>
                        <header>
                          <span><i>{index + 1}</i>{item.kind === 'selection' ? '划线批注' : '整体意见'}</span>
                          <button type="button" onClick={() => void removeComment(item.id)} aria-label="删除批注">×</button>
                        </header>
                        {item.quote && <blockquote>“{item.quote}”</blockquote>}
                        <p>{item.comment}</p>
                        <time>{dateLabel(item.createdAt, true)}</time>
                      </article>
                    ))}
                  </section>
                </>
              ) : (
                <section className="suggestion-list">
                  {analyzing ? (
                    <div className="analyzing-state">
                      <span className="thinking-orbit"><i /></span>
                      <strong>Qwen 正在阅读全文</strong>
                      <p>它会把原文、划线内容和你的意见放在一起分析。</p>
                    </div>
                  ) : suggestions.length === 0 && !reviewSummary ? (
                    <div className="panel-empty suggestions-empty">
                      <span>✦</span>
                      <strong>等待一次完整审阅</strong>
                      <p>提交后，AI 会给出可逐条采纳的修改建议与理由。</p>
                    </div>
                  ) : (
                    <>
                      <div className="review-summary">
                        <span>AI 审阅 · {reviewModel || 'Qwen'}</span>
                        <p>{reviewSummary}</p>
                        {pendingSuggestionCount > 0 && (
                          <button type="button" onClick={acceptAllSuggestions}>全部采纳 · {pendingSuggestionCount}</button>
                        )}
                      </div>
                      {suggestions.length === 0 ? (
                        <div className="panel-empty"><span>✓</span><p>没有需要局部替换的建议。</p></div>
                      ) : suggestions.map((item, index) => (
                        <article className={`suggestion-card ${item.status}`} key={item.id}>
                          <header>
                            <span>建议 {String(index + 1).padStart(2, '0')}</span>
                            {item.status === 'accepted' && <em>已采纳 ✓</em>}
                          </header>
                          <h3>{item.title}</h3>
                          <div className="diff-block original">
                            <span>− 原文</span>
                            <p>{item.original}</p>
                          </div>
                          <div className="diff-block replacement">
                            <span>＋ 建议</span>
                            <p>{item.replacement}</p>
                          </div>
                          <div className="suggestion-reason">
                            <strong>为什么这样改</strong>
                            <p>{item.reason}</p>
                          </div>
                          {item.status === 'pending' && (
                            <button className="accept-button" type="button" onClick={() => acceptSuggestion(item)}>
                              采纳这条建议 <span>→</span>
                            </button>
                          )}
                        </article>
                      ))}
                    </>
                  )}
                </section>
              )}
            </div>

            <footer className="review-footer">
              <div>
                <span>审阅上下文</span>
                <small>{comments.length} 条批注 · {content.length.toLocaleString('zh-CN')} 字符</small>
              </div>
              <button type="button" onClick={() => void analyzePrompt()} disabled={analyzing || !content.trim()}>
                {analyzing ? '分析中…' : '提交 AI 分析'} <span aria-hidden="true">↗</span>
              </button>
            </footer>
          </aside>
        </section>

        {showTag && (
          <Modal onClose={() => setShowTag(false)}>
            <section className="create-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="tag-title">
              <button className="modal-close" type="button" aria-label="关闭" onClick={() => setShowTag(false)}>×</button>
              <p className="eyebrow">版本快照</p>
              <h2 id="tag-title">记录当前版本</h2>
              <p className="modal-intro">版本保存后不可编辑，但可以随时查看或创建副本。</p>
              <form onSubmit={recordVersion}>
                <label>
                  <span>版本 Tag</span>
                  <input value={tagName} onChange={(event) => setTagName(event.target.value)} autoFocus placeholder="例如：v1 · 初稿" />
                </label>
                <div className="snapshot-note"><span>只读快照</span><strong>{content.length.toLocaleString('zh-CN')} 字符</strong></div>
                <div className="modal-actions">
                  <button className="text-button" type="button" onClick={() => setShowTag(false)}>取消</button>
                  <button className="primary-button" type="submit" disabled={modalSaving || !tagName.trim()}>{modalSaving ? '记录中…' : '记录版本'}</button>
                </div>
              </form>
            </section>
          </Modal>
        )}

        {showVersions && (
          <Modal onClose={() => setShowVersions(false)} wide>
            <section className="version-dialog" role="dialog" aria-modal="true" aria-labelledby="versions-title">
              <header>
                <div>
                  <p className="eyebrow">版本历史</p>
                  <h2 id="versions-title">历史版本</h2>
                </div>
                <button className="modal-close static" type="button" aria-label="关闭" onClick={() => setShowVersions(false)}>×</button>
              </header>
              {versions.length === 0 ? (
                <div className="version-empty">
                  <span>◌</span>
                  <h3>还没有版本记录</h3>
                  <p>关闭这里，点击“记录版本”保存第一个只读快照。</p>
                </div>
              ) : (
                <div className="version-layout">
                  <nav aria-label="版本列表">
                    {versions.map((item) => (
                      <button className={activeVersion?.id === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => setActiveVersion(item)}>
                        <strong>{item.tag}</strong>
                        <span>{dateLabel(item.createdAt, true)}</span>
                      </button>
                    ))}
                  </nav>
                  {activeVersion && (
                    <article className="version-preview">
                      <div className="version-preview-head">
                        <div><span>只读版本</span><strong>{activeVersion.tag}</strong></div>
                        <button type="button" onClick={() => void duplicateVersion(activeVersion)} disabled={modalSaving}>
                          {modalSaving ? '创建中…' : '创建副本 ↗'}
                        </button>
                      </div>
                      <pre>{activeVersion.content || '（空 Prompt）'}</pre>
                    </article>
                  )}
                </div>
              )}
            </section>
          </Modal>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <div className="brand" aria-label="Prompt Library">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <strong>Prompt Library</strong>
          </span>
        </div>
        <button className="primary-button" type="button" onClick={openCreateModal}>
          <span aria-hidden="true">＋</span>新建 Prompt
        </button>
      </header>

      {libraryLoading ? (
        <section className="library-loading" aria-label="正在读取项目">
          {[0, 1, 2].map((item) => <span key={item} />)}
        </section>
      ) : projects.length === 0 ? (
        <section className="empty-library">
          <div className="empty-glyph" aria-hidden="true"><span>✦</span></div>
          <h2>从第一段 Prompt 开始</h2>
          <p>创建一个项目，把草稿、批注与版本放进同一个工作区。</p>
          <button className="secondary-button" type="button" onClick={openCreateModal}>
            创建第一个项目 <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : (
        <section className="project-grid" aria-label="Prompt 项目列表">
          {projects.map((item) => (
            <button className="project-card" type="button" key={item.id} onClick={() => void openProject(item.id)} disabled={projectLoading}>
              <span className="project-icon">{item.icon}</span>
              <span className="card-arrow" aria-hidden="true">↗</span>
              <strong>{item.name}</strong>
              <span className="project-description">{item.description || '等待写下第一段 Prompt'}</span>
              <span className="project-card-meta">
                <span>{item.characterCount.toLocaleString('zh-CN')} 字符</span>
                <span>创建于 {dateLabel(item.createdAt)}</span>
              </span>
            </button>
          ))}
          <button className="new-card" type="button" onClick={openCreateModal}>
            <span aria-hidden="true">＋</span>新建项目
          </button>
        </section>
      )}

      <footer className="library-footer">
        <span><i className="status-dot" /> 5 秒差异自动保存</span>
        <span>Prompt 工作台</span>
      </footer>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setShowCreate(false)}>×</button>
            <p className="eyebrow">新建项目</p>
            <h2 id="create-title">创建 Prompt 项目</h2>
            <p className="modal-intro">给这次思考一个容易认出的名字。</p>
            <form onSubmit={createProject}>
              <label>
                <span>项目名称</span>
                <input value={createName} onChange={(event) => setCreateName(event.target.value)} autoFocus />
              </label>
              <label>
                <span>简介 <small>可选</small></span>
                <textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="这份 Prompt 用来做什么？" rows={3} />
              </label>
              <fieldset>
                <legend>封面图标</legend>
                <div className="icon-options">
                  {iconChoices.map((choice) => (
                    <button className={choice === createIcon ? 'selected' : ''} type="button" key={choice} onClick={() => setCreateIcon(choice)} aria-label={`选择图标 ${choice}`}>
                      {choice}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="modal-actions">
                <button className="text-button" type="button" onClick={() => setShowCreate(false)}>取消</button>
                <button className="primary-button" type="submit" disabled={modalSaving}>{modalSaving ? '创建中…' : <>创建并开始 <span aria-hidden="true">→</span></>}</button>
              </div>
            </form>
          </section>
        </Modal>
      )}

      {projectLoading && <div className="page-loader" role="status"><span /><p>正在打开 Prompt…</p></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className={`modal-backdrop ${wide ? 'wide' : ''}`} role="presentation" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}
