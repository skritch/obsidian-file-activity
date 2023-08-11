
import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_DATA, deletePath, FileActivityPluginData, PathStr, renamePath, updateOutgoingLinks } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

export const LIST_VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public data: FileActivityPluginData;
  public view: FileActivityListView;
  
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
      // On app start/close, recompute entire state? Or at least clean out old state?

      this.addSettingTab(new FileActivitySettingTab(this.app, this));
  }
    
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      LIST_VIEW_TYPE,
      );
  }
  
  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
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
  
  /**
   * Any time a file is re-indexed, we update its links.
   * 
   * This occurs after edits (including when a file it links to is renamed), for 
   * all files at app startup, and—it appears—occasionally at other times.
   */
  private readonly handleResolve = async (file: TFile): Promise<void> => {
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
   * 1. Update our modification time cache to use the new name.
   * 2. Update our backlink cache to use the new name.
   * 3. Recompute everything that links to this name it.
   * 
   * A move = a rename that only changes the path.
   * 
   * Cases to handle:
   * * Rename to the name of a current unresolved link
   * * Rename to the same name as another file
   * * Move without rename
   * 
   */
  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {

    console.log('handleRename path: ' + file.path + ' oldPath: ' + oldPath)
    let modTime = (await app.vault.adapter.stat(file.path))?.mtime
    if (modTime === undefined) {
      console.log("No modtime for " + file.path)
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
   * * links from this file
   * * links pointing to this file
   * * modification time cache for this file
   * 
   */
  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
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
