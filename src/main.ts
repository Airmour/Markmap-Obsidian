import {
  ItemView,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import { parse } from '@markmap/parse';
import { Markmap } from '@markmap/view';

const VIEW_TYPE_MARKMAP = 'markmap-preview';

interface MarkmapViewState extends Record<string, unknown> {
  filePath?: string;
}

class MarkmapPreviewView extends ItemView {
  private filePath?: string;
  private markdown = '';
  private map?: Markmap;
  private svg?: SVGSVGElement;
  private statusEl?: HTMLElement;
  private debounceTimer?: number;
  private contentRevision = 0;
  private hasFitted = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MARKMAP;
  }

  getDisplayText(): string {
    return 'Markmap Preview';
  }

  getIcon(): string {
    return 'git-fork';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('markmap-preview');

    const toolbar = this.contentEl.createDiv({
      cls: 'markmap-preview__toolbar',
    });
    toolbar.createSpan({
      cls: 'markmap-preview__title',
      text: 'Markmap Preview',
    });
    this.statusEl = toolbar.createSpan({
      cls: 'markmap-preview__status',
      text: 'Open a Markdown note and run “Open as Markmap”.',
    });
    this.statusEl.setAttribute('aria-live', 'polite');

    this.addButton(toolbar, 'Zoom in', '+', () => this.map?.zoomIn());
    this.addButton(toolbar, 'Zoom out', '−', () => this.map?.zoomOut());
    this.addButton(toolbar, 'Fit map', 'Fit', () => this.map?.fit());
    this.addButton(toolbar, 'Expand all nodes', 'Expand', () =>
      this.map?.expandAll(),
    );
    this.addButton(toolbar, 'Collapse all nodes', 'Collapse', () =>
      this.map?.foldAll(),
    );

    const canvas = this.contentEl.createDiv({
      cls: 'markmap-preview__canvas',
    });
    this.svg = canvas.createSvg('svg', {
      attr: { width: '100%', height: '100%' },
    });

    this.map = new Markmap(this.svg);
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.debounceTimer !== undefined) {
      window.clearTimeout(this.debounceTimer);
    }
    this.map?.destroy();
    this.map = undefined;
  }

  getState(): MarkmapViewState {
    return { filePath: this.filePath };
  }

  async setState(
    state: MarkmapViewState,
    result: Parameters<ItemView['setState']>[1],
  ): Promise<void> {
    await super.setState(state, result);
    if (state.filePath) {
      if (state.filePath !== this.filePath) this.hasFitted = false;
      this.filePath = state.filePath;
      const file = this.app.vault.getAbstractFileByPath(state.filePath);
      if (file instanceof TFile) {
        this.updateMarkdown(await this.app.vault.cachedRead(file));
      }
    }
  }

  setSource(filePath: string, markdown: string): void {
    if (filePath !== this.filePath) this.hasFitted = false;
    this.filePath = filePath;
    this.updateMarkdown(markdown);
  }

  updateSource(filePath: string, markdown: string): void {
    if (filePath !== this.filePath) return;
    this.contentRevision += 1;
    this.markdown = markdown;
    if (this.debounceTimer !== undefined) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = undefined;
      this.render();
    }, 150);
  }

  getContentRevision(): number {
    return this.contentRevision;
  }

  updateFromVault(
    filePath: string,
    markdown: string,
    expectedRevision: number,
  ): void {
    if (
      filePath !== this.filePath ||
      expectedRevision !== this.contentRevision
    ) {
      return;
    }
    this.updateSource(filePath, markdown);
  }

  private updateMarkdown(markdown: string): void {
    this.contentRevision += 1;
    this.markdown = markdown;
    this.render();
  }

  private render(): void {
    if (!this.map || !this.svg || !this.statusEl) return;
    try {
      const { root } = parse(this.markdown);
      this.map.setTree(root);
      if (!this.hasFitted) {
        this.map.fit();
        this.hasFitted = true;
      }
      if (!this.markdown.trim()) {
        this.statusEl.setText('This note is empty.');
      } else {
        this.statusEl.setText(
          this.filePath ? this.filePath.split('/').pop() ?? this.filePath : '',
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown rendering error';
      this.statusEl.setText(`Unable to render this note: ${message}`);
    }
  }

  private addButton(
    toolbar: HTMLElement,
    label: string,
    text: string,
    callback: () => void,
  ): void {
    const button = toolbar.createEl('button', {
      cls: 'markmap-preview__button',
      text,
      attr: { 'aria-label': label, title: label },
    });
    button.addEventListener('click', callback);
  }
}

export default class MarkmapPlugin extends Plugin {
  private markdownViewActions = new Map<MarkdownView, HTMLElement>();

  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_MARKMAP,
      (leaf) => new MarkmapPreviewView(leaf),
    );

    this.addCommand({
      id: 'open-as-markmap',
      name: 'Open as Markmap',
      checkCallback: (checking) => {
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView?.file) return false;
        if (!checking) void this.openPreview(markdownView);
        return true;
      },
    });

    this.app.workspace.onLayoutReady(() => this.syncMarkdownViewActions());
    this.registerEvent(
      this.app.workspace.on('layout-change', () =>
        this.syncMarkdownViewActions(),
      ),
    );

    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, markdownView) => {
        const file = markdownView.file;
        if (!file) return;
        this.forEachPreview((view) =>
          view.updateSource(file.path, editor.getValue()),
        );
      }),
    );

    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const previews = this.getPreviewViews().filter(
          (view) => view.getState().filePath === file.path,
        );
        if (previews.length === 0) return;
        const revisions = new Map(
          previews.map((view) => [view, view.getContentRevision()]),
        );
        try {
          const markdown = await this.app.vault.cachedRead(file);
          previews.forEach((view) =>
            view.updateFromVault(
              file.path,
              markdown,
              revisions.get(view) ?? -1,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown read error';
          new Notice(`Unable to refresh the Markmap preview: ${message}`);
        }
      }),
    );
  }

  onunload(): void {
    this.markdownViewActions.forEach((action) => action.remove());
    this.markdownViewActions.clear();
  }

  private syncMarkdownViewActions(): void {
    const markdownViews = new Set(
      this.app.workspace
        .getLeavesOfType('markdown')
        .map((leaf) => leaf.view)
        .filter((view): view is MarkdownView => view instanceof MarkdownView),
    );

    markdownViews.forEach((view) => {
      if (this.markdownViewActions.has(view)) return;
      const action = view.addAction('git-fork', 'Open as Markmap', () => {
        void this.openPreview(view);
      });
      action.classList.add('markmap-preview__view-action');
      this.markdownViewActions.set(view, action);
    });

    this.markdownViewActions.forEach((action, view) => {
      if (markdownViews.has(view)) return;
      action.remove();
      this.markdownViewActions.delete(view);
    });
  }

  private async openPreview(markdownView: MarkdownView): Promise<void> {
    const file = markdownView.file;
    if (!file) return;

    let leaf = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_MARKMAP)
      .find((candidate) => candidate.view instanceof MarkmapPreviewView);
    if (!leaf) leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
    if (!leaf) {
      new Notice('Unable to open the Markmap preview pane.');
      return;
    }

    await leaf.setViewState({
      type: VIEW_TYPE_MARKMAP,
      active: true,
      state: { filePath: file.path } satisfies MarkmapViewState,
    });
    await this.app.workspace.revealLeaf(leaf);

    if (leaf.view instanceof MarkmapPreviewView) {
      leaf.view.setSource(file.path, markdownView.editor.getValue());
    }
  }

  private getPreviewViews(): MarkmapPreviewView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_MARKMAP)
      .filter(
        (leaf): leaf is WorkspaceLeaf & { view: MarkmapPreviewView } =>
          leaf.view instanceof MarkmapPreviewView,
      )
      .map((leaf) => leaf.view);
  }

  private forEachPreview(callback: (view: MarkmapPreviewView) => void): void {
    this.getPreviewViews().forEach(callback);
  }
}
