import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, ItemView, getIcon, Menu, TFile, WorkspaceLeaf, CachedMetadata } from 'obsidian';

// Remember to rename these classes and interfaces!

type date = string

interface FileData {
	path: string;
	basename: string;
	byDateLinked: Map<date, number>
	byDateEdited: Map<date, number>
}
// TODO tags?
interface FileActivityData {
	fileActivity: FileData[];
	omittedPaths: string[];
	maxLength: number;
	openType: string
}

const DEFAULT_DATA: FileActivityData = {
	fileActivity: [],
	omittedPaths: [],
	maxLength: 50,
	openType: 'tab'
};

/**Brainstorm
 * 
 * A name more like "ongoing"? Recent topics?
 * 
 * Data structure of:
 * 1. recently created/edited/opened files
 * * recently-linked-to files
 * * recently linked tags
 * 
 * Also, parse dates:
 * * last opened
 * * last edited
 * * last created
 * * Daily note date, if available
 * 
 * Then:
 * * display as a list, with an emoji indicated which it was?
 * * display the date of the last link/access?
 * * rank by a trailing "weight"?
 * * give user a way to "finish" links/tags/projects, removing from list,
 *   or move to a "finished projects"
 * * A "span" view indicating the dates over which different tags/topics have been worked on?
 *   That can scroll back in time?
 *   Or a way to put these directly on the calendar view...? Open a pane beneath it-->selecting a tag or link highlights
 *     dates where it was linked to?
 *   Plugin might end up having to store a lot of data unless Obsidian has an API for its link database
 */
const FileActivityListViewType = 'file-activity';

class FileActivityListView extends ItemView {
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
    return FileActivityListViewType;
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
          source: FileActivityListViewType,
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
  private readonly focusFile = async (file: FileData, shouldSplit = false): Promise<void> => {
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

export default class FileActivityPlugin extends Plugin {
  public data: FileActivityData;
  public view: FileActivityListView;

  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);

    await this.loadData();

    this.registerView(
      FileActivityListViewType,
      (leaf) => (this.view = new FileActivityListView(leaf, this)),
    );

    this.addCommand({
      id: 'file-activity-open',
      name: 'Open File Activity Panel',
      callback: async () => {
        let [leaf] = this.app.workspace.getLeavesOfType(FileActivityListViewType);
        if (!leaf) {
          leaf = this.app.workspace.getRightLeaf(false);
          await leaf.setViewState({ type: FileActivityListViewType });
        }

        this.app.workspace.revealLeaf(leaf);
      }
    });

    // this.app.workspace.registerHoverLinkSource(
    //   FileActivityListViewType,
    //   {
    //     display: 'File Activity',
    //     defaultMod: true,
    //   },
    // );

    // if (this.app.workspace.layoutReady) {
    //   this.initView();
    // } else {
    //   this.registerEvent(this.app.workspace.on('layout-ready', this.initView));
    // }

    this.initView();
    this.registerEvent(this.app.vault.on('rename', this.handleRename));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete));
    this.registerEvent(this.app.workspace.on('file-open', this.update));
    this.registerEvent(this.app.vault.on('modify', this.handleModify));
    this.registerEvent(this.app.metadataCache.on('changed', this.handleUpdateCache));
    this.addSettingTab(new FileActivitySettingTab(this.app, this));
  }

  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      FileActivityListViewType,
    );
  }

  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
  }

  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }

  public readonly pruneOmittedFiles = async (): Promise<void> => {
    this.data.fileActivity = this.data.fileActivity.filter(this.shouldAddFile);
    await this.saveData();
  };

  public readonly pruneLength = async (): Promise<void> => {
    const toRemove =
      this.data.fileActivity.length - (this.data.maxLength || DEFAULT_DATA.maxLength);
    if (toRemove > 0) {
      this.data.fileActivity.splice(
        this.data.fileActivity.length - toRemove,
        toRemove,
      );
    }
    await this.saveData();
  };

  public readonly shouldAddFile = (file: TFile | FileData): boolean => {
    const patterns: string[] = this.data.omittedPaths.filter(
      (path) => path.length > 0,
    );
    const fileMatchesRegex = (pattern: string): boolean => {
      try {
        return new RegExp(pattern).test(file.path);
      } catch (err) {
        console.error('File Activity: Invalid regex pattern: ' + pattern);
        return false;
      }
    };
    return !patterns.some(fileMatchesRegex);
  };

  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf | null = null;
    for (leaf of this.app.workspace.getLeavesOfType(FileActivityListViewType)) {
      if (leaf.view instanceof FileActivityListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: FileActivityListViewType,
      active: true,
    });
  };

  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    const entry = this.data.fileActivity.find(
      (f) => f.path === oldPath,
    );
    if (entry) {
      entry.path = file.path;
      entry.basename = file.name.replace(/\.[^/.]+$/, '');;
      this.view.redraw();
      await this.saveData();
    }
  };

  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    const beforeLen = this.data.fileActivity.length;
    this.data.fileActivity = this.data.fileActivity.filter(
      (f) => f.path !== file.path,
    );

    if (beforeLen !== this.data.fileActivity.length) {
      this.view.redraw();
      await this.saveData();
    }
  };
  
  // Or: use metadata cache, which tracks links?
  // Fires after a little typing
  private readonly handleModify = async (
    file: TAbstractFile,
  ): Promise<void> => {
    console.log('modified: ' + file.name)
  };

  private readonly handleUpdateCache = async (
    file: TFile, data: string, cache: CachedMetadata
  ): Promise<void> => {
    console.log('updated: ' + file.name + ' + cache: ' + JSON.stringify(cache))
    console.log('cache: ' + JSON.stringify(app.metadataCache.resolvedLinks[file.path]))
  };

  readonly removeFile = async (file: FileData): Promise<void> => {
    this.data.fileActivity = this.data.fileActivity.filter(
      (currFile) => currFile.path !== file.path,
    );
    await this.pruneLength(); // Handles the save
  }

  private readonly update = async (file: TFile): Promise<void> => {
    if (!file || !this.shouldAddFile(file)) {
      return;
    }
	this.data.fileActivity = this.data.fileActivity.filter(
		(f) => f.path !== file.path,
	  );
	  this.data.fileActivity.unshift({
      basename: file.basename,
      path: file.path,
      byDateEdited: new Map(),
      byDateLinked: new Map()
	  });
  
	await this.pruneLength(); // Handles the save
    this.view.redraw();
  };
}

class FileActivitySettingTab extends PluginSettingTab {
  private readonly plugin: FileActivityPlugin;

  constructor(app: App, plugin: FileActivityPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'File Activity' });

    const fragment = document.createDocumentFragment();
    const link = document.createElement('a');
    link.href =
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
    link.text = 'MDN - Regular expressions';
    fragment.append('RegExp patterns to ignore. One pattern per line. See ');
    fragment.append(link);
    fragment.append(' for help.');

	// todo allow only .md extensions?

    new Setting(containerEl)
      .setName('Omitted pathname patterns')
      .setDesc(fragment)
      .addTextArea((textArea) => {
        textArea.inputEl.setAttr('rows', 6);
        textArea
          .setPlaceholder('^daily/\n^journal/\n\\.png$\nfoobar.*baz')
          .setValue(this.plugin.data.omittedPaths.join('\n'));
        textArea.inputEl.onblur = (e: FocusEvent) => {
          const patterns = (e.target as HTMLInputElement).value;
          this.plugin.data.omittedPaths = patterns.split('\n');
          this.plugin.pruneOmittedFiles();
          this.plugin.view.redraw();
        };
      });

    new Setting(containerEl)
      .setName('Number of Files')
      .setDesc('Maximum number of files to track.')
      .addText((text) => {
        text.inputEl.setAttr('type', 'number');
        text.inputEl.setAttr('placeholder', DEFAULT_DATA.maxLength);
        text
          .setValue(this.plugin.data.maxLength?.toString())
          .onChange((value) => {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed <= 0) {
              new Notice('Number of files must be a positive integer');
              return;
            }
          });
        text.inputEl.onblur = (e: FocusEvent) => {
          const maxfiles = (e.target as HTMLInputElement).value;
          const parsed = parseInt(maxfiles, 10);
          this.plugin.data.maxLength = parsed;
          this.plugin.pruneLength();
          this.plugin.view.redraw();
        };
      });

    new Setting(containerEl)
      .setName("Open note in")
      .setDesc("Open the clicked recent file record in a new tab, split, or window (only works on the desktop app).")
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {
          "tab": "tab",
          "split": "split",
          "window": "window",
        };

        dropdown
          .addOptions(options)
          .setValue(this.plugin.data.openType)
          .onChange(async (value) => {
            this.plugin.data.openType = value;
            await this.plugin.saveData();
            this.display();
          });
      });
  }
}
