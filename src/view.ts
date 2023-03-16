
import { getIcon, ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import FileActivityPlugin, { FileActivity, LIST_VIEW_TYPE } from './main';


export default class FileActivityListView extends ItemView {
  private readonly plugin: FileActivityPlugin;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: FileActivityPlugin,
  ) {
    super(leaf);

    this.plugin = plugin;
  }

  public async onOpen(): Promise<void> {
    this.redraw();
  }

  public getViewType(): string {
    return LIST_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return 'File Activity';
  }

  public getIcon(): string {
    return 'clock';
  }
  
  public readonly redraw = (): void => {
    const openFile = this.app.workspace.getActiveFile();

    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const childrenEl = rootEl.createDiv({ cls: 'nav-folder-children' });

    this.plugin.data.fileActivity.forEach((f) => {
      const navFile = childrenEl.createDiv({ cls: 'nav-file file-activity-file' });
      const navFileTitle = navFile.createDiv({ cls: 'nav-file-title file-activity-title' })
      const navFileTitleContent = navFileTitle.createDiv({ cls: 'nav-file-title-content file-activity-title-content' })

      navFileTitleContent.setText(f.basename)

      if (openFile && f.path === openFile.path) {
        navFileTitle.addClass('is-active');
      }

      navFileTitle.setAttr('draggable', 'true');
      navFileTitle.addEventListener('dragstart', (event: DragEvent) => {
        const file = this.app.metadataCache.getFirstLinkpathDest(
          f.path,
          '',
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dragManager = (this.app as any).dragManager;
        const dragData = dragManager.dragFile(event, file);
        dragManager.onDragStart(event, dragData);
      });

      navFileTitle.addEventListener('mouseover', (event: MouseEvent) => {
        this.app.workspace.trigger('hover-link', {
          event,
          source: LIST_VIEW_TYPE,
          hoverParent: rootEl,
          targetEl: navFile,
          linktext: f.path,
        });
      });

      navFileTitle.addEventListener('contextmenu', (event: MouseEvent) => {
        const menu = new Menu();
        const file = this.app.vault.getAbstractFileByPath(f.path);
        this.app.workspace.trigger(
          'file-menu',
          menu,
          file,
          'link-context-menu',
        );
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
      });

      navFileTitleContent.addEventListener('click', (event: MouseEvent) => {
        this.focusFile(f, event.ctrlKey || event.metaKey);
      });

      const navFileDelete = navFileTitle.createDiv({ cls: 'recent-files-file-delete' })
      navFileDelete.appendChild(getIcon("x-circle") as SVGSVGElement);
      navFileDelete.addEventListener('click', async () => {
        await this.plugin.removeFile(f);
        this.redraw();
      })
    });

    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    contentEl.appendChild(rootEl);
  };

  /**
   * Open the provided file in the most recent leaf.
   *
   * @param shouldSplit Whether the file should be opened in a new split, or in
   * the most recent split. If the most recent split is pinned, this is set to
   * true.
   */
  private readonly focusFile = async (file: FileActivity, shouldSplit = false): Promise<void> => {
    const targetFile = this.app.vault
      .getFiles()
      .find((f) => f.path === file.path);

    if (targetFile) {
      let leaf: WorkspaceLeaf | null = this.app.workspace.getMostRecentLeaf();

      if (shouldSplit || leaf === null || leaf.getViewState().pinned) {
        if (this.plugin.data.openType == 'split')
          leaf = this.app.workspace.getLeaf('split');
        else if (this.plugin.data.openType == 'window')
          leaf = this.app.workspace.getLeaf('window');
        else
          leaf = this.app.workspace.getLeaf('tab');
      }
      leaf.openFile(targetFile);
	  
    } else {
      new Notice('Cannot find a file with that name');
      await this.plugin.removeFile(file);
      this.redraw();
    }
  };
}
