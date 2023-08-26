
import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { remove, PathStr, rename, update, Link, LinkText, LinkKey, ReverseIndex, DEFAULT_CONFIG, PluginConfig } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';
import { Signal, effect, signal } from '@preact/signals';
import { deriveDisplayEntries } from './logic';

export const PLUGIN_NAME = 'File Activity Plugin';
export const VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public view: FileActivityListView;
  private index: ReverseIndex
  private updateSignal: Signal<number>
  
  // Runs on app start and plugin load
  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);
    
    const config = signal<PluginConfig>({...DEFAULT_CONFIG, ...await this.loadData()})
    effect(() => {
      // Ought to be async... return something to cancel this?
      console.log(`${PLUGIN_NAME}: saving config`)
      this.saveData(config.value)
    })

    this.index = {}
    this.updateSignal = signal(0)
    await this.indexAll()
    const displayEntries = deriveDisplayEntries(this.index, this.updateSignal, config)

    this.registerView(
      VIEW_TYPE,
      (leaf) => (this.view = new FileActivityListView(leaf, this, displayEntries, config)),
      );

      if (this.app.workspace.layoutReady) {
        this.initView();
      } else {
        this.registerEvent(this.app.workspace.on('layout-ready' as any, this.initView));
      }
      this.addCommand({
        id: 'file-activity-open',
        name: 'Open File Activity Panel',
        callback: this.revealView
      });
      this.registerEvent(this.app.vault.on('rename', this.handleRename));
      this.registerEvent(this.app.vault.on('delete', this.handleDelete));
      this.registerEvent(this.app.metadataCache.on('resolve', this.handleResolve));
      this.registerEvent(this.app.metadataCache.on('resolved', this.triggerUpdate));
      // Catch a couple events that can make our "active file" in the view go out of date
      this.registerEvent(this.app.workspace.on("file-open", this.triggerUpdate))
      this.registerEvent(this.app.workspace.on("window-close", this.triggerUpdate))
      this.addSettingTab(new FileActivitySettingTab(this.app, this, config));
  }
  
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      VIEW_TYPE,
    );
  }
  
  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf | null = null;
    for (leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof FileActivityListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: VIEW_TYPE,
      active: true,
    });
  };
  
  private readonly revealView = async () => {
    let [leaf] = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE });
    }
    
    this.app.workspace.revealLeaf(leaf);
  }

  private indexAll = async (): Promise<void> => {
    const mdFiles = this.app.vault.getMarkdownFiles()
    console.log(PLUGIN_NAME + ': Indexing ' + mdFiles.length + ' files.')
    mdFiles.forEach((file) => {
      const links = this.getLinksForPath(file.path)
      // For a bulk index, skip anything that doesn't have links.
      if (links.length > 0) {
        update(
          file.path,
          file.stat.ctime,
          links,
          this.index
        )
      }
    })
    this.updateSignal.value = this.updateSignal.value + 1
  }
  
  
  /** EVENT HANDLERS */
  
  /**
   * This appears to fire:
   * - On edits
   *   - Including when a file this file links to is renamed, which triggers an edit for this file
   *   - Including when a file is renamed to match an unresolved link in this file, even though 
   *     this doesn't trigger a rename
   * - For all files at app startup
   * - Occasionally at other times, it appears.
   */
  private readonly handleResolve = async (file: TFile): Promise<void> => {
    update(
      file.path,
      file.stat.ctime,
      this.getLinksForPath(file.path),
      this.index
    )
  }

  private triggerUpdate = (): void => {
    this.updateSignal.value = this.updateSignal.value + 1
  }
  
  private handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    const stat = (await this.app.vault.adapter.stat(file.path))

    if (stat?.mtime === undefined) {
      return
    }

    rename(
      file.path,
      oldPath,
      stat.ctime,
      this.getLinksForPath(file.path),
      this.index
    )
    this.triggerUpdate()
  };
            
  private handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    remove(file.path, this.index)
    this.triggerUpdate()
  };
      
  /**
   * Returns [[resolved links], [unresolved links]]
   */
  private getLinksForPath = (path: PathStr): Array<Link> => {
    let links: Array<Link> = []
    const resolvedlinks = this.app.metadataCache.resolvedLinks[path];
    const unresolvedLinks = this.app.metadataCache.unresolvedLinks[path]

    if (resolvedlinks !== undefined) {
      links = links.concat(Object.keys(resolvedlinks).map((path) => {
        return {
          isResolved: true,
          path: path,
        }}
      ))
    }
    if (unresolvedLinks !== undefined) {
      links = links.concat(Object.keys(unresolvedLinks).map((text) => {
        return {
          isResolved: false,
          text: text,
        }}
      ))
    }
    return links
  }
}

