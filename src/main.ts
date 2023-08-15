
import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_DATA, remove, FileActivityPluginData, PathStr, rename, update } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

const PLUGIN_NAME = 'File Activity Plugin';
export const VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public data: FileActivityPluginData;
  public view: FileActivityListView;
  
  // Runs on app start and plugin load
  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);
    
    await this.loadData();
    
    this.registerView(
      VIEW_TYPE,
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
      this.addSettingTab(new FileActivitySettingTab(this.app, this));

      await this.indexAll()
      await this.saveData()
      this.view.redraw()
  }
  
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      VIEW_TYPE,
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
    let mdFiles = app.vault.getMarkdownFiles()
    console.log(PLUGIN_NAME + ': Indexing ' + mdFiles.length + ' files.')
    mdFiles.forEach((file) => {
      let [links, unresolvedLinks] = this.getLinksForPath(file.path)
      // For a bulk index, skip anything that doesn't have links.
      if (links.length > 0 || unresolvedLinks.length > 0) {
        update(
          file.path,
          file.stat.mtime,
          links,
          unresolvedLinks,
          this.data
        )
      }
    })
  }
  
  /** EVENT HANDLERS */
  // Note event handlers currently *mutate* the plugin .data object.
  
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
    if (!this.isMarkdown(file.path)) return;

    const logStats = {
      path: file.path,
      mtime: file.stat.mtime,
      newLinks: this.getLinksForPath(file.path),
      links: this.data.linkIndex[file.path],
      unresolvedLinks: this.data.unresolvedLinkIndex[file.path]
    }
    console.log(PLUGIN_NAME + ': handleResolve: ' + JSON.stringify(logStats))

    let [links, unresolvedLinks] = this.getLinksForPath(file.path)
    update(
      file.path,
      file.stat.mtime,
      links,
      unresolvedLinks,
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
      newLinks: this.getLinksForPath(file.path),
      links: this.data.linkIndex[file.path],
      unresolvedLinks: this.data.unresolvedLinkIndex[file.path]
    }
    console.log(PLUGIN_NAME + ': handleRename: ' + JSON.stringify(logStats))

    if (modTime === undefined) {
      return
    }

    let [links, unresolvedLinks] = this.getLinksForPath(file.path)
    rename(
      file.path,
      oldPath,
      modTime,
      links, 
      unresolvedLinks,
      this.data
    )

    await this.saveData();
    this.view.redraw()
  };
            
  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    if (!this.isMarkdown(file.path)) return;

    const logStats = {
      path: file.path,
      newLinks: this.getLinksForPath(file.path),
      links: this.data.linkIndex[file.path],
      unresolvedLinks: this.data.unresolvedLinkIndex[file.path]
    }
    console.log(PLUGIN_NAME + ': handleDelete: ' + JSON.stringify(logStats))
    remove(file.path, this.data)
    await this.saveData();
    this.view.redraw();
  };
      
  /**
   * Returns [[resolved links], [unresolved links]]
   */
  private readonly getLinksForPath = (path: PathStr) => {
    let links = app.metadataCache.resolvedLinks[path];
    let unresolvedLinks = app.metadataCache.unresolvedLinks[path]
    return [
      links !== undefined ? Object.keys(links) : [],
      unresolvedLinks !== undefined ? Object.keys(unresolvedLinks) : []
    ]
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
