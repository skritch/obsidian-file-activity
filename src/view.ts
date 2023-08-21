
import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { DisplayEntry, getDisplayLinks } from "./data";
import FileActivityPlugin, { VIEW_TYPE } from './main';
import { getSparklineAsInlineStyle } from './sparkline';


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
    return VIEW_TYPE;
  }

  public getDisplayText(): string {
    return 'File Activity';
  }

  public getIcon(): string {
    return 'activity';
  }
  
  public readonly redraw = (): void => {
    const openFile = this.app.workspace.getActiveFile();

    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const childrenEl = rootEl.createDiv({ cls: 'nav-folder-children' });

    const topLinks: Array<DisplayEntry> = getDisplayLinks(this.plugin.data)
    const scale = 3 // Math.max(...topLinks.map((x) => {return Math.max(...x.counts)}))

    Object.values(topLinks).forEach((entry) => {
      const navFile = childrenEl.createDiv({ cls: 'nav-file file-activity-file' });
      const navFileTitle = navFile.createDiv({ cls: 'nav-file-title file-activity-title' })
      const navFileTitleContent = navFileTitle.createDiv({ cls: 'nav-file-title-content file-activity-title-content' })

      if (entry.path === undefined) {
        navFileTitleContent.addClass('file-activity-unresolved');
        // Clicking an unresolved entry will link into the search box if it's enabled
        navFileTitleContent.createEl("a", {
          href: `obsidian://search?vault=${this.app.vault.getName()}&query=${entry.name}`,
          text: entry.name
        })
      } else {
        
        navFileTitleContent.setText(entry.name)
      }

      navFileTitle.createDiv({
        cls: 'file-activity-graph',
        attr: {'style': getSparklineAsInlineStyle(entry.counts, scale)}
      })

      if (openFile && entry.path === openFile.path) {
        navFileTitle.addClass('is-active');
      }

      navFileTitle.setAttr('draggable', 'true');
      
      // If it's a file rather than an unresolved link, make it a link.
      if (entry.path !== undefined) {
        const path = entry.path;
        navFileTitle.addEventListener('dragstart', (event: DragEvent) => {
          const file = this.app.metadataCache.getFirstLinkpathDest(
            path,
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
            source: VIEW_TYPE,
            hoverParent: rootEl,
            targetEl: navFile,
            linktext: entry.path,
          });
        });

        navFileTitle.addEventListener('contextmenu', (event: MouseEvent) => {
          const menu = new Menu();
          const file = this.app.vault.getAbstractFileByPath(path);
          this.app.workspace.trigger(
            'file-menu',
            menu,
            file,
            'link-context-menu',
          );
          menu.showAtPosition({ x: event.clientX, y: event.clientY });
        });

        navFileTitleContent.addEventListener('click', (event: MouseEvent) => {
          this.focusFile(path, event.ctrlKey || event.metaKey);
        });
      }
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
  private readonly focusFile = async (path: string, shouldSplit = false): Promise<void> => {
    const targetFile = this.app.vault.getAbstractFileByPath(path);

    if (targetFile !== null && (targetFile instanceof TFile)) {
      let leaf: WorkspaceLeaf | null = this.app.workspace.getMostRecentLeaf();

      if (shouldSplit || leaf === null || leaf.getViewState().pinned) {
        if (this.plugin.data.config.openType == 'split')
          leaf = this.app.workspace.getLeaf('split');
        else if (this.plugin.data.config.openType == 'window')
          leaf = this.app.workspace.getLeaf('window');
        else
          leaf = this.app.workspace.getLeaf('tab');
      }
      leaf.openFile(targetFile);
    } else {
      new Notice('Cannot find a file with that name');
      this.redraw();
    }
  };
}
