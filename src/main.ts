
import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_DATA, deletePath, FileActivityPluginData, PathStr, renamePath, updateOutgoingLinks } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

const PLUGIN_NAME = 'File Activity Plugin';
export const LIST_VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public data: FileActivityPluginData;
  public view: FileActivityListView;
  
  // Runs on app start, but not plugin load
  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);
    
    await this.loadData();
    
    this.registerView(
      LIST_VIEW_TYPE,
      (leaf) => (this.view = new FileActivityListView(leaf, this)),
      );

      if (this.app.workspace.layoutReady) {
        this.initView();
      } else {
        this.registerEvent(this.app.workspace.on('layout-ready' as any, this.initView)); // tslint:disable-line
      }
      this.addCommand({
        id: 'file-activity-open',
        name: 'Open File Activity Panel',
        callback: this.revealView
      });
      this.registerEvent(this.app.vault.on('rename', this.handleRename));
      this.registerEvent(this.app.vault.on('delete', this.handleDelete));
      this.registerEvent(this.app.metadataCache.on('resolve', this.handleResolve));
      this.registerEvent(this.app.metadataCache.on('resolved', this.handleResolved));
      // TODO: On app start/close, recompute entire state? Or at least clean out old state?

      this.addSettingTab(new FileActivitySettingTab(this.app, this));
  }
  
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      LIST_VIEW_TYPE,
      );
  }
  
  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA(), await super.loadData());
  }
  
  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }
  
  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf | null = null;
    for (leaf of this.app.workspace.getLeavesOfType(LIST_VIEW_TYPE)) {
      if (leaf.view instanceof FileActivityListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: LIST_VIEW_TYPE,
      active: true,
    });
  };
  
  private readonly revealView = async () => {
    let [leaf] = this.app.workspace.getLeavesOfType(LIST_VIEW_TYPE);
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: LIST_VIEW_TYPE });
    }
    
    this.app.workspace.revealLeaf(leaf);
  }
  
  /** EVENT HANDLERS */
  // Note event handlers currently *mutate* the plugin .data object.
  // Should we also pass in the Plugin itself?
  
  /**
   * This appears to fire:
   * - On edits
   *    - Including when a file it links to is renamed
   * - For all files at app startup
   * - Occasionally at other times
   */
  private readonly handleResolve = async (file: TFile): Promise<void> => {
    if (!this.isMarkdown(file.path)) return;
    
    const logStats = {
      path: file.path,
      mtime: file.stat.mtime,
      links: this.getLinksForPath(file.path),
      data: this.data.backlinkIndex[file.path]
    }
    console.log('handleResolve: ' + JSON.stringify(logStats))

    updateOutgoingLinks(
      file.path,
      file.stat.mtime,
      this.getLinksForPath(file.path),
      this.data
    )
  }

  /**
   * Fires when all queued files have been resolved. 
   * 
   * We save and update view here to avoid duplicate work when 
   * there are a lot of changes, particularly at app startup.
   */
  private readonly handleResolved = async (): Promise<void> => {
    this.saveData()
    this.view.redraw()
  }
          
  /**
   * Handle file renames. We have a few things to do:
   * - Update our modification time cache to use the new name.
   * - Update our backlink cache to use the new name.
   * - Recompute everything that links to this by name.
   * 
   * Edge Cases to handle:
   * - Rename to the name of a current unresolved link
   * - Rename to the same name as another file
   * - Move without rename (only changes the path)
   * 
   */
  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    if (!this.isMarkdown(file.path)) return;

    let modTime = (await app.vault.adapter.stat(file.path))?.mtime    
    const logStats = {
      path: file.path,
      oldPath: oldPath,
      mtime: modTime,
      links: this.getLinksForPath(file.path),
      data: this.data.backlinkIndex[file.path],
      oldData: this.data.backlinkIndex[oldPath],
    }
    console.log('handleRename: ' + JSON.stringify(logStats))

    if (modTime === undefined) {
      return
    }

    renamePath(
      file.path,
      oldPath,
      modTime,
      this.getLinksForPath(file.path),
      this.data
    )

    await this.saveData();
    this.view.redraw()
  };
            
            
  /**
   * On deletes, existing links become unresolved.
   * 
   * We clean up:
   * - links from this file
   * - links pointing to this file, which become dangling links
   * - modification time cache for this file
   */
  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    if (!this.isMarkdown(file.path)) return;

    const logStats = {
      path: file.path,
      links: this.getLinksForPath(file.path),
      data: this.data.backlinkIndex[file.path]
    }
    console.log('handleDelete: ' + JSON.stringify(logStats))
    deletePath(file.path, this.data)
    await this.saveData();
    this.view.redraw();
  };
      
  private readonly getLinksForPath = (path: PathStr) => {
    return Object.keys({
      // vault absolute paths
      ...app.metadataCache.resolvedLinks[path],
      // just the string, I presume
      // ...app.metadataCache.unresolvedLinks[file.path]
    })
  }

  readonly isMarkdown = (path: string): boolean => {
    return path.endsWith(".md")
  }
              
  
  // TODO where is this called?
  // readonly removeFile = async (file: FileActivity): Promise<void> => {
  //   this.data.fileActivity = this.data.fileActivity.filter(
  //     (currFile) => currFile.path !== file.path,
  //     );
  //     await this.pruneLength();
  //     await this.saveData();
  // }
  
  // public readonly pruneOmittedFiles = async (): Promise<void> => {
  // let regexps = this.data.omittedPaths
  // .filter((path) => path.length > 0)
  // .map((pattern) => new RegExp(pattern))
  //   this.data.fileActivity = this.data.fileActivity.filter(
  //     (file) => !regexps.some((r) => r.test(file.path))
  //   );
  // };

  // public readonly pruneLength = async (): Promise<void> => {
  //   const toRemove =
  //   this.data.fileActivity.length - (this.data.maxLength || DEFAULT_DATA.maxLength);
  //   if (toRemove > 0) {
  //     this.data.fileActivity.splice(
  //       this.data.fileActivity.length - toRemove,
  //       toRemove,
  //       );
  //     }
  // };
}
